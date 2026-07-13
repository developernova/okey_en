import { and, eq } from "drizzle-orm"

import { getDb } from "@/db"
import { reviewLogs, userCards, users } from "@/db/schema"
import { AppError } from "@/server/shared/errors"
import { reviewFsrsCard, type ReviewRating } from "@/server/srs/fsrs"

export async function reviewCard(input: {
  userId: string
  cardId: string
  rating: ReviewRating
  clientEventId?: string
  now?: Date
}) {
  const db = getDb()
  const now = input.now ?? new Date()

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
      .select()
      .from(userCards)
      .where(
        and(eq(userCards.id, input.cardId), eq(userCards.userId, input.userId))
      )
      .for("update")
      .limit(1)

    if (!stored) {
      throw new AppError("Card not found", 404, "CARD_NOT_FOUND")
    }

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

    await tx
      .update(users)
      .set({ lastActiveAt: now, updatedAt: now })
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
