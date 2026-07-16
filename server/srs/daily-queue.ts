import { and, asc, count, eq, gt, inArray, lte, or } from "drizzle-orm"

import { getDb } from "@/db"
import { phrases, userCards, users } from "@/db/schema"
import { learningCefrLevels } from "@/server/content/cefr"
import { newFsrsCard } from "@/server/srs/fsrs"
import { dailyNewCardLimit, dailyQueuePolicy } from "@/server/srs/queue-policy"

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
  returnGapDays: number
  now?: Date
}) {
  const db = getDb()
  const now = input.now ?? new Date()

  if (input.episodeId) {
    await ensureEpisodeCards({
      userId: input.userId,
      episodeId: input.episodeId,
      now,
    })
  }

  const [user] = await db
    .select({ levelEstimate: users.levelEstimate })
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1)

  const { gapDays, isReturnDay, reviewLimit, mode } = dailyQueuePolicy(
    input.returnGapDays
  )

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
  const newCardLimit = dailyNewCardLimit({
    isReturnDay,
    pauseNewCards,
    reviewLimit,
    shownReviews: reviews.length,
  })
  const newCards =
    newCardLimit === 0
      ? []
      : await db
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
          .limit(newCardLimit)

  return {
    mode,
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
