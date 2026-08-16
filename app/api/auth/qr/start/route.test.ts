import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ createQrAuthChallenge: vi.fn() }))

vi.mock("node:os", () => ({
  networkInterfaces: () => ({
    en0: [
      {
        family: "IPv4",
        internal: false,
        address: "192.168.0.5",
      },
    ],
  }),
}))

vi.mock("@/server/auth/qr-auth", () => ({
  createQrAuthChallenge: mocks.createQrAuthChallenge,
}))

import { POST } from "./route"

describe("POST /api/auth/qr/start", () => {
  beforeEach(() => {
    mocks.createQrAuthChallenge.mockReset().mockResolvedValue({
      id: "774b9ccb-5bc8-4f87-9b8b-e44fbd7773fd",
      publicToken: "q".repeat(43),
      desktopVerifier: "v".repeat(43),
      expiresAt: new Date("2027-08-16T12:03:00.000Z"),
    })
  })

  it("returns only the public phone URL and keeps the desktop verifier HttpOnly", async () => {
    const response = await POST(
      new Request("https://catch.example/api/auth/qr/start", {
        method: "POST",
      })
    )
    const payload = await response.json()

    expect(response.status).toBe(201)
    expect(payload.data).toEqual({
      qrUrl: `https://catch.example/login/qr/${"q".repeat(43)}`,
      expiresAt: "2027-08-16T12:03:00.000Z",
    })
    expect(JSON.stringify(payload)).not.toContain("v".repeat(43))
    const cookies = response.headers.getSetCookie().join("\n")
    expect(cookies).toContain("catch_english_qr_challenge=")
    expect(cookies).toContain("HttpOnly")
    expect(cookies).toContain("Path=/api/auth/qr")
  })

  it("uses the local network address for a QR code created on localhost", async () => {
    const response = await POST(
      new Request("http://localhost:3000/api/auth/qr/start", {
        method: "POST",
      })
    )
    const payload = await response.json()

    expect(payload.data.qrUrl).toBe(
      `http://192.168.0.5:3000/login/qr/${"q".repeat(43)}`
    )
  })
})
