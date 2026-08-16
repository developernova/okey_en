import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ startTelegramOidc: vi.fn() }))

vi.mock("@/server/auth/telegram-oidc", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/server/auth/telegram-oidc")>()
  return { ...original, startTelegramOidc: mocks.startTelegramOidc }
})

import { GET } from "./route"

describe("GET /api/auth/telegram/web/start", () => {
  beforeEach(() => {
    mocks.startTelegramOidc.mockReset().mockResolvedValue({
      attemptId: "774b9ccb-5bc8-4f87-9b8b-e44fbd7773fd",
      authorizationUrl: "https://oauth.telegram.org/auth?state=opaque",
      expiresAt: "2026-08-02T12:05:00.000Z",
    })
  })

  it("starts web PKCE and keeps its verifier in an HttpOnly cookie", async () => {
    const response = await GET(
      new Request("https://catch.example/api/auth/telegram/web/start")
    )

    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toBe(
      "https://oauth.telegram.org/auth?state=opaque"
    )
    expect(mocks.startTelegramOidc).toHaveBeenCalledWith(
      expect.objectContaining({
        platform: "web",
        deviceName: "Web browser",
        deviceId: expect.any(String),
        handoffCodeChallenge: expect.stringMatching(/^[A-Za-z\d_-]{43}$/),
      })
    )
    const cookies = response.headers.getSetCookie().join("\n")
    expect(cookies).toContain("catch_english_auth_attempt=")
    expect(cookies).toContain("catch_english_auth_verifier=")
    expect(cookies).toContain("catch_english_device=")
    expect(cookies).toContain("HttpOnly")
    expect(response.headers.get("cache-control")).toBe("no-store")
  })

  it("returns authentication failures to the dedicated login page", async () => {
    mocks.startTelegramOidc.mockRejectedValueOnce(new Error("Unavailable"))

    const response = await GET(
      new Request("https://catch.example/api/auth/telegram/web/start")
    )

    expect(response.status).toBe(302)
    expect(response.headers.get("location")).toBe(
      "https://catch.example/login?auth_error=authentication_failed"
    )
  })

  it("keeps a validated QR confirmation return path in an HttpOnly cookie", async () => {
    const token = "q".repeat(43)
    const response = await GET(
      new Request(
        `https://catch.example/api/auth/telegram/web/start?return_to=${encodeURIComponent(`/login/qr/${token}`)}`
      )
    )

    expect(response.status).toBe(302)
    expect(response.headers.getSetCookie().join("\n")).toContain(
      `catch_english_auth_return=%2Flogin%2Fqr%2F${token}`
    )
  })

  it("ignores an external return path", async () => {
    const response = await GET(
      new Request(
        "https://catch.example/api/auth/telegram/web/start?return_to=https%3A%2F%2Fevil.example"
      )
    )

    expect(response.headers.getSetCookie().join("\n")).not.toContain(
      "catch_english_auth_return="
    )
  })
})
