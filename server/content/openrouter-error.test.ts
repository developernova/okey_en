import { describe, expect, it } from "vitest"

import { describeOpenRouterError } from "./openrouter-error"

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
