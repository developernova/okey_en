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
import { extractPhrases } from "@/server/content/openrouter"
import {
  countLexemes,
  normalizePhrase,
  transcriptDurationSeconds,
} from "@/server/content/text"
import type { ImportEpisodeInput } from "@/server/content/types"
import { getYoutubeTranscript } from "@/server/content/youtube-transcript"
import { AppError, toErrorMessage } from "@/server/shared/errors"

export const IMPORT_PROMPT_VERSION = "episode-phrases-v3-lexical-units"

export async function importEpisode(
  input: ImportEpisodeInput,
  options: { existingJobId?: string } = {}
) {
  const db = getDb()
  let jobId = options.existingJobId
  let jobMetadata: Record<string, unknown> = {}
  if (!jobId) {
    const youtubeIdForJob = input.youtubeUrl.slice(0, 200)
    const [job] = await db
      .insert(ingestionJobs)
      .values({
        youtubeId: youtubeIdForJob,
        status: "processing",
        model: env().OPENROUTER_MODEL,
        promptVersion: IMPORT_PROMPT_VERSION,
        startedAt: new Date(),
      })
      .returning({ id: ingestionJobs.id })
    jobId = job.id
  } else {
    const [existingJob] = await db
      .select({ metadata: ingestionJobs.metadata })
      .from(ingestionJobs)
      .where(eq(ingestionJobs.id, jobId))
      .limit(1)
    jobMetadata = existingJob?.metadata ?? {}
  }

  try {
    const { youtubeId, segments } = await getYoutubeTranscript(
      input.youtubeUrl,
      input.transcriptLanguage
    )
    const extracted = await extractPhrases({
      segments,
      maxPhrases: input.maxPhrases,
    })

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
          transcriptLanguage: input.transcriptLanguage,
          ingestionStatus: "processing",
        })
        .onConflictDoUpdate({
          target: episodes.youtubeId,
          set: {
            programId: program.id,
            title: input.title,
            sequenceNumber: input.sequenceNumber,
            durationSeconds,
            transcriptLanguage: input.transcriptLanguage,
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
        finishedAt: new Date(),
        metadata: { ...jobMetadata, ...result },
      })
      .where(eq(ingestionJobs.id, jobId))

    return { jobId, ...result }
  } catch (error) {
    await db
      .update(ingestionJobs)
      .set({
        status: "failed",
        error: toErrorMessage(error).slice(0, 5_000),
        finishedAt: new Date(),
      })
      .where(
        and(eq(ingestionJobs.id, jobId), eq(ingestionJobs.status, "processing"))
      )
    throw error
  }
}
