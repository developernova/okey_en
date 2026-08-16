import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  approveQrAuthChallenge: vi.fn(),
  resolveAccessSession: vi.fn(),
}))

vi.mock("@/server/auth/qr-auth", () => ({
  approveQrAuthChallenge: mocks.approveQrAuthChallenge,
}))
vi.mock("@/server/auth/user-session", () => ({
  resolveAccessSession: mocks.resolveAccessSession,
}))

import { POST } from "./route"

describe("POST /api/auth/qr/approve", () => {
  beforeEach(() => {
    mocks.resolveAccessSession
      .mockReset()
      .mockResolvedValue({ userId: "user-id" })
    mocks.approveQrAuthChallenge
      .mockReset()
      .mockResolvedValue({ approved: true })
  })

  it("binds the QR request to the currently authenticated phone user", async () => {
    const token = "q".repeat(43)
    const response = await POST(
      new Request("https://catch.example/api/auth/qr/approve", {
        method: "POST",
        headers: {
          Cookie: "catch_english_access=ce_at_phone",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token }),
      })
    )

    expect(response.status).toBe(200)
    expect(mocks.resolveAccessSession).toHaveBeenCalledWith(
      "Bearer ce_at_phone"
    )
    expect(mocks.approveQrAuthChallenge).toHaveBeenCalledWith(token, "user-id")
  })

  it("requires an authenticated phone session", async () => {
    const response = await POST(
      new Request("https://catch.example/api/auth/qr/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: "q".repeat(43) }),
      })
    )

    expect(response.status).toBe(401)
    expect(mocks.approveQrAuthChallenge).not.toHaveBeenCalled()
  })
})
