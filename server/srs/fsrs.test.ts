import { describe, expect, it } from "vitest"

import { newFsrsCard, reviewFsrsCard } from "./fsrs"

describe("three-button FSRS mapping", () => {
  it.each(["again", "hard", "good"] as const)(
    "schedules a card rated %s",
    (rating) => {
      const now = new Date("2026-07-13T09:00:00.000Z")
      const empty = newFsrsCard(now)
      const result = reviewFsrsCard(
        {
          due: empty.due,
          stability: empty.stability,
          difficulty: empty.difficulty,
          scheduledDays: empty.scheduled_days,
          learningSteps: empty.learning_steps,
          reps: empty.reps,
          lapses: empty.lapses,
          state: empty.state,
          lastReview: empty.last_review ?? null,
        },
        rating,
        now
      )

      expect(result.card.reps).toBe(1)
      expect(result.card.due.getTime()).toBeGreaterThan(now.getTime())
      expect(result.log.review).toEqual(now)
    }
  )
})
