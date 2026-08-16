import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  approveQrAuthChallenge: vi.fn(),
  requireUserId: vi.fn(),
}))

vi.mock("@/server/auth/qr-auth", () => ({
  approveQrAuthChallenge: mocks.approveQrAuthChallenge,
}))
vi.mock("@/server/auth/user-context", () => ({
  requireUserId: mocks.requireUserId,
}))

import { POST } from "./route"
import { AppError } from "@/server/shared/errors"

describe("POST /api/auth/qr/approve", () => {
  beforeEach(() => {
    mocks.requireUserId.mockReset().mockResolvedValue("user-id")
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
    expect(mocks.requireUserId).toHaveBeenCalledOnce()
    expect(mocks.approveQrAuthChallenge).toHaveBeenCalledWith(token, "user-id")
  })

  it("accepts the already authenticated Telegram Mini App user", async () => {
    const token = "q".repeat(43)
    const response = await POST(
      new Request("https://catch.example/api/auth/qr/approve", {
        method: "POST",
        headers: {
          "x-telegram-init-data": "query_id=signed-telegram-data",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token }),
      })
    )

    expect(response.status).toBe(200)
    expect(mocks.requireUserId).toHaveBeenCalledOnce()
    expect(mocks.approveQrAuthChallenge).toHaveBeenCalledWith(token, "user-id")
  })

  it("requires an authenticated phone session", async () => {
    mocks.requireUserId.mockRejectedValueOnce(
      new AppError("Authentication required", 401, "AUTH_REQUIRED")
    )
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
