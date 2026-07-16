import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("@/server/config/env", () => ({
  env: () => ({
    OPENAI_TEXT_MODEL: "gpt-5.4-mini",
    OPENAI_API_KEY: "text-key",
  }),
}))

import { extractPhrases } from "./openai"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("OpenAI import accounting", () => {
  it("reports usage before validating model JSON and sends a direct OpenAI request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "generation-1",
          model: "gpt-5.4-mini",
          choices: [{ message: { content: "not valid JSON" } }],
          usage: {
            prompt_tokens: 120,
            completion_tokens: 30,
            total_tokens: 150,
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
      costUsd: 0.000225,
    })
    const request = JSON.parse(
      String(fetchMock.mock.calls[0]?.[1]?.body)
    ) as Record<string, unknown>
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.openai.com/v1/chat/completions"
    )
    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers)
    expect(headers.get("Authorization")).toBe("Bearer text-key")
    expect(headers.get("HTTP-Referer")).toBeNull()
    expect(headers.get("X-OpenRouter-Title")).toBeNull()
    expect(request).toMatchObject({
      model: "gpt-5.4-mini",
      reasoning_effort: "none",
      max_completion_tokens: 2_800,
    })
    expect(request).not.toHaveProperty("max_tokens")
    expect(request).not.toHaveProperty("provider")
    expect(request).not.toHaveProperty("session_id")
  })
})
