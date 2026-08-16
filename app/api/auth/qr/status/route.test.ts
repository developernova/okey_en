import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ exchangeQrAuthChallenge: vi.fn() }))

vi.mock("@/server/auth/user-session", () => ({
  exchangeQrAuthChallenge: mocks.exchangeQrAuthChallenge,
}))

import { GET } from "./route"

const cookie = `catch_english_qr_challenge=774b9ccb-5bc8-4f87-9b8b-e44fbd7773fd.${"v".repeat(43)}`

describe("GET /api/auth/qr/status", () => {
  beforeEach(() => mocks.exchangeQrAuthChallenge.mockReset())

  it("keeps a pending desktop request unauthenticated", async () => {
    mocks.exchangeQrAuthChallenge.mockResolvedValue({ kind: "pending" })
    const response = await GET(
      new Request("https://catch.example/api/auth/qr/status", {
        headers: { Cookie: cookie },
      })
    )

    await expect(response.json()).resolves.toEqual({
      data: { status: "pending" },
    })
    expect(response.headers.getSetCookie()).toHaveLength(0)
  })

  it("sets the normal web session only after one-time approval", async () => {
    mocks.exchangeQrAuthChallenge.mockResolvedValue({
      kind: "authenticated",
      accessToken: "ce_at_qr",
      expiresAt: "2027-08-16T12:15:00.000Z",
      refreshToken: "ce_rt_qr",
      refreshExpiresAt: "2027-11-14T12:00:00.000Z",
      user: { id: "user-id" },
    })
    const response = await GET(
      new Request("https://catch.example/api/auth/qr/status", {
        headers: { Cookie: cookie },
      })
    )

    expect(response.status).toBe(200)
    const cookies = response.headers.getSetCookie().join("\n")
    expect(cookies).toContain("catch_english_access=ce_at_qr")
    expect(cookies).toContain("catch_english_refresh=ce_rt_qr")
    expect(cookies).toContain("catch_english_qr_challenge=;")
  })
})
