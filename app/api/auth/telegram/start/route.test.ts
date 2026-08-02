import { beforeEach, describe, expect, it, vi } from "vitest"

import { AppError } from "@/server/shared/errors"

const mocks = vi.hoisted(() => ({ startTelegramOidc: vi.fn() }))

vi.mock("@/server/auth/telegram-oidc", () => ({
  startTelegramOidc: mocks.startTelegramOidc,
}))

import { POST } from "./route"

describe("POST /api/auth/telegram/start", () => {
  beforeEach(() => {
    mocks.startTelegramOidc.mockReset().mockResolvedValue({
      attemptId: "774b9ccb-5bc8-4f87-9b8b-e44fbd7773fd",
      authorizationUrl: "https://oauth.telegram.org/auth?state=opaque",
      expiresAt: "2026-08-02T12:05:00.000Z",
    })
  })

  it("validates the double-PKCE handoff and disables caching", async () => {
    const response = await POST(
      new Request("https://example.com/api/auth/telegram/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: "ios",
          deviceId: "3e39bc31-8a7d-4d0f-a4d6-b0049d0068d3",
          deviceName: "iPhone",
          handoffCodeChallenge: "a".repeat(43),
          handoffCodeChallengeMethod: "S256",
        }),
      })
    )

    expect(response.status).toBe(201)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(response.headers.get("pragma")).toBe("no-cache")
    expect(mocks.startTelegramOidc).toHaveBeenCalledWith(
      expect.objectContaining({ platform: "ios" })
    )
  })

  it("rejects any handoff challenge method except S256", async () => {
    const response = await POST(
      new Request("https://example.com/api/auth/telegram/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: "macos",
          deviceId: "3e39bc31-8a7d-4d0f-a4d6-b0049d0068d3",
          handoffCodeChallenge: "a".repeat(43),
          handoffCodeChallengeMethod: "plain",
        }),
      })
    )
    expect(response.status).toBe(400)
    expect(mocks.startTelegramOidc).not.toHaveBeenCalled()
  })

  it("does not log provider or database error contents", async () => {
    mocks.startTelegramOidc.mockRejectedValueOnce(
      new Error("refreshToken=must-never-reach-logs")
    )
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

    try {
      const response = await POST(
        new Request("https://example.com/api/auth/telegram/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            platform: "ios",
            deviceId: "3e39bc31-8a7d-4d0f-a4d6-b0049d0068d3",
            handoffCodeChallenge: "a".repeat(43),
            handoffCodeChallengeMethod: "S256",
          }),
        })
      )

      expect(response.status).toBe(500)
      expect(consoleError).toHaveBeenCalledWith(
        "Unexpected authentication request failure",
        { name: "Error" }
      )
      expect(JSON.stringify(consoleError.mock.calls)).not.toContain(
        "must-never-reach-logs"
      )
    } finally {
      consoleError.mockRestore()
    }
  })

  it("requires a stable device UUID", async () => {
    const response = await POST(
      new Request("https://example.com/api/auth/telegram/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: "ios",
          handoffCodeChallenge: "a".repeat(43),
          handoffCodeChallengeMethod: "S256",
        }),
      })
    )

    expect(response.status).toBe(400)
    expect(mocks.startTelegramOidc).not.toHaveBeenCalled()
  })

  it("returns a retry hint when the durable limiter rejects a start", async () => {
    mocks.startTelegramOidc.mockRejectedValueOnce(
      new AppError("Too many attempts", 429, "NATIVE_AUTH_RATE_LIMITED", {
        retryAfterSeconds: 600,
      })
    )
    const response = await POST(
      new Request("https://example.com/api/auth/telegram/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: "ios",
          deviceId: "3e39bc31-8a7d-4d0f-a4d6-b0049d0068d3",
          handoffCodeChallenge: "a".repeat(43),
          handoffCodeChallengeMethod: "S256",
        }),
      })
    )

    expect(response.status).toBe(429)
    expect(response.headers.get("retry-after")).toBe("600")
  })
})
