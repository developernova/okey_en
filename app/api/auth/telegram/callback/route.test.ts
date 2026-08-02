import { beforeEach, describe, expect, it, vi } from "vitest"

import { AppError } from "@/server/shared/errors"

const mocks = vi.hoisted(() => ({
  claimTelegramOidcAttempt: vi.fn(),
  completeTelegramOidcAttempt: vi.fn(),
  failTelegramOidcAttempt: vi.fn(),
}))

vi.mock("@/server/auth/telegram-oidc", () => ({
  claimTelegramOidcAttempt: mocks.claimTelegramOidcAttempt,
  completeTelegramOidcAttempt: mocks.completeTelegramOidcAttempt,
  failTelegramOidcAttempt: mocks.failTelegramOidcAttempt,
}))

import { GET } from "./route"

describe("GET /api/auth/telegram/callback", () => {
  beforeEach(() => {
    mocks.claimTelegramOidcAttempt.mockReset().mockResolvedValue({
      id: "attempt-id",
      oidcNonceHash: "nonce-hash",
      oidcCodeVerifier: "verifier",
    })
    mocks.completeTelegramOidcAttempt
      .mockReset()
      .mockResolvedValue(
        "catchenglish://auth?code=one-time&attempt_id=attempt-id"
      )
    mocks.failTelegramOidcAttempt
      .mockReset()
      .mockResolvedValue(
        "catchenglish://auth?error=cancelled&attempt_id=attempt-id"
      )
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
})
