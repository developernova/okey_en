import { and, asc, desc, eq, gt } from "drizzle-orm"

import { getDb } from "@/db"
import { episodes, phrases, programs, userCards } from "@/db/schema"
import { requireUserId } from "@/server/auth/user-context"
import { jsonError } from "@/server/shared/http"

export async function GET(request: Request) {
  try {
    const userId = await requireUserId(request)
    const db = getDb()
    const reviewed = await db
      .select({
        id: userCards.id,
        phrase: phrases.phrase,
        translationRu: phrases.translationRu,
        contextSentence: phrases.contextSentence,
        due: userCards.due,
        difficulty: userCards.difficulty,
        lapses: userCards.lapses,
        reps: userCards.reps,
        episodeTitle: episodes.title,
        programTitle: programs.title,
      })
      .from(userCards)
      .innerJoin(phrases, eq(phrases.id, userCards.phraseId))
      .innerJoin(episodes, eq(episodes.id, phrases.episodeId))
      .innerJoin(programs, eq(programs.id, episodes.programId))
      .where(
        and(
          eq(userCards.userId, userId),
          eq(userCards.isSuspended, false),
          gt(userCards.reps, 0)
        )
      )
      .orderBy(
        desc(userCards.lapses),
        desc(userCards.difficulty),
        asc(userCards.due)
      )
      .limit(60)

    const data = reviewed.map((item) => ({
      ...item,
      source: "review" as const,
    }))

    return Response.json({ data })
  } catch (error) {
    return jsonError(error)
  }
}
