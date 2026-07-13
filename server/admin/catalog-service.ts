import {
  and,
  asc,
  count,
  countDistinct,
  desc,
  eq,
  gt,
  lt,
  ne,
} from "drizzle-orm"

import { getDb } from "@/db"
import {
  episodes,
  dailyPlans,
  ingestionJobs,
  phrases,
  programs,
  transcriptSegments,
  userProgramProgress,
  users,
} from "@/db/schema"
import type {
  CreateProgramInput,
  UpdateEpisodeInput,
  UpdateProgramInput,
} from "@/server/admin/catalog-schemas"
import { AppError } from "@/server/shared/errors"

export async function listAdminCatalog() {
  const db = getDb()
  const [programRows, episodeRows, jobs, userCountRows, failedJobRows] =
    await Promise.all([
      db
        .select({
          id: programs.id,
          slug: programs.slug,
          title: programs.title,
          description: programs.description,
          levelMin: programs.levelMin,
          levelMax: programs.levelMax,
          isActive: programs.isActive,
          createdAt: programs.createdAt,
        })
        .from(programs)
        .orderBy(desc(programs.createdAt)),
      db
        .select({
          id: episodes.id,
          programId: episodes.programId,
          youtubeId: episodes.youtubeId,
          title: episodes.title,
          sequenceNumber: episodes.sequenceNumber,
          durationSeconds: episodes.durationSeconds,
          transcriptLanguage: episodes.transcriptLanguage,
          ingestionStatus: episodes.ingestionStatus,
          isActive: episodes.isActive,
          phraseCount: countDistinct(phrases.id),
          segmentCount: countDistinct(transcriptSegments.id),
          updatedAt: episodes.updatedAt,
        })
        .from(episodes)
        .leftJoin(
          phrases,
          and(eq(phrases.episodeId, episodes.id), eq(phrases.isActive, true))
        )
        .leftJoin(
          transcriptSegments,
          eq(transcriptSegments.episodeId, episodes.id)
        )
        .groupBy(episodes.id)
        .orderBy(asc(episodes.sequenceNumber)),
      db
        .select({
          id: ingestionJobs.id,
          episodeId: ingestionJobs.episodeId,
          source: ingestionJobs.youtubeId,
          status: ingestionJobs.status,
          error: ingestionJobs.error,
          model: ingestionJobs.model,
          startedAt: ingestionJobs.startedAt,
          finishedAt: ingestionJobs.finishedAt,
          createdAt: ingestionJobs.createdAt,
        })
        .from(ingestionJobs)
        .orderBy(desc(ingestionJobs.createdAt))
        .limit(20),
      db.select({ count: count() }).from(users),
      db
        .select({ count: count() })
        .from(ingestionJobs)
        .where(eq(ingestionJobs.status, "failed")),
    ])

  const episodesByProgram = new Map<string, typeof episodeRows>()
  for (const episode of episodeRows) {
    const current = episodesByProgram.get(episode.programId) ?? []
    current.push(episode)
    episodesByProgram.set(episode.programId, current)
  }

  const catalogPrograms = programRows.map((program) => ({
    ...program,
    episodes: episodesByProgram.get(program.id) ?? [],
  }))
  const publishedEpisodes = episodeRows.filter(
    (episode) => episode.isActive && episode.ingestionStatus === "ready"
  ).length

  return {
    stats: {
      users: userCountRows[0]?.count ?? 0,
      programs: programRows.length,
      activePrograms: programRows.filter((program) => program.isActive).length,
      episodes: episodeRows.length,
      publishedEpisodes,
      failedImports: failedJobRows[0]?.count ?? 0,
    },
    programs: catalogPrograms,
    jobs,
  }
}

export async function createProgram(input: CreateProgramInput) {
  const db = getDb()
  const [duplicate] = await db
    .select({ id: programs.id })
    .from(programs)
    .where(eq(programs.slug, input.slug))
    .limit(1)
  if (duplicate) {
    throw new AppError("Program slug already exists", 409, "PROGRAM_EXISTS")
  }

  const [program] = await db.insert(programs).values(input).returning()
  return program
}

export async function updateProgram(
  programId: string,
  input: UpdateProgramInput
) {
  const db = getDb()
  const [current] = await db
    .select({ levelMin: programs.levelMin, levelMax: programs.levelMax })
    .from(programs)
    .where(eq(programs.id, programId))
    .limit(1)
  if (!current) {
    throw new AppError("Program not found", 404, "PROGRAM_NOT_FOUND")
  }

  if (input.slug) {
    const [duplicate] = await db
      .select({ id: programs.id })
      .from(programs)
      .where(and(eq(programs.slug, input.slug), ne(programs.id, programId)))
      .limit(1)
    if (duplicate) {
      throw new AppError("Program slug already exists", 409, "PROGRAM_EXISTS")
    }
  }

  const levels = ["A1", "A2", "B1", "B2", "C1"]
  const levelMin = input.levelMin ?? current.levelMin
  const levelMax = input.levelMax ?? current.levelMax
  if (levels.indexOf(levelMin) > levels.indexOf(levelMax)) {
    throw new AppError("Invalid program level range", 422, "INVALID_LEVELS")
  }

  const [program] = await db
    .update(programs)
    .set(input)
    .where(eq(programs.id, programId))
    .returning()
  return program
}

export async function updateEpisode(
  episodeId: string,
  input: UpdateEpisodeInput
) {
  const db = getDb()
  const [current] = await db
    .select({
      id: episodes.id,
      programId: episodes.programId,
      sequenceNumber: episodes.sequenceNumber,
    })
    .from(episodes)
    .where(eq(episodes.id, episodeId))
    .limit(1)
  if (!current) {
    throw new AppError("Episode not found", 404, "EPISODE_NOT_FOUND")
  }

  if (
    input.sequenceNumber !== undefined &&
    input.sequenceNumber !== current.sequenceNumber
  ) {
    const [duplicate] = await db
      .select({ id: episodes.id })
      .from(episodes)
      .where(
        and(
          eq(episodes.programId, current.programId),
          eq(episodes.sequenceNumber, input.sequenceNumber),
          ne(episodes.id, episodeId)
        )
      )
      .limit(1)
    if (duplicate) {
      throw new AppError(
        "Episode sequence number is already used in this program",
        409,
        "EPISODE_SEQUENCE_EXISTS"
      )
    }
  }

  const [episode] = await db
    .update(episodes)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(episodes.id, episodeId))
    .returning()
  return episode
}

export async function deleteEpisodePermanently(episodeId: string) {
  return getDb().transaction(async (tx) => {
    const [current] = await tx
      .select({
        id: episodes.id,
        programId: episodes.programId,
        sequenceNumber: episodes.sequenceNumber,
        youtubeId: episodes.youtubeId,
      })
      .from(episodes)
      .where(eq(episodes.id, episodeId))
      .for("update")
      .limit(1)
    if (!current) {
      throw new AppError("Episode not found", 404, "EPISODE_NOT_FOUND")
    }

    let [replacement] = await tx
      .select({ id: episodes.id })
      .from(episodes)
      .where(
        and(
          eq(episodes.programId, current.programId),
          gt(episodes.sequenceNumber, current.sequenceNumber),
          eq(episodes.ingestionStatus, "ready"),
          eq(episodes.isActive, true)
        )
      )
      .orderBy(asc(episodes.sequenceNumber))
      .limit(1)
    if (!replacement) {
      ;[replacement] = await tx
        .select({ id: episodes.id })
        .from(episodes)
        .where(
          and(
            eq(episodes.programId, current.programId),
            lt(episodes.sequenceNumber, current.sequenceNumber),
            eq(episodes.ingestionStatus, "ready"),
            eq(episodes.isActive, true)
          )
        )
        .orderBy(desc(episodes.sequenceNumber))
        .limit(1)
    }

    await tx
      .update(userProgramProgress)
      .set({
        currentEpisodeId: replacement?.id ?? null,
        updatedAt: new Date(),
      })
      .where(eq(userProgramProgress.currentEpisodeId, episodeId))

    // daily_plans has a restrictive FK by design; hard deletion explicitly
    // removes the plan and its cascade-owned items before removing the episode.
    await tx.delete(dailyPlans).where(eq(dailyPlans.episodeId, episodeId))
    await tx
      .delete(ingestionJobs)
      .where(eq(ingestionJobs.youtubeId, current.youtubeId))
    await tx.delete(episodes).where(eq(episodes.id, episodeId))

    return {
      id: episodeId,
      youtubeId: current.youtubeId,
      replacementEpisodeId: replacement?.id ?? null,
    }
  })
}

export async function getAdminEpisodeDetail(episodeId: string) {
  const db = getDb()
  const [episode] = await db
    .select({
      id: episodes.id,
      programId: episodes.programId,
      programTitle: programs.title,
      youtubeId: episodes.youtubeId,
      title: episodes.title,
      sequenceNumber: episodes.sequenceNumber,
      durationSeconds: episodes.durationSeconds,
      transcriptLanguage: episodes.transcriptLanguage,
      ingestionStatus: episodes.ingestionStatus,
      isActive: episodes.isActive,
      publishedAt: episodes.publishedAt,
      createdAt: episodes.createdAt,
      updatedAt: episodes.updatedAt,
    })
    .from(episodes)
    .innerJoin(programs, eq(programs.id, episodes.programId))
    .where(eq(episodes.id, episodeId))
    .limit(1)
  if (!episode) {
    throw new AppError("Episode not found", 404, "EPISODE_NOT_FOUND")
  }

  const [segments, extractedPhrases, jobs] = await Promise.all([
    db
      .select({
        id: transcriptSegments.id,
        index: transcriptSegments.segmentIndex,
        offsetMs: transcriptSegments.offsetMs,
        durationMs: transcriptSegments.durationMs,
        text: transcriptSegments.text,
      })
      .from(transcriptSegments)
      .where(eq(transcriptSegments.episodeId, episodeId))
      .orderBy(asc(transcriptSegments.segmentIndex)),
    db
      .select({
        id: phrases.id,
        phrase: phrases.phrase,
        lemma: phrases.lemma,
        translationRu: phrases.translationRu,
        contextSentence: phrases.contextSentence,
        cefr: phrases.cefr,
        segmentIndex: phrases.segmentIndex,
        offsetMs: phrases.offsetMs,
        confidence: phrases.confidence,
        rationale: phrases.rationale,
        isActive: phrases.isActive,
      })
      .from(phrases)
      .where(eq(phrases.episodeId, episodeId))
      .orderBy(asc(phrases.offsetMs)),
    db
      .select({
        id: ingestionJobs.id,
        status: ingestionJobs.status,
        error: ingestionJobs.error,
        model: ingestionJobs.model,
        promptVersion: ingestionJobs.promptVersion,
        metadata: ingestionJobs.metadata,
        startedAt: ingestionJobs.startedAt,
        finishedAt: ingestionJobs.finishedAt,
        createdAt: ingestionJobs.createdAt,
      })
      .from(ingestionJobs)
      .where(eq(ingestionJobs.episodeId, episodeId))
      .orderBy(desc(ingestionJobs.createdAt))
      .limit(10),
  ])

  return {
    episode: {
      ...episode,
      youtubeUrl: `https://www.youtube.com/watch?v=${episode.youtubeId}`,
    },
    transcript: segments,
    phrases: extractedPhrases,
    jobs,
  }
}
