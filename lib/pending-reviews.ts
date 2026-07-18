import { telegramFetch } from "@/lib/telegram"

type PendingReviewFields = {
  eventId: string
  cardId: string
  rating: "again" | "hard" | "good"
  answeredAt: string
}

export type PendingReview = PendingReviewFields & {
  /** Missing only on entries written before reviews were scoped to a plan. */
  planId?: string
}

export type NewPendingReview = PendingReviewFields & {
  planId: string
}

const storageKey = "okey-english:pending-reviews:v1"
const discardableStatuses = new Set([400, 404, 409, 410, 422])
const DEFAULT_FLUSH_BUDGET_MS = 3_000
const MAX_REVIEW_REQUEST_MS = 3_000

export type PendingReviewFlushResult = {
  synced: number
  discarded: number
  remaining: number
}

export function normalizeReviewQueueIndex(index: number, queueLength: number) {
  return Number.isInteger(index) && index >= 0 && index < queueLength
    ? index
    : 0
}

function storage() {
  if (typeof window === "undefined") return undefined
  return window.localStorage
}

export function getPendingReviews(): PendingReview[] {
  const target = storage()
  if (!target) return []
  try {
    const value: unknown = JSON.parse(target.getItem(storageKey) ?? "[]")
    if (!Array.isArray(value)) return []
    return value.filter(
      (item): item is PendingReview =>
        typeof item === "object" &&
        item !== null &&
        typeof item.eventId === "string" &&
        typeof item.cardId === "string" &&
        ["again", "hard", "good"].includes(String(item.rating)) &&
        typeof item.answeredAt === "string" &&
        (item.planId === undefined || typeof item.planId === "string")
    )
  } catch {
    return []
  }
}

export function enqueuePendingReview(review: NewPendingReview) {
  storage()?.setItem(
    storageKey,
    JSON.stringify([...getPendingReviews(), review])
  )
}

export function hasReviewsBlockingPlanItemFlush(planIds: Iterable<string>) {
  const scopedPlans = new Set(planIds)
  return getPendingReviews().some(
    (review) => !review.planId || scopedPlans.has(review.planId)
  )
}

function removePendingReview(eventId: string) {
  storage()?.setItem(
    storageKey,
    JSON.stringify(
      getPendingReviews().filter((review) => review.eventId !== eventId)
    )
  )
}

export async function flushPendingReviews(
  options: { maxDurationMs?: number } = {}
) {
  let synced = 0
  let discarded = 0
  const budgetMs = Math.max(1, options.maxDurationMs ?? DEFAULT_FLUSH_BUDGET_MS)
  const deadline = Date.now() + budgetMs

  for (const review of getPendingReviews()) {
    const remainingMs = deadline - Date.now()
    if (remainingMs <= 0) break

    let response: Response
    const controller = new AbortController()
    const timeout = setTimeout(
      () => controller.abort(),
      Math.max(1, Math.min(MAX_REVIEW_REQUEST_MS, remainingMs))
    )
    try {
      response = await telegramFetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(review),
        signal: controller.signal,
      })
    } catch {
      break
    } finally {
      clearTimeout(timeout)
    }

    if (response.ok) {
      removePendingReview(review.eventId)
      synced += 1
      continue
    }

    if (discardableStatuses.has(response.status)) {
      removePendingReview(review.eventId)
      discarded += 1
      continue
    }

    // Authentication failures, rate limits and server/network failures may be
    // temporary. Preserve this event and the ordering of everything after it.
    break
  }

  return {
    synced,
    discarded,
    remaining: getPendingReviews().length,
  } satisfies PendingReviewFlushResult
}
