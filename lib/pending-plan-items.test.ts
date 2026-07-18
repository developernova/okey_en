import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { telegramFetchMock } = vi.hoisted(() => ({
  telegramFetchMock: vi.fn(),
}))

vi.mock("@/lib/telegram", () => ({
  telegramFetch: telegramFetchMock,
}))

import {
  enqueuePendingPlanItem,
  flushPendingPlanItems,
  getPendingPlanItems,
  type PendingPlanItem,
} from "@/lib/pending-plan-items"

const item: PendingPlanItem = {
  planId: "00000000-0000-4000-8000-000000000001",
  episodeId: "00000000-0000-4000-8000-000000000002",
  type: "review",
}

function response(status: number) {
  return new Response(
    status === 200
      ? JSON.stringify({
          data: {
            status: "supporting",
            completedItems: ["review"],
          },
        })
      : JSON.stringify({ error: { message: "failed" } }),
    { status, headers: { "Content-Type": "application/json" } }
  )
}

describe("pending daily-plan item synchronization", () => {
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
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it("stores one durable completion intent per plan", () => {
    enqueuePendingPlanItem(item)
    enqueuePendingPlanItem(item)

    expect(getPendingPlanItems()).toEqual([item])
  })

  it("removes an intent only after the server confirms it", async () => {
    enqueuePendingPlanItem(item)
    telegramFetchMock.mockResolvedValue(response(200))

    const result = await flushPendingPlanItems()

    expect(result.saved).toEqual([
      {
        item,
        result: { status: "supporting", completedItems: ["review"] },
      },
    ])
    expect(result.remaining).toBe(0)
    expect(telegramFetchMock).toHaveBeenCalledWith(
      "/api/daily-plan/items",
      expect.objectContaining({ body: JSON.stringify(item) })
    )
  })

  it("drops a stale intent on 409 so it cannot affect a new plan", async () => {
    enqueuePendingPlanItem(item)
    telegramFetchMock.mockResolvedValue(response(409))

    const result = await flushPendingPlanItems()

    expect(result.stale).toEqual([item])
    expect(result.remaining).toBe(0)
  })

  it.each([401, 403, 408, 429, 500, 503])(
    "keeps an intent after a retryable %s response",
    async (status) => {
      enqueuePendingPlanItem(item)
      telegramFetchMock.mockResolvedValue(response(status))

      const result = await flushPendingPlanItems()

      expect(result.saved).toEqual([])
      expect(result.remaining).toBe(1)
      expect(getPendingPlanItems()).toEqual([item])
    }
  )

  it("keeps an intent after a network failure", async () => {
    enqueuePendingPlanItem(item)
    telegramFetchMock.mockRejectedValue(new TypeError("Failed to fetch"))

    const result = await flushPendingPlanItems()

    expect(result.remaining).toBe(1)
    expect(getPendingPlanItems()).toEqual([item])
  })

  it("aborts a stalled request and keeps the intent for retry", async () => {
    vi.useFakeTimers()
    enqueuePendingPlanItem(item)
    telegramFetchMock.mockImplementation(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"))
          })
        })
    )

    const flush = flushPendingPlanItems()
    await vi.advanceTimersByTimeAsync(3_000)

    await expect(flush).resolves.toEqual({
      saved: [],
      stale: [],
      discarded: 0,
      remaining: 1,
    })
    expect(getPendingPlanItems()).toEqual([item])
  })
})
