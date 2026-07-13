import { describe, expect, it } from "vitest"

import {
  extractYoutubePlaylistId,
  youtubeDurationSeconds,
} from "./youtube-playlist"

describe("YouTube playlist helpers", () => {
  it("extracts playlist IDs from URLs and raw values", () => {
    expect(
      extractYoutubePlaylistId(
        "https://www.youtube.com/playlist?list=PL1234567890ABCDE"
      )
    ).toBe("PL1234567890ABCDE")
    expect(extractYoutubePlaylistId("PL1234567890ABCDE")).toBe(
      "PL1234567890ABCDE"
    )
    expect(extractYoutubePlaylistId("not a playlist")).toBe("")
  })

  it("converts YouTube ISO 8601 durations", () => {
    expect(youtubeDurationSeconds("PT15M33S")).toBe(933)
    expect(youtubeDurationSeconds("PT1H2M3S")).toBe(3723)
    expect(youtubeDurationSeconds("P1DT2H")).toBe(93_600)
    expect(youtubeDurationSeconds(null)).toBe(0)
  })
})
