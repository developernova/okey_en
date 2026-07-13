import type { TranscriptSegment } from "@/server/content/types"

const htmlEntities: Record<string, string> = {
  "&amp;": "&",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&lt;": "<",
  "&gt;": ">",
}

export function normalizeText(value: string) {
  return value
    .replace(
      /&(?:amp|quot|#39|apos|lt|gt);/g,
      (entity) => htmlEntities[entity] ?? entity
    )
    .replace(/\s+/g, " ")
    .trim()
}

export function normalizePhrase(value: string) {
  return normalizeText(value)
    .toLocaleLowerCase("en")
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'")
    .replace(/[^a-z0-9' -]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

export function countLexemes(segments: TranscriptSegment[]) {
  const counts = new Map<string, number>()

  for (const segment of segments) {
    const tokens = segment.normalizedText
      .toLocaleLowerCase("en")
      .match(/[a-z]+(?:'[a-z]+)?/g)

    for (const token of tokens ?? []) {
      counts.set(token, (counts.get(token) ?? 0) + 1)
    }
  }

  return [...counts.entries()].map(([lemma, frequency]) => ({
    lemma,
    frequency,
  }))
}

export function transcriptDurationSeconds(segments: TranscriptSegment[]) {
  const finalMs = Math.max(
    ...segments.map((segment) => segment.offsetMs + segment.durationMs)
  )
  return Math.max(1, Math.ceil(finalMs / 1000))
}
