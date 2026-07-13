import { describe, expect, it } from "vitest"

import {
  describeOpenRouterError,
  isOpenRouterInvalidArgument,
} from "./openrouter-error"

describe("describeOpenRouterError", () => {
  it("surfaces edge security policy failures", () => {
    expect(
      describeOpenRouterError(
        403,
        '{ "success": false, "error": "Access denied by security policy." }'
      )
    ).toBe("OpenRouter 403: Access denied by security policy.")
  })

  it("includes the normalized OpenRouter error type", () => {
    expect(
      describeOpenRouterError(
        403,
        JSON.stringify({
          error: {
            message: "Permission denied",
            metadata: { error_type: "permission_denied" },
          },
        })
      )
    ).toBe("OpenRouter 403: Permission denied (permission_denied)")
  })
})

describe("isOpenRouterInvalidArgument", () => {
  it("recognizes a nested Google provider schema rejection", () => {
    const body = JSON.stringify({
      error: {
        message: "Provider returned error",
        metadata: {
          raw: JSON.stringify({
            error: {
              code: 400,
              message: "Request contains an invalid argument.",
              status: "INVALID_ARGUMENT",
            },
          }),
        },
      },
    })

    expect(isOpenRouterInvalidArgument(400, body)).toBe(true)
  })

  it("does not turn unrelated client errors into fallback attempts", () => {
    expect(isOpenRouterInvalidArgument(401, "Unauthorized")).toBe(false)
    expect(isOpenRouterInvalidArgument(400, "Invalid model")).toBe(false)
  })
})
