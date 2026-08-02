import { afterEach, describe, expect, it, vi } from "vitest"

import { authJsonError } from "@/server/auth/auth-http"

describe("authJsonError diagnostics", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("temporarily logs the complete runtime error", () => {
    const logger = vi.spyOn(console, "error").mockImplementation(() => {})
    const error = Object.assign(
      new Error("secret=must-not-appear query=select-private-data"),
      {
        name: "PostgresError",
        code: "42P01",
        query: "select private_data",
      }
    )

    const response = authJsonError(error)

    expect(response.status).toBe(500)
    expect(logger).toHaveBeenCalledWith(
      "Unexpected authentication request failure",
      error
    )
  })
})
