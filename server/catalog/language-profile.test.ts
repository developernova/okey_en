import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { testEnv } = vi.hoisted(() => ({
  testEnv: {
    OPENAI_API_KEY: "catalog-key" as string | undefined,
    OPENAI_TEXT_MODEL: "gpt-5.4-mini",
  },
}))

vi.mock("@/server/config/env", () => ({
  env: () => testEnv,
}))

import {
  analyzeCatalogMetadata,
  type CatalogLanguageInput,
} from "./language-profile"

const input: CatalogLanguageInput = {
  tmdbId: 550,
  mediaType: "movie",
  title: "Бойцовский клуб",
  originalTitle: "Fight Club",
  overview: "An insomniac meets a soap maker.",
  releaseYear: "1999",
  genreNames: ["drama"],
}

afterEach(() => {
  vi.unstubAllGlobals()
})

beforeEach(() => {
  testEnv.OPENAI_API_KEY = "catalog-key"
})

describe("catalog metadata analysis", () => {
  it("requests a structured preliminary language profile", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  items: [
                    {
                      sourceId: "movie-550",
                      learningLevel: "B2",
                      languageSummaryRu: "Подойдёт уверенному среднему уровню.",
                      difficultyFactors: [
                        "разговорная речь",
                        "абстрактные темы",
                      ],
                      confidence: "high",
                    },
                  ],
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    )
    vi.stubGlobal("fetch", fetchMock)

    const profiles = await analyzeCatalogMetadata([input])

    expect(profiles.get("movie-550")).toMatchObject({
      learningLevel: "B2",
      confidence: "high",
    })
    const request = JSON.parse(
      String(fetchMock.mock.calls[0]?.[1]?.body)
    ) as Record<string, unknown>
    expect(request).toMatchObject({
      model: "gpt-5.4-mini",
      reasoning_effort: "low",
      response_format: { type: "json_schema" },
    })
    expect(JSON.stringify(request)).toContain("metadata estimate")
    expect(JSON.stringify(request)).toContain("Fight Club")
  })

  it("rejects a response that omits a requested title", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({ items: [] }),
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
    )

    await expect(analyzeCatalogMetadata([input])).rejects.toMatchObject({
      code: "CATALOG_AI_INCOMPLETE",
    })
  })
})
