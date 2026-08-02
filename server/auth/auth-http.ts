import { ZodError } from "zod"

import { AppError } from "@/server/shared/errors"

function safeErrorDiagnostic(error: unknown) {
  if (!(error instanceof Error)) return { name: "UnknownError" }

  const safeName = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(error.name)
    ? error.name
    : "Error"
  const candidateCode = (error as Error & { code?: unknown }).code
  const safeCode =
    typeof candidateCode === "string" && /^[A-Z0-9_]{2,32}$/.test(candidateCode)
      ? candidateCode
      : undefined

  return safeCode ? { name: safeName, code: safeCode } : { name: safeName }
}

export function noStore(response: Response) {
  const headers = new Headers(response.headers)
  headers.set("Cache-Control", "no-store")
  headers.set("Pragma", "no-cache")
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export function privateNoStore(response: Response) {
  const noStoreResponse = noStore(response)
  const headers = new Headers(noStoreResponse.headers)
  headers.set("Referrer-Policy", "no-referrer")
  return new Response(noStoreResponse.body, {
    status: noStoreResponse.status,
    statusText: noStoreResponse.statusText,
    headers,
  })
}

export function requireAuthorizationHeader(request: Request) {
  const authorization = request.headers.get("authorization")
  if (!authorization) {
    throw new AppError("Authentication required", 401, "AUTH_REQUIRED")
  }
  return authorization
}

/**
 * Auth requests can carry authorization codes and tokens. Keep the normal
 * client-facing error contract without ever passing an unknown error object to
 * the logger, where a provider or database client might include request data.
 */
export function authJsonError(error: unknown) {
  if (error instanceof ZodError) {
    return Response.json(
      { error: { code: "INVALID_REQUEST", issues: error.issues } },
      { status: 400 }
    )
  }

  if (error instanceof AppError) {
    const response = Response.json(
      {
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
      },
      { status: error.status }
    )
    const retryAfterSeconds =
      error.details &&
      typeof error.details === "object" &&
      "retryAfterSeconds" in error.details &&
      typeof error.details.retryAfterSeconds === "number"
        ? error.details.retryAfterSeconds
        : null
    if (error.status === 429 && retryAfterSeconds !== null) {
      response.headers.set("Retry-After", String(retryAfterSeconds))
    }
    return response
  }

  // Never log the error message, stack, SQL, request, or provider response:
  // any of them may contain an authorization code or token. The sanitized
  // class and machine code are sufficient to distinguish configuration,
  // transport, and PostgreSQL failures in production.
  console.error(
    "Unexpected authentication request failure",
    safeErrorDiagnostic(error)
  )
  return Response.json(
    { error: { code: "INTERNAL_ERROR", message: "Unexpected server error" } },
    { status: 500 }
  )
}
