import { z } from "zod"

import type { CatalogItem } from "@/server/catalog/catalog"
import { env } from "@/server/config/env"

const learningLevelSchema = z.enum(["A2", "B1", "B2", "C1"])

const languageFitSchema = z.object({
  lexical_coverage: z.number().min(0).max(1),
  unknown_density: z.number().min(0).max(1),
  speech_rate_wpm: z.number().nonnegative(),
  average_utterance_words: z.number().nonnegative(),
  lexical_diversity: z.number().min(0).max(1),
  total_words: z.number().int().nonnegative(),
  unique_lemmas: z.number().int().nonnegative(),
  suggested_level: learningLevelSchema,
  fit_score: z.number().min(0).max(1),
  reasons_ru: z.array(z.string()).min(2).max(4),
  analysis_version: z.literal("language-fit-v1"),
})

const rankingSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      score: z.number().min(0).max(1),
      reasons_ru: z.array(z.string()).min(1).max(3),
    })
  ),
  ranking_version: z.literal("content-fit-v1"),
})

export type LanguageFit = {
  lexicalCoverage: number
  unknownDensity: number
  speechRateWpm: number
  averageUtteranceWords: number
  lexicalDiversity: number
  totalWords: number
  uniqueLemmas: number
  suggestedLevel: z.infer<typeof learningLevelSchema>
  fitScore: number
  reasonsRu: string[]
  analysisVersion: "language-fit-v1"
}

let unavailableUntil = 0

function configuration() {
  const config = env()
  if (!config.LANGUAGE_ENGINE_URL || !config.LANGUAGE_ENGINE_TOKEN) return null
  return {
    url: config.LANGUAGE_ENGINE_URL.replace(/\/$/, ""),
    token: config.LANGUAGE_ENGINE_TOKEN,
  }
}

export function languageEngineConfigured() {
  return configuration() !== null
}

async function engineRequest(path: string, body: unknown, timeoutMs: number) {
  const config = configuration()
  if (!config || Date.now() < unavailableUntil) return null
  try {
    const response = await fetch(`${config.url}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!response.ok)
      throw new Error(`Language engine returned ${response.status}`)
    unavailableUntil = 0
    return await response.json()
  } catch {
    unavailableUntil = Date.now() + 30_000
    return null
  }
}

export async function analyzeVideoLanguage(input: {
  learnerLevel: string | null
  knownLemmas: string[]
  segments: Array<{ text: string; offsetMs: number; durationMs: number }>
}): Promise<LanguageFit | null> {
  const learnerLevel = learningLevelSchema.catch("B1").parse(input.learnerLevel)
  const raw = await engineRequest(
    "/v1/analyze/video",
    {
      learner_level: learnerLevel,
      known_lemmas: input.knownLemmas,
      segments: input.segments.map((segment) => ({
        text: segment.text,
        offset_ms: segment.offsetMs,
        duration_ms: segment.durationMs,
      })),
    },
    2_500
  )
  const parsed = languageFitSchema.safeParse(raw)
  if (!parsed.success) return null
  return {
    lexicalCoverage: parsed.data.lexical_coverage,
    unknownDensity: parsed.data.unknown_density,
    speechRateWpm: parsed.data.speech_rate_wpm,
    averageUtteranceWords: parsed.data.average_utterance_words,
    lexicalDiversity: parsed.data.lexical_diversity,
    totalWords: parsed.data.total_words,
    uniqueLemmas: parsed.data.unique_lemmas,
    suggestedLevel: parsed.data.suggested_level,
    fitScore: parsed.data.fit_score,
    reasonsRu: parsed.data.reasons_ru,
    analysisVersion: parsed.data.analysis_version,
  }
}

export async function rankMovieCandidates(input: {
  learnerLevel: z.infer<typeof learningLevelSchema>
  candidates: CatalogItem[]
  preferenceText: string
  recentIds: string[]
  limit?: number
}) {
  const raw = await engineRequest(
    "/v1/rank/movies",
    {
      learner_level: input.learnerLevel,
      preference_text: input.preferenceText,
      recent_ids: input.recentIds,
      limit: input.limit ?? 12,
      candidates: input.candidates.map((candidate) => ({
        id: candidate.id,
        title: candidate.originalTitle,
        overview: candidate.overview,
        media_type: candidate.mediaType,
        learning_level: candidate.learningLevel,
        rating: candidate.rating,
        genres: candidate.difficultyFactors,
        language_summary: candidate.languageSummaryRu,
      })),
    },
    2_500
  )
  const parsed = rankingSchema.safeParse(raw)
  if (!parsed.success) return null
  const available = new Set(input.candidates.map((candidate) => candidate.id))
  const ids = parsed.data.items
    .map((item) => item.id)
    .filter((id) => available.has(id))
  return ids.length === new Set(ids).size ? ids : null
}

export function resetLanguageEngineCircuitForTests() {
  unavailableUntil = 0
}
