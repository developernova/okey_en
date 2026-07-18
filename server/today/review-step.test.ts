import { describe, expect, it } from "vitest"

import {
  assignedCardIdsFromMetadata,
  mergeReviewAssignment,
  reviewCompletionFromMetadata,
  reviewStepState,
} from "./review-step"

describe("daily review assignment metadata", () => {
  it("normalizes a persisted card assignment without changing its order", () => {
    expect(
      assignedCardIdsFromMetadata({
        assignedCardIds: ["first", "second", "first", 3, null],
      })
    ).toEqual(["first", "second"])
  })

  it("restores a stable user-completion count from metadata", () => {
    expect(
      reviewCompletionFromMetadata({
        completionSource: "user",
        reviewCount: 7,
      })
    ).toEqual({ skippedForNoCards: false, reviewedCount: 7 })
  })

  it("recovers a partial assignment from saved reviews plus remaining cards", () => {
    expect(
      mergeReviewAssignment(
        ["reviewed-one", "reviewed-two"],
        ["reviewed-two", "remaining"]
      )
    ).toEqual(["reviewed-one", "reviewed-two", "remaining"])
  })

  it("keeps an empty automatic assignment neutral", () => {
    expect(
      reviewStepState({
        completed: true,
        skippedForNoCards: true,
        assignedCount: 0,
        reviewedCount: 0,
      })
    ).toEqual({
      status: "skipped",
      skipReason: "no_cards",
      assignedCount: 0,
      reviewedCount: 0,
    })
  })
})
