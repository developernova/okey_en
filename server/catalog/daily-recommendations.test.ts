import { describe, expect, it } from "vitest"

import type { CatalogItem } from "./catalog"
import {
  dailyCatalogPage,
  validateDailySelection,
} from "./daily-recommendations"

function candidate(id: string): CatalogItem {
  const [mediaType, rawId] = id.split("-") as ["movie" | "tv", string]
  return {
    id,
    tmdbId: Number(rawId),
    mediaType,
    section: mediaType === "movie" ? "movies" : "series",
    title: id,
    originalTitle: id,
    overview: "",
    releaseYear: "2026",
    posterUrl: "https://example.com/poster.jpg",
    backdropUrl: null,
    rating: 8,
    tmdbUrl: `https://example.com/${id}`,
    genreIds: [],
    learningLevel: "B1",
    languageSummaryRu: "Понятная современная речь",
    difficultyFactors: ["темп", "лексика"],
    confidence: "medium",
    analysisSource: "ai_metadata_estimate",
    recommended: true,
  }
}

describe("daily catalog recommendations", () => {
  it("uses a stable rotating TMDB page for the user and date", () => {
    const first = dailyCatalogPage("user-1", "2026-08-16")
    expect(first).toBeGreaterThanOrEqual(1)
    expect(first).toBeLessThanOrEqual(8)
    expect(dailyCatalogPage("user-1", "2026-08-16")).toBe(first)
  })

  it("accepts only unique candidate ids", () => {
    const candidates = [candidate("movie-1"), candidate("tv-2")]
    expect(
      validateDailySelection(
        {
          items: [
            { sourceId: "movie-1", reasonRu: "Подходит по уровню" },
            { sourceId: "tv-2", reasonRu: "Живая разговорная речь" },
          ],
        },
        candidates,
        2
      )
    ).toHaveLength(2)

    expect(() =>
      validateDailySelection(
        {
          items: [
            { sourceId: "movie-1", reasonRu: "Подходит по уровню" },
            { sourceId: "movie-1", reasonRu: "Повтор" },
          ],
        },
        candidates,
        2
      )
    ).toThrow()
  })
})
