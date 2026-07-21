import { and, asc, eq, inArray, sql } from "drizzle-orm"

import { getDb } from "@/db"
import {
  episodes,
  episodeLexemes,
  lexemes,
  programs,
  userLexemes,
  userProgramProgress,
  users,
} from "@/db/schema"
import { frequencyWeightedEstimatedCoverage } from "@/server/progress/lexical-knowledge"

const courseLevels = ["A1", "A2", "B1", "B2", "C1", "C2"] as const
export type PlacementLevel = "A1" | "A2" | "B1" | "B2"

function levelDistance(level: PlacementLevel, min: string, max: string) {
  const target = courseLevels.indexOf(level)
  const minimumIndex = courseLevels.indexOf(
    min as (typeof courseLevels)[number]
  )
  const maximumIndex = courseLevels.indexOf(
    max as (typeof courseLevels)[number]
  )
  const minimum = minimumIndex === -1 ? 0 : minimumIndex
  const maximum = maximumIndex === -1 ? courseLevels.length - 1 : maximumIndex
  if (target < minimum) return minimum - target
  if (target > maximum) return target - maximum
  return 0
}

export async function completeOnboarding(
  userId: string,
  level: PlacementLevel
) {
  const db = getDb()
  const readyEpisodes = await db
    .select({
      episodeId: episodes.id,
      sequenceNumber: episodes.sequenceNumber,
      programId: programs.id,
      programTitle: programs.title,
      levelMin: programs.levelMin,
      levelMax: programs.levelMax,
    })
    .from(episodes)
    .innerJoin(programs, eq(programs.id, episodes.programId))
    .where(
      and(
        eq(episodes.ingestionStatus, "ready"),
        eq(episodes.isActive, true),
        eq(programs.isActive, true)
      )
    )
    .orderBy(asc(episodes.sequenceNumber))

  const firstEpisodeByProgram = [
    ...new Map(readyEpisodes.map((item) => [item.programId, item])).values(),
  ]
  const firstEpisodeIds = firstEpisodeByProgram.map((item) => item.episodeId)
  const episodeVocabulary =
    firstEpisodeIds.length > 0
      ? await db
          .select({
            episodeId: episodeLexemes.episodeId,
            lemma: episodeLexemes.lemma,
            frequency: episodeLexemes.frequency,
            cefr: lexemes.cefr,
          })
          .from(episodeLexemes)
          .leftJoin(lexemes, eq(lexemes.lemma, episodeLexemes.lemma))
          .where(inArray(episodeLexemes.episodeId, firstEpisodeIds))
      : []
  const coverage = (episodeId: string) =>
    frequencyWeightedEstimatedCoverage(
      episodeVocabulary.filter((item) => item.episodeId === episodeId),
      level
    )
  const recommended = firstEpisodeByProgram.sort((a, b) => {
    const byLevel =
      levelDistance(level, a.levelMin, a.levelMax) -
      levelDistance(level, b.levelMin, b.levelMax)
    if (byLevel !== 0) return byLevel
    const byCoverage =
      Math.abs(80 - coverage(a.episodeId)) -
      Math.abs(80 - coverage(b.episodeId))
    if (byCoverage !== 0) return byCoverage
    return a.programTitle.localeCompare(b.programTitle, "en")
  })[0]

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ levelEstimate: level, updatedAt: new Date() })
      .where(eq(users.id, userId))
    await tx
      .delete(userLexemes)
      .where(
        and(
          eq(userLexemes.userId, userId),
          eq(userLexemes.source, "placement_test")
        )
      )

    if (recommended) {
      await tx
        .update(userProgramProgress)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(userProgramProgress.userId, userId))

      await tx
        .insert(userProgramProgress)
        .values({
          userId,
          programId: recommended.programId,
          currentEpisodeId: recommended.episodeId,
          isActive: true,
        })
        .onConflictDoUpdate({
          target: [userProgramProgress.userId, userProgramProgress.programId],
          set: {
            currentEpisodeId: sql`coalesce(${userProgramProgress.currentEpisodeId}, excluded.current_episode_id)`,
            isActive: true,
            updatedAt: new Date(),
          },
        })
    }
  })

  return {
    level,
    knownLexemes: 0,
    program: recommended
      ? {
          id: recommended.programId,
          title: recommended.programTitle,
          coverage: coverage(recommended.episodeId),
        }
      : null,
  }
}
