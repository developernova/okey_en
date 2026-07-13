import { describe, expect, it } from "vitest"

import { cefrRange, learningCefrLevels } from "./cefr"

describe("learningCefrLevels", () => {
  it("selects the user's level and one stretch level", () => {
    expect(learningCefrLevels("A2")).toEqual(["A2", "B1"])
    expect(learningCefrLevels("B2")).toEqual(["B2", "C1"])
    expect(learningCefrLevels("C2")).toEqual(["C2"])
  })

  it("keeps the catalog usable before placement is completed", () => {
    expect(learningCefrLevels(null)).toEqual([
      "A1",
      "A2",
      "B1",
      "B2",
      "C1",
      "C2",
    ])
  })
})

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
