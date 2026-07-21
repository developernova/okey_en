import { describe, expect, it } from "vitest"

import {
  estimatedLexemeKnowledge,
  frequencyWeightedEstimatedCoverage,
} from "./lexical-knowledge"

describe("estimated lexical knowledge", () => {
  it("treats placement as a probability rather than verified word knowledge", () => {
    expect(estimatedLexemeKnowledge("B1", "B1")).toBe(0.72)
    expect(estimatedLexemeKnowledge("B1", "A2")).toBe(0.9)
    expect(estimatedLexemeKnowledge("B1", "B2")).toBe(0.25)
  })

  it("does not guess when either CEFR level is unavailable", () => {
    expect(estimatedLexemeKnowledge(null, "A1")).toBe(0)
    expect(estimatedLexemeKnowledge("A2", null)).toBe(0)
  })

  it("weights an episode estimate by token frequency", () => {
    expect(
      frequencyWeightedEstimatedCoverage(
        [
          { frequency: 9, cefr: "A1" },
          { frequency: 1, cefr: "B2" },
        ],
        "A2"
      )
    ).toBe(82)
  })
})
