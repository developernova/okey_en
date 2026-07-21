import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  events: [] as string[],
  requireUserId: vi.fn(),
  snapshotDailyReturnGap: vi.fn(),
  reviewCard: vi.fn(),
}))

vi.mock("@/server/auth/user-context", () => ({
  requireUserId: mocks.requireUserId,
}))

vi.mock("@/server/daily-plan/daily-plan-service", () => ({
  snapshotDailyReturnGap: mocks.snapshotDailyReturnGap,
}))

vi.mock("@/server/srs/review-card", () => ({
  reviewCard: mocks.reviewCard,
}))

import { POST } from "./route"

describe("POST /api/reviews", () => {
  beforeEach(() => {
    mocks.events.length = 0
    mocks.requireUserId.mockReset().mockResolvedValue("user-id")
    mocks.snapshotDailyReturnGap.mockReset().mockImplementation(async () => {
      mocks.events.push("daily-plan")
      return {}
    })
    mocks.reviewCard.mockReset().mockImplementation(async () => {
      mocks.events.push("review")
      return { cardId: "card-id" }
    })
  })

  it("snapshots the return gap before applying an offline review", async () => {
    const response = await POST(
      new Request("http://localhost/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: "00000000-0000-4000-8000-000000000001",
          cardId: "3e39bc31-8a7d-4d0f-a4d6-b0049d0068d3",
          rating: "good",
          eventId: "774b9ccb-5bc8-4f87-9b8b-e44fbd7773fd",
          answeredAt: "2026-07-16T00:00:00.000Z",
        }),
      })
    )

    expect(response.status).toBe(200)
    expect(mocks.events).toEqual(["daily-plan", "review"])
    expect(mocks.snapshotDailyReturnGap).toHaveBeenCalledWith(
      "user-id",
      expect.any(Date)
    )
    expect(mocks.reviewCard).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-id",
        planId: "00000000-0000-4000-8000-000000000001",
      })
    )
  })

  it("accepts an idempotent already-known action", async () => {
    const response = await POST(
      new Request("http://localhost/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: "00000000-0000-4000-8000-000000000001",
          cardId: "3e39bc31-8a7d-4d0f-a4d6-b0049d0068d3",
          rating: "known",
          eventId: "774b9ccb-5bc8-4f87-9b8b-e44fbd7773fd",
          answeredAt: "2026-07-16T00:00:00.000Z",
        }),
      })
    )

    expect(response.status).toBe(200)
    expect(mocks.reviewCard).toHaveBeenCalledWith(
      expect.objectContaining({ rating: "known" })
    )
  })
})
