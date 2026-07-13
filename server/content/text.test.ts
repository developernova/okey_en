import { describe, expect, it } from "vitest"

import { countLexemes, normalizePhrase, normalizeText } from "./text"
import { extractYoutubeId } from "./youtube-transcript"

describe("content normalization", () => {
  it("normalizes transcript text without losing apostrophes", () => {
    expect(normalizeText("  We&apos;re   ready. ")).toBe("We're ready.")
    expect(normalizePhrase("We’re READY! ")).toBe("we're ready")
  })

  it("counts token occurrences for comprehension", () => {
    const result = countLexemes([
      {
        index: 0,
        text: "Time takes time",
        normalizedText: "time takes time",
        offsetMs: 0,
        durationMs: 1000,
      },
    ])

    expect(result).toContainEqual({ lemma: "time", frequency: 2 })
    expect(result).toContainEqual({ lemma: "takes", frequency: 1 })
  })
})

describe("YouTube id extraction", () => {
  it.each([
    ["dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://youtu.be/dQw4w9WgXcQ?t=1", "dQw4w9WgXcQ"],
    ["https://youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  ])("extracts an id from %s", (input, expected) => {
    expect(extractYoutubeId(input)).toBe(expected)
  })
})
