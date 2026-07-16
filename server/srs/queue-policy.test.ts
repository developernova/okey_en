import { describe, expect, it } from "vitest"

import { dailyNewCardLimit, dailyQueuePolicy } from "./queue-policy"

describe("dailyQueuePolicy", () => {
  it("caps a long-return day at 25 reviews", () => {
    expect(dailyQueuePolicy(30)).toEqual({
      gapDays: 30,
      isReturnDay: true,
      reviewLimit: 25,
      mode: "soft_restart",
    })
  })

  it("uses return mode after two missed calendar dates", () => {
    expect(dailyQueuePolicy(2)).toMatchObject({
      reviewLimit: 25,
      mode: "return",
    })
  })

  it("keeps the normal queue for a one-day gap", () => {
    expect(dailyQueuePolicy(1)).toMatchObject({
      reviewLimit: 100,
      mode: "normal",
    })
  })
})

describe("dailyNewCardLimit", () => {
  it("keeps the complete return queue within 25 cards", () => {
    expect(
      dailyNewCardLimit({
        isReturnDay: true,
        pauseNewCards: true,
        reviewLimit: 25,
        shownReviews: 25,
      })
    ).toBe(0)
    expect(
      dailyNewCardLimit({
        isReturnDay: true,
        pauseNewCards: true,
        reviewLimit: 25,
        shownReviews: 22,
      })
    ).toBe(3)
  })
})
