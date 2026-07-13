import { describe, expect, it } from "vitest"

import { timeInTimezone } from "./reminder-service"

describe("timeInTimezone", () => {
  it("uses the user's timezone when matching a reminder", () => {
    const now = new Date("2026-07-13T16:00:00.000Z")

    expect(timeInTimezone(now, "Europe/Moscow")).toBe("19:00")
    expect(timeInTimezone(now, "America/New_York")).toBe("12:00")
  })
})
