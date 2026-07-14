import { and, asc, count, eq, gt, inArray, lte, or } from "drizzle-orm"

import { getDb } from "@/db"
import { phrases, userCards, users } from "@/db/schema"
import { learningCefrLevels } from "@/server/content/cefr"
import { newFsrsCard } from "@/server/srs/fsrs"

function daysSince(value: Date | null, now: Date) {
  if (!value) return 0
  return Math.max(0, Math.floor((now.getTime() - value.getTime()) / 86_400_000))
}

function availableToUserCondition() {
  return or(eq(phrases.isActive, true), eq(userCards.isPersonal, true))
}

export async function ensureEpisodeCards(input: {
  userId: string
  episodeId: string
  now?: Date
}) {
  const db = getDb()
  const now = input.now ?? new Date()
  const [user] = await db
    .select({ levelEstimate: users.levelEstimate })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1)
  const targetLevels = learningCefrLevels(user?.levelEstimate)
  const episodePhrases = await db
    .select({ id: phrases.id })
    .from(phrases)
    .where(
      and(
        eq(phrases.episodeId, input.episodeId),
        eq(phrases.isActive, true),
        inArray(phrases.cefr, targetLevels)
      )
    )
    .orderBy(asc(phrases.offsetMs))

  if (episodePhrases.length === 0) return 0
  const empty = newFsrsCard(now)

  const inserted = await db
    .insert(userCards)
    .values(
      episodePhrases.map((phrase) => ({
        userId: input.userId,
        phraseId: phrase.id,
        due: empty.due,
        stability: empty.stability,
        difficulty: empty.difficulty,
        scheduledDays: empty.scheduled_days,
        learningSteps: empty.learning_steps,
        reps: empty.reps,
        lapses: empty.lapses,
        state: empty.state,
      }))
    )
    .onConflictDoNothing({ target: [userCards.userId, userCards.phraseId] })
    .returning({ id: userCards.id })

  return inserted.length
}

export async function buildDailyQueue(input: {
  userId: string
  episodeId?: string
  now?: Date
}) {
  const db = getDb()
  const now = input.now ?? new Date()

  if (input.episodeId) {
    await ensureEpisodeCards({ ...input, episodeId: input.episodeId, now })
  }

  const [user] = await db
    .select({
      lastActiveAt: users.lastActiveAt,
      levelEstimate: users.levelEstimate,
    })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1)

  const gapDays = daysSince(user?.lastActiveAt ?? null, now)
  const isReturnDay = gapDays >= 2
  const reviewLimit = isReturnDay ? 25 : 100

  const [reviewCount] = await db
    .select({ value: count() })
    .from(userCards)
    .innerJoin(phrases, eq(phrases.id, userCards.phraseId))
    .where(
      and(
        eq(userCards.userId, input.userId),
        eq(userCards.isSuspended, false),
        availableToUserCondition(),
        gt(userCards.reps, 0),
        lte(userCards.due, now)
      )
    )

  const pauseNewCards = isReturnDay || reviewCount.value > 25
  const targetLevels = learningCefrLevels(user?.levelEstimate)

  const reviews = await db
    .select({
      id: userCards.id,
      due: userCards.due,
      reps: userCards.reps,
      phrase: phrases.phrase,
      translationRu: phrases.translationRu,
      contextSentence: phrases.contextSentence,
      offsetMs: phrases.offsetMs,
    })
    .from(userCards)
    .innerJoin(phrases, eq(phrases.id, userCards.phraseId))
    .where(
      and(
        eq(userCards.userId, input.userId),
        eq(userCards.isSuspended, false),
        availableToUserCondition(),
        gt(userCards.reps, 0),
        lte(userCards.due, now)
      )
    )
    .orderBy(asc(userCards.due))
    .limit(reviewLimit)

  const priorityCutoff = new Date(1)
  const newCards = await db
    .select({
      id: userCards.id,
      due: userCards.due,
      reps: userCards.reps,
      phrase: phrases.phrase,
      translationRu: phrases.translationRu,
      contextSentence: phrases.contextSentence,
      offsetMs: phrases.offsetMs,
    })
    .from(userCards)
    .innerJoin(phrases, eq(phrases.id, userCards.phraseId))
    .where(
      and(
        eq(userCards.userId, input.userId),
        eq(userCards.isSuspended, false),
        availableToUserCondition(),
        pauseNewCards
          ? lte(userCards.due, priorityCutoff)
          : or(
              inArray(phrases.cefr, targetLevels),
              lte(userCards.due, priorityCutoff)
            ),
        eq(userCards.reps, 0),
        lte(userCards.due, now)
      )
    )
    .orderBy(asc(userCards.due), asc(phrases.offsetMs))
    .limit(pauseNewCards ? 5 : 15)

  return {
    mode: isReturnDay ? (gapDays >= 14 ? "soft_restart" : "return") : "normal",
    gapDays,
    totalDueReviews: reviewCount.value,
    shownReviews: reviews.length,
    newCardsPaused: pauseNewCards,
    estimatedMinutes: Math.max(
      1,
      Math.ceil((reviews.length + newCards.length) * 0.4)
    ),
    message: isReturnDay ? "С возвращением. Сегодня лёгкий день." : undefined,
    cards: [...reviews, ...newCards],
  }
}
