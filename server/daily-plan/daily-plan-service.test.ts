import { beforeEach, describe, expect, it, vi } from "vitest"

import { AppError } from "@/server/shared/errors"

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
}))

vi.mock("@/db", () => ({ getDb: mocks.getDb }))

import {
  assertCurrentDailyPlanIdentity,
  completeDailyPlanItem,
  dailyReviewCompletionMetadata,
} from "./daily-plan-service"

const requestedPlanId = "774b9ccb-5bc8-4f87-9b8b-e44fbd7773fd"
const requestedEpisodeId = "3e39bc31-8a7d-4d0f-a4d6-b0049d0068d3"
const currentPlanDate = "2026-07-18"

function expectConflict(action: () => unknown, code: string) {
  try {
    action()
    throw new Error("Expected an AppError")
  } catch (error) {
    expect(error).toBeInstanceOf(AppError)
    expect((error as AppError).status).toBe(409)
    expect((error as AppError).code).toBe(code)
  }
}

function selectRows(rows: unknown[]) {
  const query = {
    from: vi.fn(),
    where: vi.fn(),
    for: vi.fn(),
    limit: vi.fn(),
  }
  query.from.mockReturnValue(query)
  query.where.mockReturnValue(query)
  query.for.mockReturnValue(query)
  query.limit.mockResolvedValue(rows)
  return query
}

beforeEach(() => {
  mocks.getDb.mockReset()
})

describe("assertCurrentDailyPlanIdentity", () => {
  it("accepts the authenticated user's current local-date plan", () => {
    const plan = {
      id: requestedPlanId,
      planDate: currentPlanDate,
      episodeId: requestedEpisodeId,
      status: "not_started" as const,
    }

    expect(
      assertCurrentDailyPlanIdentity({
        plan,
        requestedPlanId,
        requestedEpisodeId,
        currentPlanDate,
      })
    ).toBe(plan)
  })

  it("rejects a missing plan row, including a foreign planId", () => {
    expectConflict(
      () =>
        assertCurrentDailyPlanIdentity({
          plan: undefined,
          requestedPlanId,
          requestedEpisodeId,
          currentPlanDate,
        }),
      "DAILY_PLAN_STALE"
    )
  })

  it("rejects a plan from a previous local date", () => {
    expectConflict(
      () =>
        assertCurrentDailyPlanIdentity({
          plan: {
            id: requestedPlanId,
            planDate: "2026-07-17",
            episodeId: requestedEpisodeId,
          },
          requestedPlanId,
          requestedEpisodeId,
          currentPlanDate,
        }),
      "DAILY_PLAN_STALE"
    )
  })

  it("rejects an episode that is not attached to the plan", () => {
    expectConflict(
      () =>
        assertCurrentDailyPlanIdentity({
          plan: {
            id: requestedPlanId,
            planDate: currentPlanDate,
            episodeId: "55e6854d-e747-493a-b92d-1b91c41306f6",
          },
          requestedPlanId,
          requestedEpisodeId,
          currentPlanDate,
        }),
      "DAILY_PLAN_EPISODE_MISMATCH"
    )
  })

  it("performs no writes when a foreign planId is not found for the user", async () => {
    const tx = {
      select: vi
        .fn()
        .mockReturnValueOnce(selectRows([{ timezone: "Europe/Moscow" }]))
        .mockReturnValueOnce(selectRows([])),
      insert: vi.fn(),
      update: vi.fn(),
    }
    mocks.getDb.mockReturnValue({
      transaction: (callback: (transaction: typeof tx) => unknown) =>
        callback(tx),
    })

    await expect(
      completeDailyPlanItem({
        userId: "user-id",
        planId: requestedPlanId,
        episodeId: requestedEpisodeId,
        type: "review",
        now: new Date("2026-07-18T09:00:00.000Z"),
      })
    ).rejects.toMatchObject({ status: 409, code: "DAILY_PLAN_STALE" })
    expect(tx.insert).not.toHaveBeenCalled()
    expect(tx.update).not.toHaveBeenCalled()
  })
})

describe("dailyReviewCompletionMetadata", () => {
  it("rejects completion while an assigned card is still unrated", () => {
    expect(() =>
      dailyReviewCompletionMetadata({
        eligibleCardIds: ["one", "two"],
        reviewedCardIds: ["one"],
      })
    ).toThrowError(
      expect.objectContaining({
        status: 409,
        code: "DAILY_REVIEW_INCOMPLETE",
        details: { remainingCount: 1 },
      }) as AppError
    )
  })

  it("persists a distinct backend-derived review count", () => {
    expect(
      dailyReviewCompletionMetadata({
        eligibleCardIds: ["one", "two"],
        reviewedCardIds: ["one", "one", "two"],
      })
    ).toEqual({ completionSource: "user", reviewCount: 2 })
  })
})
