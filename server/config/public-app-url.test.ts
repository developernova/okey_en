import { afterEach, describe, expect, it, vi } from "vitest"

import {
  PRODUCTION_APP_ORIGIN,
  publicAppOrigin,
  publicAppUrl,
} from "./public-app-url"

describe("public application URL", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("uses the request origin during local development", () => {
    vi.stubEnv("NODE_ENV", "test")
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "")

    expect(
      publicAppUrl(
        "/my",
        new Request("http://localhost:3000/callback")
      ).toString()
    ).toBe("http://localhost:3000/my")
  })

  it("uses the canonical domain instead of an internal production listener", () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://0.0.0.0:3000")

    expect(publicAppOrigin()).toBe(PRODUCTION_APP_ORIGIN)
    expect(publicAppUrl("/my").toString()).toBe("https://en.dakhe.ru/my")
  })

  it("accepts an explicitly configured public deployment origin", () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://preview.example/path")

    expect(publicAppOrigin()).toBe("https://preview.example")
  })
})
