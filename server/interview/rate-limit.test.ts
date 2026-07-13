import { describe, expect, it } from "vitest"

import { dateInTimezone } from "@/server/interview/rate-limit"

describe("interview request date", () => {
  it("uses the user's local day", () => {
    const date = new Date("2026-07-12T22:30:00.000Z")
    expect(dateInTimezone(date, "Europe/Moscow")).toBe("2026-07-13")
    expect(dateInTimezone(date, "America/Los_Angeles")).toBe("2026-07-12")
  })
})
