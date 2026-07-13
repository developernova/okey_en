type OpenRouterErrorBody = {
  error?:
    | string
    | {
        message?: string
        metadata?: { error_type?: string }
      }
}

export function describeOpenRouterError(status: number, body: string) {
  let reason = body.trim()
  try {
    const parsed = JSON.parse(body) as OpenRouterErrorBody
    if (typeof parsed.error === "string") {
      reason = parsed.error
    } else if (parsed.error?.message) {
      const errorType = parsed.error.metadata?.error_type
      reason = errorType
        ? `${parsed.error.message} (${errorType})`
        : parsed.error.message
    }
  } catch {
    // OpenRouter can also return a plain-text response from its edge layer.
  }

  const suffix = reason ? `: ${reason.slice(0, 600)}` : ""
  return `OpenRouter ${status}${suffix}`
}

export function isOpenRouterInvalidArgument(status: number, body: string) {
  return (
    status === 400 &&
    (/INVALID_ARGUMENT/i.test(body) || /invalid argument/i.test(body))
  )
}
