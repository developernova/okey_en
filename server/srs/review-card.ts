import { and, eq, sql } from "drizzle-orm"

import { getDb } from "@/db"
import { phrases, reviewLogs, userCards, userLexemes, users } from "@/db/schema"
import { AppError } from "@/server/shared/errors"
import { reviewFsrsCard, type ReviewRating } from "@/server/srs/fsrs"

export function assertReviewOrder(lastReview: Date | null, answeredAt: Date) {
  if (lastReview && answeredAt.getTime() < lastReview.getTime()) {
    throw new AppError(
      "Review is older than the latest saved review",
      409,
      "OUT_OF_ORDER_REVIEW",
      {
        answeredAt: answeredAt.toISOString(),
        lastReview: lastReview.toISOString(),
      }
    )
  }
}

export async function reviewCard(input: {
  userId: string
  cardId: string
  rating: ReviewRating
  clientEventId?: string
  now?: Date
  activityAt?: Date
}) {
  const db = getDb()
  const now = input.now ?? new Date()
  const activityAt = input.activityAt ?? new Date()

  return db.transaction(async (tx) => {
    if (input.clientEventId) {
      const [existingReview] = await tx
        .select({
          cardId: reviewLogs.userCardId,
          due: reviewLogs.dueAfter,
          stability: reviewLogs.stabilityAfter,
          difficulty: reviewLogs.difficultyAfter,
          scheduledDays: reviewLogs.scheduledDaysAfter,
          state: reviewLogs.stateAfter,
        })
        .from(reviewLogs)
        .innerJoin(userCards, eq(userCards.id, reviewLogs.userCardId))
        .where(
          and(
            eq(reviewLogs.clientEventId, input.clientEventId),
            eq(userCards.userId, input.userId)
          )
        )
        .limit(1)

      if (existingReview) {
        return {
          ...existingReview,
          rating: input.rating,
          duplicate: true,
        }
      }
    }

    const [stored] = await tx
      .select({
        id: userCards.id,
        due: userCards.due,
        stability: userCards.stability,
        difficulty: userCards.difficulty,
        scheduledDays: userCards.scheduledDays,
        learningSteps: userCards.learningSteps,
        reps: userCards.reps,
        lapses: userCards.lapses,
        state: userCards.state,
        lastReview: userCards.lastReview,
        lemma: phrases.lemma,
      })
      .from(userCards)
      .innerJoin(phrases, eq(phrases.id, userCards.phraseId))
      .where(
        and(eq(userCards.id, input.cardId), eq(userCards.userId, input.userId))
      )
      .for("update")
      .limit(1)

    if (!stored) {
      throw new AppError("Card not found", 404, "CARD_NOT_FOUND")
    }

    assertReviewOrder(stored.lastReview, now)

    const result = reviewFsrsCard(stored, input.rating, now)

    await tx
      .update(userCards)
      .set({
        due: result.card.due,
        stability: result.card.stability,
        difficulty: result.card.difficulty,
        scheduledDays: result.card.scheduled_days,
        learningSteps: result.card.learning_steps,
        reps: result.card.reps,
        lapses: result.card.lapses,
        state: result.card.state,
        lastReview: result.card.last_review,
        updatedAt: now,
      })
      .where(eq(userCards.id, stored.id))

    await tx.insert(reviewLogs).values({
      clientEventId: input.clientEventId,
      userCardId: stored.id,
      rating: result.log.rating,
      reviewedAt: now,
      stateBefore: stored.state,
      stateAfter: result.card.state,
      dueBefore: stored.due,
      dueAfter: result.card.due,
      stabilityAfter: result.card.stability,
      difficultyAfter: result.card.difficulty,
      scheduledDaysAfter: result.card.scheduled_days,
    })

    const lexicalConfidence =
      input.rating === "good" ? 0.9 : input.rating === "hard" ? 0.65 : 0.2
    await tx
      .insert(userLexemes)
      .values({
        userId: input.userId,
        lemma: stored.lemma,
        source: "review",
        confidence: lexicalConfidence,
        learnedAt: input.rating === "good" ? now : null,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [userLexemes.userId, userLexemes.lemma],
        set: {
          source: "review",
          confidence: sql`excluded.confidence`,
          learnedAt: sql`excluded.learned_at`,
          updatedAt: now,
        },
      })

    await tx
      .update(users)
      .set({
        lastActiveAt: sql`greatest(coalesce(${users.lastActiveAt}, ${activityAt}), ${activityAt})`,
        updatedAt: activityAt,
      })
      .where(eq(users.id, input.userId))

    return {
      cardId: stored.id,
      rating: input.rating,
      due: result.card.due,
      state: result.card.state,
      scheduledDays: result.card.scheduled_days,
      stability: result.card.stability,
      difficulty: result.card.difficulty,
      duplicate: false,
    }
  })
}
