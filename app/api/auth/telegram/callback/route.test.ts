import { beforeEach, describe, expect, it, vi } from "vitest"

import { AppError } from "@/server/shared/errors"

const mocks = vi.hoisted(() => ({
  claimTelegramOidcAttempt: vi.fn(),
  completeTelegramOidcAttempt: vi.fn(),
  failTelegramOidcAttempt: vi.fn(),
  exchangeTelegramHandoff: vi.fn(),
}))

vi.mock("@/server/auth/telegram-oidc", () => ({
  claimTelegramOidcAttempt: mocks.claimTelegramOidcAttempt,
  completeTelegramOidcAttempt: mocks.completeTelegramOidcAttempt,
  failTelegramOidcAttempt: mocks.failTelegramOidcAttempt,
}))

vi.mock("@/server/auth/user-session", () => ({
  exchangeTelegramHandoff: mocks.exchangeTelegramHandoff,
}))

import { GET } from "./route"

describe("GET /api/auth/telegram/callback", () => {
  beforeEach(() => {
    mocks.claimTelegramOidcAttempt.mockReset().mockResolvedValue({
      id: "attempt-id",
      platform: "ios",
      oidcNonceHash: "nonce-hash",
      oidcCodeVerifier: "verifier",
    })
    mocks.completeTelegramOidcAttempt.mockReset().mockResolvedValue({
      attemptId: "attempt-id",
      handoffCode: "one-time",
      platform: "ios",
      redirectUrl: "catchenglish://auth?code=one-time&attempt_id=attempt-id",
    })
    mocks.failTelegramOidcAttempt
      .mockReset()
      .mockResolvedValue(
        "catchenglish://auth?error=cancelled&attempt_id=attempt-id"
      )
    mocks.exchangeTelegramHandoff.mockReset().mockResolvedValue({
      accessToken: "ce_at_web",
      expiresAt: "2026-08-02T12:15:00.000Z",
      refreshToken: "ce_rt_web",
      refreshExpiresAt: "2026-10-31T12:00:00.000Z",
      user: { onboardingCompleted: true },
    })
  })

  it("redirects only the one-time handoff result with private no-store headers", async () => {
    const response = await GET(
      new Request(
        "https://api.example.com/api/auth/telegram/callback?code=telegram-code&state=opaque-state"
      )
    )
    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toBe(
      "catchenglish://auth?code=one-time&attempt_id=attempt-id"
    )
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(response.headers.get("referrer-policy")).toBe("no-referrer")
  })

  it("does not redirect an invalid state to the app", async () => {
    mocks.claimTelegramOidcAttempt.mockRejectedValueOnce(
      new AppError("Invalid state", 400, "TELEGRAM_AUTH_STATE_INVALID")
    )
    const response = await GET(
      new Request(
        "https://api.example.com/api/auth/telegram/callback?code=code&state=invalid"
      )
    )
    expect(response.status).toBe(400)
    expect(response.headers.get("location")).toBeNull()
    expect(response.headers.get("cache-control")).toBe("no-store")
  })

  it("exchanges a web handoff into HttpOnly cookies and returns to the site", async () => {
    mocks.claimTelegramOidcAttempt.mockResolvedValueOnce({
      id: "attempt-id",
      platform: "web",
      oidcNonceHash: "nonce-hash",
      oidcCodeVerifier: "verifier",
    })
    mocks.completeTelegramOidcAttempt.mockResolvedValueOnce({
      attemptId: "attempt-id",
      handoffCode: "one-time",
      platform: "web",
      redirectUrl: null,
    })

    const response = await GET(
      new Request(
        "https://catch.example/api/auth/telegram/callback?code=telegram-code&state=opaque-state",
        {
          headers: {
            Cookie:
              "catch_english_auth_attempt=attempt-id; catch_english_auth_verifier=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-",
          },
        }
      )
    )

    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toBe("https://catch.example/")
    expect(mocks.exchangeTelegramHandoff).toHaveBeenCalledWith(
      expect.objectContaining({
        attemptId: "attempt-id",
        code: "one-time",
      })
    )
    const cookies = response.headers.getSetCookie().join("\n")
    expect(cookies).toContain("catch_english_access=ce_at_web")
    expect(cookies).toContain("catch_english_refresh=ce_rt_web")
    expect(cookies).toContain("HttpOnly")
    expect(response.headers.get("location")).not.toContain("ce_at_web")
  })

  it("rejects a web callback that has no matching handoff cookie", async () => {
    mocks.claimTelegramOidcAttempt.mockResolvedValueOnce({
      id: "attempt-id",
      platform: "web",
      oidcNonceHash: "nonce-hash",
      oidcCodeVerifier: "verifier",
    })

    const response = await GET(
      new Request(
        "https://catch.example/api/auth/telegram/callback?code=telegram-code&state=opaque-state"
      )
    )

    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toBe(
      "https://catch.example/login?auth_error=authentication_failed"
    )
    expect(mocks.completeTelegramOidcAttempt).not.toHaveBeenCalled()
    expect(mocks.exchangeTelegramHandoff).not.toHaveBeenCalled()
  })
})
