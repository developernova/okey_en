import { describe, expect, it } from "vitest"

import {
  adminSessionLifetimeSeconds,
  createAdminSessionToken,
  secureStringEqual,
  verifyAdminSessionToken,
} from "./admin-session"

describe("admin session", () => {
  const secret = "a-secret-that-is-long-enough"
  const now = new Date("2026-07-13T12:00:00.000Z")

  it("accepts a signed token before expiry", () => {
    const token = createAdminSessionToken(secret, now)
    const later = new Date(now.getTime() + 60_000)
    expect(verifyAdminSessionToken(token, secret, later)).toBe(true)
  })

  it("rejects tampered and expired tokens", () => {
    const token = createAdminSessionToken(secret, now)
    expect(verifyAdminSessionToken(`${token}x`, secret, now)).toBe(false)
    expect(
      verifyAdminSessionToken(
        token,
        secret,
        new Date(now.getTime() + adminSessionLifetimeSeconds * 1_000)
      )
    ).toBe(false)
  })

  it("compares secrets without accepting different lengths", () => {
    expect(secureStringEqual(secret, secret)).toBe(true)
    expect(secureStringEqual(secret, `${secret}x`)).toBe(false)
  })
})
