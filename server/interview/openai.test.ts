import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/server/config/env", () => ({
  env: () => ({
    OPENAI_API_KEY: "text-key",
    OPENAI_TEXT_MODEL: "gpt-5.4-mini",
  }),
}))

import { generateInterviewQuestions } from "./openai"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("OpenAI interview requests", () => {
  it("uses the direct OpenAI text path with structured output", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: JSON.stringify({
                  questions: [
                    {
                      kind: "factual",
                      text: "Weather?",
                      glossary: [
                        {
                          word: "Weather",
                          lemma: "weather",
                          translationRu: "погода",
                        },
                      ],
                    },
                    {
                      kind: "retell",
                      text: "Family?",
                      glossary: [
                        {
                          word: "Family",
                          lemma: "family",
                          translationRu: "семья",
                        },
                      ],
                    },
                    {
                      kind: "transfer",
                      text: "Travel?",
                      glossary: [
                        {
                          word: "Travel",
                          lemma: "travel",
                          translationRu: "путешествовать",
                        },
                      ],
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

    await expect(
      generateInterviewQuestions({
        episodeId: "00000000-0000-4000-8000-000000000001",
        transcript: "The family talks about the weather before they travel.",
        learnerLevel: "A2",
        knownVocabulary: ["family", "weather", "travel"],
      })
    ).resolves.toMatchObject({ questions: expect.any(Array) })

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.openai.com/v1/chat/completions"
    )
    const init = fetchMock.mock.calls[0]?.[1]
    const headers = new Headers(init?.headers)
    const request = JSON.parse(String(init?.body)) as Record<string, unknown>
    expect(headers.get("Authorization")).toBe("Bearer text-key")
    expect(headers.get("HTTP-Referer")).toBeNull()
    expect(headers.get("X-OpenRouter-Title")).toBeNull()
    expect(request).toMatchObject({
      model: "gpt-5.4-mini",
      reasoning_effort: "none",
      max_completion_tokens: 1_400,
      response_format: { type: "json_schema" },
    })
    expect(request).not.toHaveProperty("max_tokens")
    expect(request).not.toHaveProperty("provider")
    expect(request).not.toHaveProperty("session_id")
  })
})
