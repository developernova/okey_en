import { beforeEach, describe, expect, it, vi } from "vitest"

import { AppError } from "@/server/shared/errors"

const mocks = vi.hoisted(() => ({
  requireUserId: vi.fn(),
  completeDailyPlanItem: vi.fn(),
}))

vi.mock("@/server/auth/user-context", () => ({
  requireUserId: mocks.requireUserId,
}))

vi.mock("@/server/daily-plan/daily-plan-service", () => ({
  completeDailyPlanItem: mocks.completeDailyPlanItem,
}))

import { POST } from "./route"

const planId = "774b9ccb-5bc8-4f87-9b8b-e44fbd7773fd"
const episodeId = "3e39bc31-8a7d-4d0f-a4d6-b0049d0068d3"

function request(body: unknown) {
  return new Request("http://localhost/api/daily-plan/items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("POST /api/daily-plan/items", () => {
  beforeEach(() => {
    mocks.requireUserId.mockReset().mockResolvedValue("user-id")
    mocks.completeDailyPlanItem.mockReset().mockResolvedValue({
      status: "supporting",
      completedItems: ["watch"],
      nextEpisodeId: null,
    })
  })

  it("passes the explicit plan identity to the completion service", async () => {
    const response = await POST(
      request({
        planId,
        episodeId,
        type: "watch",
        completionMetadata: { completionSource: "forged" },
      })
    )

    expect(response.status).toBe(200)
    expect(mocks.completeDailyPlanItem).toHaveBeenCalledWith({
      userId: "user-id",
      planId,
      episodeId,
      type: "watch",
    })
  })

  it("rejects legacy completion requests without planId", async () => {
    const response = await POST(request({ episodeId, type: "review" }))

    expect(response.status).toBe(400)
    expect(mocks.completeDailyPlanItem).not.toHaveBeenCalled()
  })

  it("returns a domain conflict for a stale or foreign plan", async () => {
    mocks.completeDailyPlanItem.mockRejectedValueOnce(
      new AppError("Daily plan is no longer current", 409, "DAILY_PLAN_STALE")
    )

    const response = await POST(request({ planId, episodeId, type: "review" }))
    const payload = (await response.json()) as {
      error?: { code?: string }
    }

    expect(response.status).toBe(409)
    expect(payload.error?.code).toBe("DAILY_PLAN_STALE")
  })
})
