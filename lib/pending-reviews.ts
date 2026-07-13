import { telegramFetch } from "@/lib/telegram"

export type PendingReview = {
  eventId: string
  cardId: string
  rating: "again" | "hard" | "good"
  answeredAt: string
}

const storageKey = "okey-english:pending-reviews:v1"

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
        typeof item.answeredAt === "string"
    )
  } catch {
    return []
  }
}

export function enqueuePendingReview(review: PendingReview) {
  storage()?.setItem(
    storageKey,
    JSON.stringify([...getPendingReviews(), review])
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

export async function flushPendingReviews() {
  for (const review of getPendingReviews()) {
    const response = await telegramFetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(review),
    })
    if (!response.ok) {
      throw new Error("Не удалось синхронизировать ответы")
    }
    removePendingReview(review.eventId)
  }
}
