import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/server/config/env", () => ({
  env: () => ({
    OPENROUTER_MODEL: "test/model",
    OPENROUTER_API_KEY: "test-key",
    OPENROUTER_APP_URL: "https://example.test",
    OPENROUTER_APP_NAME: "Test",
  }),
}))

import { extractPhrases } from "./openrouter"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("OpenRouter import accounting", () => {
  it("reports usage before validating model JSON and sends max_tokens", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "generation-1",
          model: "test/model",
          choices: [{ message: { content: "not valid JSON" } }],
          usage: {
            prompt_tokens: 120,
            completion_tokens: 30,
            total_tokens: 150,
            cost: 0.0042,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    )
    vi.stubGlobal("fetch", fetchMock)
    const onUsage = vi.fn()

    await expect(
      extractPhrases({
        segments: [
          {
            index: 0,
            text: "Get out of bed",
            normalizedText: "get out of bed",
            offsetMs: 0,
            durationMs: 1_000,
          },
        ],
        maxPhrases: 15,
        onUsage,
      })
    ).rejects.toThrow()

    expect(onUsage).toHaveBeenCalledWith({
      promptTokens: 120,
      completionTokens: 30,
      totalTokens: 150,
      costUsd: 0.0042,
    })
    const request = JSON.parse(
      String(fetchMock.mock.calls[0]?.[1]?.body)
    ) as Record<string, unknown>
    expect(request.max_tokens).toBe(2_800)
  })
})
