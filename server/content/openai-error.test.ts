import { describe, expect, it } from "vitest"

import { describeOpenAiError, isOpenAiSchemaUnsupported } from "./openai-error"

describe("describeOpenAiError", () => {
  it("surfaces direct API errors", () => {
    expect(
      describeOpenAiError(
        403,
        JSON.stringify({
          error: {
            message: "Project access denied",
            type: "invalid_request_error",
            code: "project_access_denied",
          },
        })
      )
    ).toBe("OpenAI 403: Project access denied (project_access_denied)")
  })

  it("preserves plain-text edge errors", () => {
    expect(describeOpenAiError(502, "Upstream unavailable")).toBe(
      "OpenAI 502: Upstream unavailable"
    )
  })
})

describe("isOpenAiSchemaUnsupported", () => {
  it("recognizes only schema-specific model rejections", () => {
    expect(
      isOpenAiSchemaUnsupported(
        400,
        "response_format json_schema is not supported by this model"
      )
    ).toBe(true)
  })

  it("does not turn unrelated client errors into fallback attempts", () => {
    expect(isOpenAiSchemaUnsupported(401, "Unauthorized")).toBe(false)
    expect(isOpenAiSchemaUnsupported(400, "Invalid model")).toBe(false)
  })
})
