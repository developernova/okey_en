import { beforeEach, describe, expect, it, vi } from "vitest"

const testEnv = vi.hoisted(() => ({
  LANGUAGE_ENGINE_URL: "http://language-engine:8000" as string | undefined,
  LANGUAGE_ENGINE_TOKEN: "language-engine-secret" as string | undefined,
}))

vi.mock("@/server/config/env", () => ({ env: () => testEnv }))

import {
  analyzeVideoLanguage,
  rankMovieCandidates,
  resetLanguageEngineCircuitForTests,
} from "./client"

describe("language engine client", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    resetLanguageEngineCircuitForTests()
    testEnv.LANGUAGE_ENGINE_URL = "http://language-engine:8000"
    testEnv.LANGUAGE_ENGINE_TOKEN = "language-engine-secret"
  })

  it("maps the video analysis response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          lexical_coverage: 0.82,
          unknown_density: 0.18,
          speech_rate_wpm: 128,
          average_utterance_words: 7.2,
          lexical_diversity: 0.31,
          total_words: 120,
          unique_lemmas: 52,
          suggested_level: "B1",
          fit_score: 0.91,
          reasons_ru: ["Знакомая лексика", "Комфортная скорость"],
          analysis_version: "language-fit-v1",
        })
      )
    )

    await expect(
      analyzeVideoLanguage({
        learnerLevel: "B1",
        knownLemmas: ["family"],
        segments: [{ text: "A family talks.", offsetMs: 0, durationMs: 1000 }],
      })
    ).resolves.toMatchObject({
      lexicalCoverage: 0.82,
      suggestedLevel: "B1",
      analysisVersion: "language-fit-v1",
    })
  })

  it("fails open when the service is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")))
    await expect(
      analyzeVideoLanguage({
        learnerLevel: "B1",
        knownLemmas: [],
        segments: [{ text: "Test", offsetMs: 0, durationMs: 1000 }],
      })
    ).resolves.toBeNull()
  })

  it("rejects duplicate ids returned by the ranking service", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          items: [
            { id: "movie-1", score: 0.9, reasons_ru: ["Уровень"] },
            { id: "movie-1", score: 0.8, reasons_ru: ["Повтор"] },
          ],
          ranking_version: "content-fit-v1",
        })
      )
    )
    const candidate = {
      id: "movie-1",
      tmdbId: 1,
      mediaType: "movie" as const,
      section: "movies" as const,
      title: "Movie",
      originalTitle: "Movie",
      overview: "",
      releaseYear: "2026",
      posterUrl: "https://example.com/poster.jpg",
      backdropUrl: null,
      rating: 8,
      tmdbUrl: "https://example.com/movie",
      genreIds: [],
      learningLevel: "B1" as const,
      languageSummaryRu: "Разговорная речь",
      difficultyFactors: ["темп", "лексика"],
      confidence: "medium" as const,
      analysisSource: "ai_metadata_estimate" as const,
      recommended: true,
    }
    await expect(
      rankMovieCandidates({
        learnerLevel: "B1",
        candidates: [candidate],
        preferenceText: "",
        recentIds: [],
      })
    ).resolves.toBeNull()
  })
})
