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
  it("pauses new cards on a return day", () => {
    expect(
      dailyNewCardLimit({
        isReturnDay: true,
        pauseNewCards: true,
        reviewLimit: 25,
        shownReviews: 0,
      })
    ).toBe(0)
  })

  it("does not add new cards even when the capped return queue has room", () => {
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
    ).toBe(0)
  })

  it("uses at most eight new cards on a normal day", () => {
    expect(
      dailyNewCardLimit({
        isReturnDay: false,
        pauseNewCards: false,
        reviewLimit: 100,
        shownReviews: 0,
      })
    ).toBe(8)
  })

  it("pauses new cards when the due backlog is too large", () => {
    expect(
      dailyNewCardLimit({
        isReturnDay: false,
        pauseNewCards: true,
        reviewLimit: 100,
        shownReviews: 26,
      })
    ).toBe(0)
  })
})
