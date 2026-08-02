import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ refreshUserSession: vi.fn() }))

vi.mock("@/server/auth/user-session", () => ({
  refreshUserSession: mocks.refreshUserSession,
}))

import { POST } from "./route"

describe("POST /api/auth/session/refresh", () => {
  beforeEach(() => {
    mocks.refreshUserSession.mockReset().mockResolvedValue({
      accessToken: "ce_at_new",
      refreshToken: "ce_rt_new",
      expiresAt: "2026-08-02T12:15:00.000Z",
      refreshExpiresAt: "2026-10-31T12:00:00.000Z",
      user: {
        onboardingCompleted: false,
        placementLevel: null,
      },
    })
  })

  it("returns the native wire contract with no-store headers", async () => {
    const response = await POST(
      new Request("https://example.com/api/auth/session/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: "ce_rt_old" }),
      })
    )
    const payload = (await response.json()) as {
      data: { expiresAt: string; user: { onboardingCompleted: boolean } }
    }

    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
    expect(payload.data.expiresAt).toBe("2026-08-02T12:15:00.000Z")
    expect(payload.data.user.onboardingCompleted).toBe(false)
  })
})
