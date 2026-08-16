import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ refreshUserSession: vi.fn() }))

vi.mock("@/server/auth/user-session", () => ({
  refreshUserSession: mocks.refreshUserSession,
}))

import { POST } from "./route"

describe("POST /api/auth/web/refresh", () => {
  beforeEach(() => {
    mocks.refreshUserSession.mockReset().mockResolvedValue({
      accessToken: "ce_at_new",
      refreshToken: "ce_rt_new",
      expiresAt: "2026-08-02T12:15:00.000Z",
      refreshExpiresAt: "2026-10-31T12:00:00.000Z",
      user: { onboardingCompleted: true },
    })
  })

  it("rotates the cookie session without exposing tokens in JSON", async () => {
    const response = await POST(
      new Request("https://catch.example/api/auth/web/refresh", {
        method: "POST",
        headers: { Cookie: "catch_english_refresh=ce_rt_old" },
      })
    )
    const body = await response.text()

    expect(response.status).toBe(200)
    expect(mocks.refreshUserSession).toHaveBeenCalledWith("ce_rt_old")
    expect(body).not.toContain("ce_at_new")
    expect(body).not.toContain("ce_rt_new")
    const cookies = response.headers.getSetCookie().join("\n")
    expect(cookies).toContain("catch_english_access=ce_at_new")
    expect(cookies).toContain("catch_english_refresh=ce_rt_new")
  })
})
