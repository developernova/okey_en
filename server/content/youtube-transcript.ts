import {
  fetchTranscript,
  YoutubeTranscriptNotAvailableLanguageError,
  YoutubeTranscriptTooManyRequestError,
} from "youtube-transcript"

import type { TranscriptSegment } from "@/server/content/types"
import { normalizeText } from "@/server/content/text"
import { AppError } from "@/server/shared/errors"

const YOUTUBE_REQUEST_TIMEOUT_MS = 30_000

type TranscriptFetcher = typeof fetchTranscript

export class RetryableYoutubeTranscriptError extends Error {
  readonly queueBlocking: boolean

  constructor(
    message: string,
    options: { cause: unknown; queueBlocking: boolean }
  ) {
    super(message, { cause: options.cause })
    this.name = "RetryableYoutubeTranscriptError"
    this.queueBlocking = options.queueBlocking
  }
}

export function isRetryableYoutubeTranscriptError(
  error: unknown
): error is RetryableYoutubeTranscriptError {
  return error instanceof RetryableYoutubeTranscriptError
}

export function matchingTranscriptLanguage(
  requestedLanguage: string,
  availableLanguages: string[]
) {
  const requested = requestedLanguage.toLocaleLowerCase("en")
  const exact = availableLanguages.find(
    (language) => language.toLocaleLowerCase("en") === requested
  )
  if (exact) return exact

  const base = requested.split("-")[0]
  return availableLanguages.find((language) => {
    const available = language.toLocaleLowerCase("en")
    return available === base || available.startsWith(`${base}-`)
  })
}

function availableLanguages(error: Error) {
  const match = error.message.match(/Available languages:\s*(.+)$/i)
  return match?.[1]
    ?.split(",")
    .map((language) => language.trim())
    .filter(Boolean)
}

function normalizeTranscriptError(error: unknown): never {
  if (error instanceof YoutubeTranscriptTooManyRequestError) {
    throw new RetryableYoutubeTranscriptError(
      "YouTube temporarily requires a captcha",
      { cause: error, queueBlocking: true }
    )
  }
  if (
    error instanceof TypeError ||
    (error instanceof Error &&
      (error.name === "AbortError" || error.name === "TimeoutError"))
  ) {
    throw new RetryableYoutubeTranscriptError(
      "YouTube transcript request failed temporarily",
      { cause: error, queueBlocking: false }
    )
  }
  throw error
}

function transcriptFetch(baseFetch: typeof fetch) {
  return async (...args: Parameters<typeof fetch>) => {
    const [resource, init] = args
    const timeoutSignal = AbortSignal.timeout(YOUTUBE_REQUEST_TIMEOUT_MS)
    const signal = init?.signal
      ? AbortSignal.any([init.signal, timeoutSignal])
      : timeoutSignal
    const response = await baseFetch(resource, { ...init, signal })
    if (response.status === 429 || response.status >= 500) {
      throw new RetryableYoutubeTranscriptError(
        `YouTube returned temporary HTTP ${response.status}`,
        {
          cause: new Error(`YouTube HTTP ${response.status}`),
          // A provider-wide 5xx wave is just as capable of burning the rest of
          // a large playlist as a 429. Pause the drain and retry later.
          queueBlocking: response.status === 429 || response.status >= 500,
        }
      )
    }
    return response
  }
}

export function extractYoutubeId(value: string) {
  if (/^[a-zA-Z0-9_-]{11}$/.test(value)) return value

  try {
    const url = new URL(value)
    if (url.hostname === "youtu.be") return url.pathname.slice(1).split("/")[0]
    if (url.pathname.startsWith("/shorts/")) return url.pathname.split("/")[2]
    return url.searchParams.get("v") ?? ""
  } catch {
    return ""
  }
}

export async function getYoutubeTranscript(
  youtubeUrl: string,
  language = "en",
  dependencies: {
    transcriptFetcher?: TranscriptFetcher
    fetch?: typeof fetch
  } = {}
): Promise<{
  youtubeId: string
  language: string
  segments: TranscriptSegment[]
}> {
  const youtubeId = extractYoutubeId(youtubeUrl)

  if (!youtubeId) {
    throw new AppError(
      "Invalid YouTube URL or video id",
      400,
      "INVALID_YOUTUBE_URL"
    )
  }

  const transcriptFetcher = dependencies.transcriptFetcher ?? fetchTranscript
  const fetchFunction = transcriptFetch(dependencies.fetch ?? fetch)
  let selectedLanguage = language
  let raw

  try {
    raw = await transcriptFetcher(youtubeId, {
      lang: selectedLanguage,
      fetch: fetchFunction,
    })
  } catch (error) {
    if (error instanceof YoutubeTranscriptNotAvailableLanguageError) {
      const fallback = matchingTranscriptLanguage(
        selectedLanguage,
        availableLanguages(error) ?? []
      )
      if (fallback && fallback !== selectedLanguage) {
        selectedLanguage = fallback
        try {
          raw = await transcriptFetcher(youtubeId, {
            lang: selectedLanguage,
            fetch: fetchFunction,
          })
        } catch (fallbackError) {
          normalizeTranscriptError(fallbackError)
        }
      } else {
        throw error
      }
    } else {
      normalizeTranscriptError(error)
    }
  }

  if (!raw || raw.length === 0) {
    throw new AppError("Transcript is empty", 422, "EMPTY_TRANSCRIPT")
  }

  const sortedDurations = raw
    .map((segment) => segment.duration)
    .sort((a, b) => a - b)
  const medianDuration =
    sortedDurations[Math.floor(sortedDurations.length / 2)] ?? 0
  const valuesAreMilliseconds = medianDuration > 100
  const scale = valuesAreMilliseconds ? 1 : 1000

  const segments = raw
    .map((segment, index) => {
      const text = normalizeText(segment.text)
      return {
        index,
        text,
        normalizedText: normalizeText(text.toLocaleLowerCase("en")),
        offsetMs: Math.round(segment.offset * scale),
        durationMs: Math.round(segment.duration * scale),
      }
    })
    .filter((segment) => segment.text.length > 0)

  return {
    youtubeId,
    language: raw[0]?.lang ?? selectedLanguage,
    segments,
  }
}
