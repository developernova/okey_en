import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getOrCreateDailyPlan: vi.fn(),
  completeDailyPlanItem: vi.fn(),
  calculateComprehension: vi.fn(),
  buildDailyQueue: vi.fn(),
}))

vi.mock("@/server/daily-plan/daily-plan-service", () => ({
  getOrCreateDailyPlan: mocks.getOrCreateDailyPlan,
  completeDailyPlanItem: mocks.completeDailyPlanItem,
}))

vi.mock("@/server/progress/comprehension", () => ({
  calculateComprehension: mocks.calculateComprehension,
}))

vi.mock("@/server/srs/daily-queue", () => ({
  buildDailyQueue: mocks.buildDailyQueue,
}))

import { getToday } from "./get-today"

describe("getToday", () => {
  beforeEach(() => {
    mocks.getOrCreateDailyPlan.mockReset().mockResolvedValue({
      planId: "plan-id",
      planDate: "2026-07-16",
      status: "not_started",
      completedAt: null,
      completedItems: [],
      returnGapDays: 20,
      timezone: "Europe/Moscow",
      episodeId: "episode-id",
      youtubeId: "dQw4w9WgXcQ",
      episodeTitle: "Episode",
      durationSeconds: 600,
      sequenceNumber: 1,
      programId: "program-id",
      programTitle: "Program",
    })
    mocks.buildDailyQueue.mockReset().mockResolvedValue({
      mode: "soft_restart",
      gapDays: 20,
      totalDueReviews: 0,
      shownReviews: 0,
      newCardsPaused: true,
      estimatedMinutes: 1,
      cards: [],
    })
    mocks.calculateComprehension.mockReset().mockResolvedValue({
      percentage: 0,
      knownLexemeCount: 0,
    })
    mocks.completeDailyPlanItem.mockReset().mockResolvedValue({
      status: "supporting",
      completedItems: ["review"],
      nextEpisodeId: null,
    })
  })

  it("does not auto-complete an empty review step for a reminder cron", async () => {
    await getToday("user-id", { autoCompleteEmptyReview: false })

    expect(mocks.completeDailyPlanItem).not.toHaveBeenCalled()
  })

  it("keeps the learner-facing empty-review auto-completion", async () => {
    await getToday("user-id")

    expect(mocks.completeDailyPlanItem).toHaveBeenCalledWith({
      userId: "user-id",
      episodeId: "episode-id",
      type: "review",
    })
  })
})
