import {
  YoutubeTranscriptNotAvailableLanguageError,
  YoutubeTranscriptTooManyRequestError,
} from "youtube-transcript"
import { describe, expect, it, vi } from "vitest"

import {
  getYoutubeTranscript,
  isRetryableYoutubeTranscriptError,
  matchingTranscriptLanguage,
} from "./youtube-transcript"

describe("YouTube transcript safety", () => {
  it("matches a regional English track for a generic English request", () => {
    expect(matchingTranscriptLanguage("en", ["de", "en-US", "fr"])).toBe(
      "en-US"
    )
    expect(matchingTranscriptLanguage("en-GB", ["en", "de"])).toBe("en")
  })

  it("falls back from en to the available en-US track", async () => {
    const transcriptFetcher = vi
      .fn()
      .mockRejectedValueOnce(
        new YoutubeTranscriptNotAvailableLanguageError(
          "en",
          ["de", "en-US"],
          "dQw4w9WgXcQ"
        )
      )
      .mockResolvedValueOnce([
        {
          text: "Get out of bed",
          duration: 2,
          offset: 1,
          lang: "en-US",
        },
      ])

    const result = await getYoutubeTranscript("dQw4w9WgXcQ", "en", {
      transcriptFetcher,
    })

    expect(transcriptFetcher).toHaveBeenNthCalledWith(
      1,
      "dQw4w9WgXcQ",
      expect.objectContaining({ lang: "en" })
    )
    expect(transcriptFetcher).toHaveBeenNthCalledWith(
      2,
      "dQw4w9WgXcQ",
      expect.objectContaining({ lang: "en-US" })
    )
    expect(result.language).toBe("en-US")
    expect(result.segments).toHaveLength(1)
  })

  it("marks a YouTube captcha as retryable and queue-blocking", async () => {
    const transcriptFetcher = vi
      .fn()
      .mockRejectedValue(new YoutubeTranscriptTooManyRequestError())

    await expect(
      getYoutubeTranscript("dQw4w9WgXcQ", "en", { transcriptFetcher })
    ).rejects.toMatchObject({
      name: "RetryableYoutubeTranscriptError",
      queueBlocking: true,
    })

    try {
      await getYoutubeTranscript("dQw4w9WgXcQ", "en", {
        transcriptFetcher,
      })
    } catch (error) {
      expect(isRetryableYoutubeTranscriptError(error)).toBe(true)
    }
  })

  it("pauses the queue during a provider-wide YouTube 5xx wave", async () => {
    const baseFetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 503 }))
    const transcriptFetcher = vi.fn(
      async (_videoId: string, options?: { fetch?: typeof fetch }) => {
        await options?.fetch?.("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
        return []
      }
    )

    await expect(
      getYoutubeTranscript("dQw4w9WgXcQ", "en", {
        transcriptFetcher,
        fetch: baseFetch,
      })
    ).rejects.toMatchObject({
      name: "RetryableYoutubeTranscriptError",
      queueBlocking: true,
    })
  })
})
