import { describe, expect, it } from "vitest"

import { lemmaCandidates } from "./lemmatize"

describe("English lemma candidates", () => {
  it.each([
    ["takes", "take"],
    ["going", "go"],
    ["children", "child"],
    ["easier", "easy"],
  ])("maps %s to %s", (token, expected) => {
    expect(lemmaCandidates(token)).toContain(expected)
  })
})
