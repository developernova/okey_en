import { and, eq, inArray, or } from "drizzle-orm"

import { getDb } from "@/db"
import { dailyPlanItems, phrases, reviewLogs, userCards } from "@/db/schema"
import type { DailyQueueCard } from "@/server/srs/daily-queue"

export type ReviewStepState =
  | {
      status: "available" | "completed"
      skipReason: null
      assignedCount: number
      reviewedCount: number
    }
  | {
      status: "skipped"
      skipReason: "no_cards"
      assignedCount: 0
      reviewedCount: 0
    }

export const noCardsReviewCompletionMetadata = {
  completionSource: "automatic",
  skipReason: "no_cards",
  reviewCount: 0,
} as const

export function userReviewCompletionMetadata(reviewCount: number) {
  return {
    completionSource: "user",
    reviewCount: Math.max(0, Math.floor(reviewCount)),
  } as const
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {}
}

export function hasReviewAssignment(metadata: Record<string, unknown>) {
  return Array.isArray(metadata.assignedCardIds)
}

export function assignedCardIdsFromMetadata(metadata: Record<string, unknown>) {
  if (!Array.isArray(metadata.assignedCardIds)) return []
  return [
    ...new Set(
      metadata.assignedCardIds.filter(
        (cardId): cardId is string => typeof cardId === "string"
      )
    ),
  ].slice(0, 500)
}

export function mergeReviewAssignment(
  reviewedCardIds: string[],
  candidateCardIds: string[]
) {
  return [...new Set([...reviewedCardIds, ...candidateCardIds])].slice(0, 500)
}

export function reviewCountFromMetadata(metadata: Record<string, unknown>) {
  const value = metadata.reviewCount
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0
}

function isNoCardsCompletion(metadata: Record<string, unknown>) {
  return (
    metadata.completionSource ===
      noCardsReviewCompletionMetadata.completionSource &&
    metadata.skipReason === noCardsReviewCompletionMetadata.skipReason
  )
}

export async function getOrCreateReviewAssignment(input: {
  dailyPlanId: string
  candidateCards: DailyQueueCard[]
  persist: boolean
  now?: Date
}) {
  const candidateIds = input.candidateCards.map((card) => card.id)

  return getDb().transaction(async (tx) => {
    const [item] = await tx
      .select({
        completedAt: dailyPlanItems.completedAt,
        metadata: dailyPlanItems.metadata,
      })
      .from(dailyPlanItems)
      .where(
        and(
          eq(dailyPlanItems.dailyPlanId, input.dailyPlanId),
          eq(dailyPlanItems.type, "review")
        )
      )
      .for("update")
      .limit(1)

    const metadata = record(item?.metadata)
    if (item?.completedAt || hasReviewAssignment(metadata) || !input.persist) {
      const storedAssignment = hasReviewAssignment(metadata)
        ? assignedCardIdsFromMetadata(metadata)
        : null
      return {
        completedAt: item?.completedAt ?? null,
        metadata,
        assignedCardIds:
          storedAssignment ?? (item?.completedAt ? [] : candidateIds),
      }
    }

    const reviewedRows = await tx
      .select({ cardId: reviewLogs.userCardId })
      .from(reviewLogs)
      .where(eq(reviewLogs.dailyPlanId, input.dailyPlanId))
    const assignedCardIds = mergeReviewAssignment(
      reviewedRows.map((row) => row.cardId),
      candidateIds
    )
    const nextMetadata = {
      ...metadata,
      assignedCardIds,
      assignedAt: (input.now ?? new Date()).toISOString(),
      assignedCount: assignedCardIds.length,
    }
    await tx
      .update(dailyPlanItems)
      .set({ metadata: nextMetadata })
      .where(
        and(
          eq(dailyPlanItems.dailyPlanId, input.dailyPlanId),
          eq(dailyPlanItems.type, "review")
        )
      )

    return {
      completedAt: null,
      metadata: nextMetadata,
      assignedCardIds,
    }
  })
}

export async function getAssignedReviewProgress(input: {
  userId: string
  dailyPlanId: string
  assignedCardIds: string[]
}) {
  if (input.assignedCardIds.length === 0) {
    return {
      assignedCount: 0,
      reviewedCount: 0,
      remainingCards: [] as DailyQueueCard[],
    }
  }

  const db = getDb()
  const [cards, reviewed] = await Promise.all([
    db
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
          inArray(userCards.id, input.assignedCardIds),
          eq(userCards.isSuspended, false),
          or(eq(phrases.isActive, true), eq(userCards.isPersonal, true))
        )
      ),
    db
      .select({ cardId: reviewLogs.userCardId })
      .from(reviewLogs)
      .where(
        and(
          eq(reviewLogs.dailyPlanId, input.dailyPlanId),
          inArray(reviewLogs.userCardId, input.assignedCardIds)
        )
      ),
  ])

  const reviewedIds = new Set(reviewed.map((row) => row.cardId))
  const cardsById = new Map(cards.map((card) => [card.id, card]))
  const remainingCards = input.assignedCardIds
    .map((cardId) => cardsById.get(cardId))
    .filter((card): card is DailyQueueCard => Boolean(card))
    .filter((card) => !reviewedIds.has(card.id))

  return {
    assignedCount: reviewedIds.size + remainingCards.length,
    reviewedCount: reviewedIds.size,
    remainingCards,
  }
}

export function reviewStepState(input: {
  completed: boolean
  skippedForNoCards: boolean
  assignedCount: number
  reviewedCount: number
}): ReviewStepState {
  if (input.skippedForNoCards) {
    return {
      status: "skipped",
      skipReason: "no_cards",
      assignedCount: 0,
      reviewedCount: 0,
    }
  }
  if (input.completed) {
    return {
      status: "completed",
      skipReason: null,
      assignedCount: Math.max(input.assignedCount, input.reviewedCount),
      reviewedCount: input.reviewedCount,
    }
  }
  return {
    status: "available",
    skipReason: null,
    assignedCount: input.assignedCount,
    reviewedCount: input.reviewedCount,
  }
}

export function reviewCompletionFromMetadata(
  metadata: Record<string, unknown>
) {
  return {
    skippedForNoCards: isNoCardsCompletion(metadata),
    reviewedCount: reviewCountFromMetadata(metadata),
  }
}
