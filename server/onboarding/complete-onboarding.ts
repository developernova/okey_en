import { and, asc, eq, inArray, sql } from "drizzle-orm"

import { getDb } from "@/db"
import {
  episodes,
  lexemes,
  programs,
  userLexemes,
  userProgramProgress,
  users,
} from "@/db/schema"

const levels = ["A1", "A2", "B1", "B2"] as const
export type PlacementLevel = (typeof levels)[number]

function levelDistance(level: PlacementLevel, min: string, max: string) {
  const target = levels.indexOf(level)
  const minimum = Math.max(0, levels.indexOf(min as PlacementLevel))
  const maximumIndex = levels.indexOf(max as PlacementLevel)
  const maximum = maximumIndex === -1 ? levels.length - 1 : maximumIndex
  if (target < minimum) return minimum - target
  if (target > maximum) return target - maximum
  return 0
}

export async function completeOnboarding(
  userId: string,
  level: PlacementLevel
) {
  const db = getDb()
  const levelIndex = levels.indexOf(level)
  const knownLevels = levels.slice(0, levelIndex + 1)
  const vocabulary = await db
    .select({ lemma: lexemes.lemma, cefr: lexemes.cefr })
    .from(lexemes)
    .where(inArray(lexemes.cefr, knownLevels))

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
  const recommended = firstEpisodeByProgram.sort(
    (a, b) =>
      levelDistance(level, a.levelMin, a.levelMax) -
      levelDistance(level, b.levelMin, b.levelMax)
  )[0]

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ levelEstimate: level, updatedAt: new Date() })
      .where(eq(users.id, userId))

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
            currentEpisodeId: recommended.episodeId,
            isActive: true,
            updatedAt: new Date(),
          },
        })
    }

    for (let index = 0; index < vocabulary.length; index += 500) {
      const batch = vocabulary.slice(index, index + 500)
      if (batch.length === 0) continue
      await tx
        .insert(userLexemes)
        .values(
          batch.map((item) => ({
            userId,
            lemma: item.lemma,
            source: "placement_test" as const,
            confidence: item.cefr === level ? 0.82 : 0.95,
          }))
        )
        .onConflictDoUpdate({
          target: [userLexemes.userId, userLexemes.lemma],
          set: {
            source: "placement_test",
            confidence: sql`excluded.confidence`,
            updatedAt: new Date(),
          },
        })
    }
  })

  return {
    level,
    knownLexemes: vocabulary.length,
    program: recommended
      ? { id: recommended.programId, title: recommended.programTitle }
      : null,
  }
}
