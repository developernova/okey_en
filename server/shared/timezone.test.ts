import { describe, expect, it } from "vitest"

import { calendarDayGap, canonicalizeIanaTimezone } from "./timezone"

describe("canonicalizeIanaTimezone", () => {
  it("accepts and canonicalizes an IANA timezone", () => {
    expect(canonicalizeIanaTimezone(" Asia/Novosibirsk ")).toBe(
      "Asia/Novosibirsk"
    )
  })

  it("rejects invalid and oversized timezone headers", () => {
    expect(canonicalizeIanaTimezone("not/a-timezone")).toBeNull()
    expect(canonicalizeIanaTimezone("x".repeat(101))).toBeNull()
    expect(canonicalizeIanaTimezone(null)).toBeNull()
  })
})

describe("calendarDayGap", () => {
  it("counts local calendar dates rather than elapsed 24-hour periods", () => {
    const previousActivity = new Date("2026-07-13T16:30:00.000Z")
    const now = new Date("2026-07-15T00:30:00.000Z")

    expect(calendarDayGap(previousActivity, now, "Asia/Novosibirsk")).toBe(2)
  })

  it("is stable across a daylight-saving transition", () => {
    const previousActivity = new Date("2026-03-07T16:00:00.000Z")
    const now = new Date("2026-03-09T15:00:00.000Z")

    expect(calendarDayGap(previousActivity, now, "America/New_York")).toBe(2)
  })

  it("treats a missing or future activity timestamp as no gap", () => {
    const now = new Date("2026-07-15T00:30:00.000Z")

    expect(calendarDayGap(null, now, "Europe/Moscow")).toBe(0)
    expect(
      calendarDayGap(new Date("2026-07-16T00:30:00.000Z"), now, "Europe/Moscow")
    ).toBe(0)
  })
})
