import { fetchTranscript } from "youtube-transcript"

import type { TranscriptSegment } from "@/server/content/types"
import { normalizeText } from "@/server/content/text"
import { AppError } from "@/server/shared/errors"

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
  language = "en"
): Promise<{ youtubeId: string; segments: TranscriptSegment[] }> {
  const youtubeId = extractYoutubeId(youtubeUrl)

  if (!youtubeId) {
    throw new AppError(
      "Invalid YouTube URL or video id",
      400,
      "INVALID_YOUTUBE_URL"
    )
  }

  const raw = await fetchTranscript(youtubeId, { lang: language })

  if (raw.length === 0) {
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

  return { youtubeId, segments }
}
