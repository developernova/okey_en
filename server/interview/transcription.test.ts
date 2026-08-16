import { afterEach, describe, expect, it, vi } from "vitest"

const { userId, episodeId } = vi.hoisted(() => ({
  userId: "00000000-0000-4000-8000-000000000001",
  episodeId: "00000000-0000-4000-8000-000000000002",
}))

vi.mock("@/server/config/env", () => ({
  env: () => ({
    OPENAI_API_KEY: "text-key",
    OPENAI_TEXT_MODEL: "gpt-5.4-mini",
    OPENROUTER_API_KEY: "voice-key",
    OPENROUTER_APP_URL: "https://example.test",
    OPENROUTER_APP_NAME: "Catch English Test",
    OPENROUTER_TRANSCRIPTION_MODEL: "openai/whisper-large-v3",
  }),
}))

vi.mock("@/server/interview/rate-limit", () => ({
  reserveInterviewRequest: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/server/interview/session", () => ({
  verifyInterviewState: () => ({
    userId,
    episodeId,
    mode: "interview",
    answersCompleted: 0,
    issuedAt: Date.now(),
  }),
}))

import { transcribeInterviewAudio } from "./transcription"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("interview transcription routing", () => {
  it("keeps the audio file on the private OpenRouter path", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ text: "It is sunny today." }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    )
    vi.stubGlobal("fetch", fetchMock)

    await expect(
      transcribeInterviewAudio({
        userId,
        episodeId,
        sessionToken: "test-session",
        audio: new File(["voice"], "answer.webm", { type: "audio/webm" }),
      })
    ).resolves.toEqual({ text: "It is sunny today." })

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://openrouter.ai/api/v1/audio/transcriptions"
    )
    const init = fetchMock.mock.calls[0]?.[1]
    const headers = new Headers(init?.headers)
    expect(headers.get("Authorization")).toBe("Bearer voice-key")
    expect(headers.get("Authorization")).not.toContain("text-key")
    const body = init?.body as FormData
    expect(body).toBeInstanceOf(FormData)
    expect(body.get("model")).toBe("openai/whisper-large-v3")
    expect(body.get("language")).toBe("en")
    expect(body.get("temperature")).toBe("0")
  })
})
