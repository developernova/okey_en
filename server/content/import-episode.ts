import { and, eq } from "drizzle-orm"

import { getDb } from "@/db"
import {
  episodeLexemes,
  episodes,
  ingestionJobs,
  phrases as phrasesTable,
  programs,
  transcriptSegments,
} from "@/db/schema"
import { env } from "@/server/config/env"
import { cefrRange } from "@/server/content/cefr"
import {
  addImportLlmUsage,
  EMPTY_IMPORT_LLM_USAGE,
  extractPhrases,
  isRetryableOpenAiError,
  type ImportLlmUsage,
} from "@/server/content/openai"
import {
  countLexemes,
  normalizePhrase,
  transcriptDurationSeconds,
} from "@/server/content/text"
import type { ImportEpisodeInput } from "@/server/content/types"
import {
  getYoutubeTranscript,
  extractYoutubeId,
  isRetryableYoutubeTranscriptError,
} from "@/server/content/youtube-transcript"
import { AppError, toErrorMessage } from "@/server/shared/errors"

export const IMPORT_PROMPT_VERSION = "episode-phrases-v3-lexical-units"
export const MAX_IMPORT_ATTEMPTS = 5

export function retryableImportError(error: unknown) {
  if (
    isRetryableYoutubeTranscriptError(error) ||
    isRetryableOpenAiError(error)
  ) {
    return error
  }
  return null
}

export function importRetryDelayMs(
  attemptCount: number,
  queueBlocking: boolean,
  random = Math.random
) {
  const base = queueBlocking ? 10 * 60_000 : 30_000
  const exponential = Math.min(
    base * 2 ** Math.max(0, attemptCount - 1),
    6 * 60 * 60_000
  )
  const jitter = 0.8 + random() * 0.4
  return Math.round(exponential * jitter)
}

export function shouldRetryImport(
  error: unknown,
  attemptCount: number,
  isQueuedJob: boolean
) {
  return (
    isQueuedJob &&
    retryableImportError(error) !== null &&
    attemptCount < MAX_IMPORT_ATTEMPTS
  )
}

export async function importEpisode(
  input: ImportEpisodeInput,
  options: { existingJobId?: string } = {}
) {
  const db = getDb()
  let jobId = options.existingJobId
  let jobMetadata: Record<string, unknown> = {}
  let jobAttemptCount = 1
  let usage: ImportLlmUsage = EMPTY_IMPORT_LLM_USAGE
  if (!jobId) {
    const youtubeIdForJob =
      extractYoutubeId(input.youtubeUrl) || input.youtubeUrl.slice(0, 200)
    const [job] = await db
      .insert(ingestionJobs)
      .values({
        youtubeId: youtubeIdForJob,
        status: "processing",
        model: env().OPENAI_TEXT_MODEL,
        promptVersion: IMPORT_PROMPT_VERSION,
        attemptCount: 1,
        startedAt: new Date(),
      })
      .onConflictDoNothing()
      .returning({ id: ingestionJobs.id })
    if (!job) {
      throw new AppError(
        "This video is already queued for import",
        409,
        "IMPORT_ALREADY_QUEUED"
      )
    }
    jobId = job.id
  } else {
    await db
      .update(ingestionJobs)
      .set({ model: env().OPENAI_TEXT_MODEL })
      .where(eq(ingestionJobs.id, jobId))
    const [existingJob] = await db
      .select({
        metadata: ingestionJobs.metadata,
        attemptCount: ingestionJobs.attemptCount,
        promptTokens: ingestionJobs.promptTokens,
        completionTokens: ingestionJobs.completionTokens,
        totalTokens: ingestionJobs.totalTokens,
        costUsd: ingestionJobs.costUsd,
      })
      .from(ingestionJobs)
      .where(eq(ingestionJobs.id, jobId))
      .limit(1)
    jobMetadata = existingJob?.metadata ?? {}
    jobAttemptCount = existingJob?.attemptCount ?? 1
    usage = existingJob
      ? {
          promptTokens: existingJob.promptTokens,
          completionTokens: existingJob.completionTokens,
          totalTokens: existingJob.totalTokens,
          costUsd: existingJob.costUsd,
        }
      : EMPTY_IMPORT_LLM_USAGE
  }

  try {
    const { youtubeId, language, segments } = await getYoutubeTranscript(
      input.youtubeUrl,
      input.transcriptLanguage
    )
    const extraction = await extractPhrases({
      segments,
      maxPhrases: input.maxPhrases,
      onUsage: async (chunkUsage) => {
        usage = addImportLlmUsage(usage, chunkUsage)
        await db
          .update(ingestionJobs)
          .set({
            promptTokens: usage.promptTokens,
            completionTokens: usage.completionTokens,
            totalTokens: usage.totalTokens,
            costUsd: usage.costUsd,
          })
          .where(eq(ingestionJobs.id, jobId))
      },
    })
    const extracted = extraction.phrases

    if (extracted.length < 3) {
      throw new AppError(
        "Too few verified phrases were extracted",
        422,
        "INSUFFICIENT_PHRASES",
        { count: extracted.length }
      )
    }

    const durationSeconds =
      input.durationSeconds ?? transcriptDurationSeconds(segments)
    const lexemeCounts = countLexemes(segments)

    const result = await db.transaction(async (tx) => {
      const [program] = await tx
        .insert(programs)
        .values(input.program)
        .onConflictDoUpdate({
          target: programs.slug,
          set: {
            title: input.program.title,
            description: input.program.description,
          },
        })
        .returning({ id: programs.id })

      const [episode] = await tx
        .insert(episodes)
        .values({
          programId: program.id,
          youtubeId,
          title: input.title,
          sequenceNumber: input.sequenceNumber,
          durationSeconds,
          transcriptLanguage: language,
          ingestionStatus: "processing",
        })
        .onConflictDoUpdate({
          target: episodes.youtubeId,
          set: {
            programId: program.id,
            title: input.title,
            sequenceNumber: input.sequenceNumber,
            durationSeconds,
            transcriptLanguage: language,
            ingestionStatus: "processing",
            updatedAt: new Date(),
          },
        })
        .returning({ id: episodes.id })

      await tx
        .delete(transcriptSegments)
        .where(eq(transcriptSegments.episodeId, episode.id))
      await tx
        .delete(episodeLexemes)
        .where(eq(episodeLexemes.episodeId, episode.id))

      await tx.insert(transcriptSegments).values(
        segments.map((segment) => ({
          episodeId: episode.id,
          segmentIndex: segment.index,
          offsetMs: segment.offsetMs,
          durationMs: segment.durationMs,
          text: segment.text,
          normalizedText: segment.normalizedText,
        }))
      )

      if (lexemeCounts.length > 0) {
        await tx
          .insert(episodeLexemes)
          .values(
            lexemeCounts.map((lexeme) => ({ episodeId: episode.id, ...lexeme }))
          )
      }

      await tx
        .update(phrasesTable)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(phrasesTable.episodeId, episode.id))

      for (const phrase of extracted) {
        const normalized = normalizePhrase(phrase.phrase)
        const source = segments.find(
          (segment) => segment.index === phrase.segmentIndex
        )
        if (!source) continue

        await tx
          .insert(phrasesTable)
          .values({
            episodeId: episode.id,
            phrase: phrase.phrase,
            normalizedPhrase: normalized,
            lemma: phrase.lemma,
            translationRu: phrase.translationRu,
            contextSentence: phrase.contextSentence,
            cefr: phrase.cefr,
            segmentIndex: phrase.segmentIndex,
            offsetMs: source.offsetMs,
            confidence: phrase.confidence,
            rationale: phrase.rationale,
            isActive: true,
          })
          .onConflictDoUpdate({
            target: [phrasesTable.episodeId, phrasesTable.normalizedPhrase],
            set: {
              phrase: phrase.phrase,
              lemma: phrase.lemma,
              translationRu: phrase.translationRu,
              contextSentence: phrase.contextSentence,
              cefr: phrase.cefr,
              segmentIndex: phrase.segmentIndex,
              offsetMs: source.offsetMs,
              confidence: phrase.confidence,
              rationale: phrase.rationale,
              isActive: true,
              updatedAt: new Date(),
            },
          })
      }

      const storedLevels = await tx
        .select({ cefr: phrasesTable.cefr })
        .from(phrasesTable)
        .innerJoin(episodes, eq(episodes.id, phrasesTable.episodeId))
        .where(
          and(
            eq(episodes.programId, program.id),
            eq(phrasesTable.isActive, true)
          )
        )
      const programRange = cefrRange(storedLevels.map((item) => item.cefr))
      if (programRange) {
        await tx
          .update(programs)
          .set({
            levelMin: programRange.min,
            levelMax: programRange.max,
          })
          .where(eq(programs.id, program.id))
      }

      await tx
        .update(episodes)
        .set({ ingestionStatus: "ready", updatedAt: new Date() })
        .where(eq(episodes.id, episode.id))

      return {
        episodeId: episode.id,
        youtubeId,
        segmentCount: segments.length,
        phraseCount: extracted.length,
        lexemeCount: lexemeCounts.length,
        transcriptLanguage: language,
        programLevelMin: programRange?.min ?? input.program.levelMin,
        programLevelMax: programRange?.max ?? input.program.levelMax,
      }
    })

    await db
      .update(ingestionJobs)
      .set({
        episodeId: result.episodeId,
        youtubeId: result.youtubeId,
        status: "ready",
        attemptCount: jobAttemptCount,
        nextAttemptAt: null,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
        costUsd: usage.costUsd,
        finishedAt: new Date(),
        metadata: { ...jobMetadata, ...result, usage },
      })
      .where(eq(ingestionJobs.id, jobId))

    return { jobId, ...result }
  } catch (error) {
    const errorMessage = toErrorMessage(error).slice(0, 5_000)
    const canRetry = shouldRetryImport(
      error,
      jobAttemptCount,
      Boolean(options.existingJobId)
    )

    const retryableError = retryableImportError(error)
    if (canRetry && retryableError) {
      const nextAttemptAt = new Date(
        Date.now() +
          importRetryDelayMs(jobAttemptCount, retryableError.queueBlocking)
      )
      await db
        .update(ingestionJobs)
        .set({
          status: "pending",
          error: errorMessage,
          nextAttemptAt,
          startedAt: null,
          finishedAt: null,
        })
        .where(
          and(
            eq(ingestionJobs.id, jobId),
            eq(ingestionJobs.status, "processing")
          )
        )
    } else {
      await db
        .update(ingestionJobs)
        .set({
          status: "failed",
          error: errorMessage,
          nextAttemptAt: null,
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          totalTokens: usage.totalTokens,
          costUsd: usage.costUsd,
          finishedAt: new Date(),
        })
        .where(
          and(
            eq(ingestionJobs.id, jobId),
            eq(ingestionJobs.status, "processing")
          )
        )
    }
    throw error
  }
}
