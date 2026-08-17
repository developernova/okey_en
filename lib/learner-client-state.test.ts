import { describe, expect, it, vi } from "vitest"

import { clearLearnerClientState } from "@/lib/learner-client-state"

describe("clearLearnerClientState", () => {
  it("removes all learning progress cached on the device", () => {
    const removeItem = vi.fn()

    clearLearnerClientState({ removeItem } as unknown as Storage)

    expect(removeItem.mock.calls.map(([key]) => key)).toEqual([
      "okey-english:onboarding-complete",
      "okey-english:home-screen-prompted",
      "okey-english:pending-plan-items:v1",
      "okey-english:pending-reviews:v1",
      "catch-english:dismissed-today-return-plan",
    ])
  })
})
