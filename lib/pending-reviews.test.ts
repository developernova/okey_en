import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { telegramFetchMock } = vi.hoisted(() => ({
  telegramFetchMock: vi.fn(),
}))

vi.mock("@/lib/telegram", () => ({
  telegramFetch: telegramFetchMock,
}))

import {
  enqueuePendingReview,
  flushPendingReviews,
  getPendingReviews,
  normalizeReviewQueueIndex,
  type PendingReview,
} from "@/lib/pending-reviews"

function review(eventId: string): PendingReview {
  return {
    eventId,
    cardId: `card-${eventId}`,
    rating: "good",
    answeredAt: "2026-07-16T10:00:00.000Z",
  }
}

function response(status: number) {
  return new Response(null, { status })
}

describe("pending review synchronization", () => {
  const values = new Map<string, string>()
  const localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  }

  beforeEach(() => {
    values.clear()
    telegramFetchMock.mockReset()
    vi.stubGlobal("window", { localStorage })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each([400, 404, 409, 410, 422])(
    "discards a permanent %s response and continues with the queue",
    async (status) => {
      enqueuePendingReview(review("poisoned"))
      enqueuePendingReview(review("valid"))
      telegramFetchMock
        .mockResolvedValueOnce(response(status))
        .mockResolvedValueOnce(response(200))

      const result = await flushPendingReviews()

      expect(result).toEqual({ synced: 1, discarded: 1, remaining: 0 })
      expect(telegramFetchMock).toHaveBeenCalledTimes(2)
      expect(getPendingReviews()).toEqual([])
    }
  )

  it.each([401, 403, 408, 429, 500, 503])(
    "retains the queue and stops on a retryable %s response",
    async (status) => {
      const first = review("first")
      const second = review("second")
      enqueuePendingReview(first)
      enqueuePendingReview(second)
      telegramFetchMock.mockResolvedValue(response(status))

      const result = await flushPendingReviews()

      expect(result).toEqual({ synced: 0, discarded: 0, remaining: 2 })
      expect(telegramFetchMock).toHaveBeenCalledTimes(1)
      expect(getPendingReviews()).toEqual([first, second])
    }
  )

  it("retains the queue and stops after a network failure", async () => {
    const first = review("first")
    const second = review("second")
    enqueuePendingReview(first)
    enqueuePendingReview(second)
    telegramFetchMock.mockRejectedValue(new TypeError("Failed to fetch"))

    const result = await flushPendingReviews()

    expect(result).toEqual({ synced: 0, discarded: 0, remaining: 2 })
    expect(telegramFetchMock).toHaveBeenCalledTimes(1)
    expect(getPendingReviews()).toEqual([first, second])
  })

  it("bounds a stalled mobile request and preserves the event", async () => {
    const first = review("stalled")
    enqueuePendingReview(first)
    telegramFetchMock.mockImplementation(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true }
          )
        })
    )

    const result = await flushPendingReviews({ maxDurationMs: 20 })

    expect(result).toEqual({ synced: 0, discarded: 0, remaining: 1 })
    expect(getPendingReviews()).toEqual([first])
  })
})

describe("review queue index", () => {
  it("keeps an in-range index", () => {
    expect(normalizeReviewQueueIndex(2, 4)).toBe(2)
  })

  it.each([
    [6, 4],
    [-1, 4],
    [0, 0],
  ])("resets an out-of-range index %s for a queue of %s", (index, length) => {
    expect(normalizeReviewQueueIndex(index, length)).toBe(0)
  })
})
