import { describe, expect, it } from "vitest"

import {
  appendWebSessionCookies,
  requireWebAccessAuthorization,
  requireWebRefreshToken,
} from "@/server/auth/web-session"

describe("web session cookies", () => {
  it("keeps access and refresh tokens in scoped HttpOnly cookies", () => {
    const headers = new Headers()
    appendWebSessionCookies(
      headers,
      {
        accessToken: "ce_at_secret",
        expiresAt: "2026-08-02T12:15:00.000Z",
        refreshToken: "ce_rt_secret",
        refreshExpiresAt: "2026-10-31T12:00:00.000Z",
      },
      new Date("2026-08-02T12:00:00.000Z")
    )

    const cookies = headers.getSetCookie().join("\n")
    expect(cookies).toContain("catch_english_access=ce_at_secret")
    expect(cookies).toContain("catch_english_refresh=ce_rt_secret")
    expect(cookies).toContain("HttpOnly")
    expect(cookies).toContain("SameSite=Lax")
    expect(cookies).toContain("Max-Age=900")
  })

  it("reads tokens only from the expected cookie names", () => {
    const request = new Request("https://catch.example/api/today", {
      headers: {
        Cookie:
          "catch_english_access=ce_at_cookie; catch_english_refresh=ce_rt_cookie",
      },
    })

    expect(requireWebAccessAuthorization(request)).toBe("Bearer ce_at_cookie")
    expect(requireWebRefreshToken(request)).toBe("ce_rt_cookie")
  })
})
