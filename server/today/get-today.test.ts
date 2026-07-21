import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getOrCreateDailyPlan: vi.fn(),
  completeDailyPlanItem: vi.fn(),
  calculateComprehension: vi.fn(),
  buildDailyQueue: vi.fn(),
  getOrCreateReviewAssignment: vi.fn(),
  getAssignedReviewProgress: vi.fn(),
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

vi.mock("@/server/today/review-step", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/server/today/review-step")>()
  return {
    ...original,
    getOrCreateReviewAssignment: mocks.getOrCreateReviewAssignment,
    getAssignedReviewProgress: mocks.getAssignedReviewProgress,
  }
})

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
      totalOccurrences: 0,
      isEstimated: false,
      isReady: false,
    })
    mocks.completeDailyPlanItem.mockReset().mockResolvedValue({
      status: "supporting",
      completedItems: ["review"],
      nextEpisodeId: null,
    })
    mocks.getOrCreateReviewAssignment.mockReset().mockResolvedValue({
      completedAt: null,
      metadata: {},
      assignedCardIds: [],
    })
    mocks.getAssignedReviewProgress.mockReset().mockResolvedValue({
      assignedCount: 0,
      reviewedCount: 0,
      remainingCards: [],
    })
  })

  it("does not auto-complete an empty review step for a reminder cron", async () => {
    const today = await getToday("user-id", {
      autoCompleteEmptyReview: false,
    })

    expect(mocks.completeDailyPlanItem).not.toHaveBeenCalled()
    expect(today.queue.reviewStep).toEqual({
      status: "skipped",
      skipReason: "no_cards",
      assignedCount: 0,
      reviewedCount: 0,
    })
  })

  it("records an empty learner queue as a skip, not a user completion", async () => {
    const today = await getToday("user-id")

    expect(mocks.completeDailyPlanItem).toHaveBeenCalledWith({
      userId: "user-id",
      planId: "plan-id",
      episodeId: "episode-id",
      type: "review",
      completionMetadata: {
        completionSource: "automatic",
        skipReason: "no_cards",
        reviewCount: 0,
      },
    })
    expect(today.plan.completedItems).toContain("review")
    expect(today.queue.reviewStep).toEqual({
      status: "skipped",
      skipReason: "no_cards",
      assignedCount: 0,
      reviewedCount: 0,
    })
  })

  it("exposes an available review step when the queue has cards", async () => {
    const card = {
      id: "card-id",
      due: new Date(),
      reps: 0,
      phrase: "phrase",
      translationRu: "перевод",
      contextSentence: "context",
      offsetMs: 0,
    }
    mocks.buildDailyQueue.mockResolvedValue({
      mode: "normal",
      gapDays: 0,
      totalDueReviews: 0,
      shownReviews: 0,
      newCardsPaused: false,
      estimatedMinutes: 1,
      cards: [card],
    })
    mocks.getOrCreateReviewAssignment.mockResolvedValue({
      completedAt: null,
      metadata: { assignedCardIds: ["card-id"] },
      assignedCardIds: ["card-id"],
    })
    mocks.getAssignedReviewProgress.mockResolvedValue({
      assignedCount: 1,
      reviewedCount: 0,
      remainingCards: [card],
    })

    const today = await getToday("user-id")

    expect(mocks.completeDailyPlanItem).not.toHaveBeenCalled()
    expect(today.queue.reviewStep).toEqual({
      status: "available",
      skipReason: null,
      assignedCount: 1,
      reviewedCount: 0,
    })
  })

  it("returns the persisted plan assignment instead of a recomputed queue", async () => {
    const remainingCard = {
      id: "assigned-card",
      due: new Date(),
      reps: 0,
      phrase: "assigned phrase",
      translationRu: "перевод",
      contextSentence: "context",
      offsetMs: 1,
    }
    mocks.buildDailyQueue.mockResolvedValue({
      mode: "normal",
      gapDays: 0,
      totalDueReviews: 0,
      shownReviews: 0,
      newCardsPaused: false,
      estimatedMinutes: 1,
      cards: [{ ...remainingCard, id: "newly-recomputed-card" }],
    })
    mocks.getOrCreateReviewAssignment.mockResolvedValue({
      completedAt: null,
      metadata: { assignedCardIds: ["reviewed-card", "assigned-card"] },
      assignedCardIds: ["reviewed-card", "assigned-card"],
    })
    mocks.getAssignedReviewProgress.mockResolvedValue({
      assignedCount: 2,
      reviewedCount: 1,
      remainingCards: [remainingCard],
    })

    const today = await getToday("user-id")

    expect(today.queue.cards.map((card) => card.id)).toEqual(["assigned-card"])
    expect(today.queue.reviewStep).toEqual({
      status: "available",
      skipReason: null,
      assignedCount: 2,
      reviewedCount: 1,
    })
    expect(mocks.completeDailyPlanItem).not.toHaveBeenCalled()
  })

  it("reconciles a fully rated assignment on the server", async () => {
    mocks.getOrCreateReviewAssignment.mockResolvedValue({
      completedAt: null,
      metadata: { assignedCardIds: ["one", "two"] },
      assignedCardIds: ["one", "two"],
    })
    mocks.getAssignedReviewProgress.mockResolvedValue({
      assignedCount: 2,
      reviewedCount: 2,
      remainingCards: [],
    })

    const today = await getToday("user-id")

    expect(mocks.completeDailyPlanItem).toHaveBeenCalledWith({
      userId: "user-id",
      planId: "plan-id",
      episodeId: "episode-id",
      type: "review",
    })
    expect(today.queue.reviewStep).toEqual({
      status: "completed",
      skipReason: null,
      assignedCount: 2,
      reviewedCount: 2,
    })
  })

  it.each([
    [
      false,
      {
        status: "completed",
        skipReason: null,
        assignedCount: 3,
        reviewedCount: 3,
      },
    ],
    [
      true,
      {
        status: "skipped",
        skipReason: "no_cards",
        assignedCount: 0,
        reviewedCount: 0,
      },
    ],
  ] as const)(
    "restores persisted review completion source (skipped: %s)",
    async (skippedForNoCards, expected) => {
      mocks.getOrCreateDailyPlan.mockResolvedValue({
        planId: "plan-id",
        planDate: "2026-07-16",
        status: "supporting",
        completedAt: null,
        completedItems: ["review"],
        returnGapDays: 0,
        timezone: "Europe/Moscow",
        episodeId: "episode-id",
        youtubeId: "dQw4w9WgXcQ",
        episodeTitle: "Episode",
        durationSeconds: 600,
        sequenceNumber: 1,
        programId: "program-id",
        programTitle: "Program",
      })
      mocks.getOrCreateReviewAssignment.mockResolvedValue({
        completedAt: new Date(),
        metadata: skippedForNoCards
          ? {
              completionSource: "automatic",
              skipReason: "no_cards",
              reviewCount: 0,
              assignedCardIds: [],
            }
          : {
              completionSource: "user",
              reviewCount: 3,
              assignedCardIds: ["one", "two", "three"],
            },
        assignedCardIds: skippedForNoCards ? [] : ["one", "two", "three"],
      })
      mocks.getAssignedReviewProgress.mockResolvedValue({
        assignedCount: skippedForNoCards ? 0 : 3,
        reviewedCount: skippedForNoCards ? 0 : 3,
        remainingCards: [],
      })

      const today = await getToday("user-id")

      expect(today.queue.reviewStep).toEqual(expected)
    }
  )
})
