import { afterEach, describe, expect, it, vi } from "vitest"

import { authJsonError } from "@/server/auth/auth-http"

describe("authJsonError diagnostics", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("logs only a sanitized error class and machine code", async () => {
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
      { name: "PostgresError", code: "42P01" }
    )
    expect(JSON.stringify(logger.mock.calls)).not.toContain("must-not-appear")
    expect(JSON.stringify(logger.mock.calls)).not.toContain("private_data")
  })

  it("drops untrusted diagnostic fields", () => {
    const logger = vi.spyOn(console, "error").mockImplementation(() => {})
    const error = Object.assign(new Error("private"), {
      name: "Invalid name containing spaces",
      code: "secret-token-value",
    })

    authJsonError(error)

    expect(logger).toHaveBeenCalledWith(
      "Unexpected authentication request failure",
      { name: "Error" }
    )
  })
})
