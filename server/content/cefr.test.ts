import { describe, expect, it } from "vitest"

import { cefrRange } from "./cefr"

describe("cefrRange", () => {
  it("returns the full range represented by AI-classified phrases", () => {
    expect(cefrRange(["B1", "A2", "C1", "B2"])).toEqual({
      min: "A2",
      max: "C1",
    })
  })

  it("ignores unknown values and handles an empty result", () => {
    expect(cefrRange(["unknown", "B2"])).toEqual({ min: "B2", max: "B2" })
    expect(cefrRange(["unknown"])).toBeNull()
  })
})
