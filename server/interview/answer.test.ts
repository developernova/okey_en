import { describe, expect, it } from "vitest"

import { isSubstantiveInterviewAnswer } from "./answer"

describe("interview answer sufficiency", () => {
  it.each(["yes", "No.", "I don't know", "I do not remember it", "idk"])(
    "does not count %s as speaking practice",
    (answer) => {
      expect(isSubstantiveInterviewAnswer(answer)).toBe(false)
    }
  )

  it.each(["He left.", "Because it was raining.", "I liked the ending."])(
    "accepts a short complete idea: %s",
    (answer) => {
      expect(isSubstantiveInterviewAnswer(answer)).toBe(true)
    }
  )
})
