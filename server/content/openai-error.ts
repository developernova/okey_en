type OpenAiErrorBody = {
  error?:
    | string
    | {
        message?: string
        type?: string
        code?: string | null
      }
}

export function describeOpenAiError(status: number, body: string) {
  let reason = body.trim()
  try {
    const parsed = JSON.parse(body) as OpenAiErrorBody
    if (typeof parsed.error === "string") {
      reason = parsed.error
    } else if (parsed.error?.message) {
      const errorType = parsed.error.code ?? parsed.error.type
      reason = errorType
        ? `${parsed.error.message} (${errorType})`
        : parsed.error.message
    }
  } catch {
    // The API or an upstream edge can also return a plain-text response.
  }

  const suffix = reason ? `: ${reason.slice(0, 600)}` : ""
  return `OpenAI ${status}${suffix}`
}

export function isOpenAiSchemaUnsupported(status: number, body: string) {
  return (
    status === 400 &&
    /(?:response_format|json_schema)/i.test(body) &&
    /(?:unsupported|not supported|invalid)/i.test(body)
  )
}
