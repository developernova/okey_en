import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, it } from "vitest"

import { AppError } from "@/server/shared/errors"

import { assertReviewOrder, reviewActivityUpdateValues } from "./review-card"

describe("review ordering", () => {
  it("rejects an event older than the card's latest review", () => {
    expect(() =>
      assertReviewOrder(
        new Date("2026-07-16T12:00:00.000Z"),
        new Date("2026-07-15T12:00:00.000Z")
      )
    ).toThrowError(
      expect.objectContaining({
        status: 409,
        code: "OUT_OF_ORDER_REVIEW",
      }) as AppError
    )
  })

  it("accepts equal and newer event times", () => {
    const lastReview = new Date("2026-07-16T12:00:00.000Z")
    expect(() => assertReviewOrder(lastReview, lastReview)).not.toThrow()
    expect(() =>
      assertReviewOrder(lastReview, new Date("2026-07-16T12:00:01.000Z"))
    ).not.toThrow()
  })

  it("serializes raw activity timestamp parameters as strings", () => {
    const activityAt = new Date("2026-07-21T20:42:47.512Z")
    const values = reviewActivityUpdateValues(activityAt)
    const query = new PgDialect().sqlToQuery(values.lastActiveAt)

    expect(query.params).toEqual([
      "2026-07-21T20:42:47.512Z",
      "2026-07-21T20:42:47.512Z",
    ])
  })
})
