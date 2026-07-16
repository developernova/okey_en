import { describe, expect, it } from "vitest"

import {
  isReminderDue,
  reminderOccurrence,
  reminderRetryDelayMinutes,
  timeInTimezone,
} from "./reminder-service"

describe("timeInTimezone", () => {
  it("uses the user's timezone when matching a reminder", () => {
    const now = new Date("2026-07-13T16:00:00.000Z")

    expect(timeInTimezone(now, "Europe/Moscow")).toBe("19:00")
    expect(timeInTimezone(now, "America/New_York")).toBe("12:00")
  })
})

describe("isReminderDue", () => {
  const timezone = "Europe/Moscow"

  it("accepts a late cron invocation inside the grace window", () => {
    const oneMinuteLate = new Date("2026-07-13T16:01:00.000Z")

    expect(isReminderDue(oneMinuteLate, timezone, "19:00")).toBe(true)
  })

  it("does not send before the scheduled local time", () => {
    const oneMinuteEarly = new Date("2026-07-13T15:59:00.000Z")

    expect(isReminderDue(oneMinuteEarly, timezone, "19:00")).toBe(false)
  })

  it("does not send after the grace window", () => {
    const tooLate = new Date("2026-07-13T19:01:00.000Z")

    expect(isReminderDue(tooLate, timezone, "19:00")).toBe(false)
  })

  it("keeps a just-missed reminder due across local midnight", () => {
    const twoMinutesLate = new Date("2026-07-13T21:01:00.000Z")

    expect(isReminderDue(twoMinutesLate, timezone, "23:59")).toBe(true)
    expect(reminderOccurrence(twoMinutesLate, timezone, "23:59")).toEqual({
      deliveryDate: "2026-07-13",
      elapsedMinutes: 2,
    })
  })

  it("delivers after a nonexistent local time during the DST jump", () => {
    const afterSpringForward = new Date("2026-03-08T07:01:00.000Z")

    expect(isReminderDue(afterSpringForward, "America/New_York", "02:30")).toBe(
      true
    )
  })

  it("measures the real grace interval across a DST jump", () => {
    const afterSpringForward = new Date("2026-03-08T08:31:00.000Z")

    expect(
      reminderOccurrence(afterSpringForward, "America/New_York", "01:30")
    ).toEqual({
      deliveryDate: "2026-03-08",
      elapsedMinutes: 121,
    })
    expect(isReminderDue(afterSpringForward, "America/New_York", "01:30")).toBe(
      true
    )
  })
})

describe("reminderRetryDelayMinutes", () => {
  it("uses bounded exponential-style backoff", () => {
    expect([1, 2, 3, 4, 5, 6, 20].map(reminderRetryDelayMinutes)).toEqual([
      1, 2, 5, 10, 30, 60, 60,
    ])
  })
})
