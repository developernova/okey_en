import { authJsonError, noStore } from "@/server/auth/auth-http"
import {
  getCurrentUserSession,
  revokeCurrentUserSession,
} from "@/server/auth/user-session"
import {
  clearWebSessionCookies,
  requireWebAccessAuthorization,
  webAccessAuthorization,
} from "@/server/auth/web-session"

export async function GET(request: Request) {
  try {
    const data = await getCurrentUserSession(
      requireWebAccessAuthorization(request)
    )
    return noStore(Response.json({ data }))
  } catch (error) {
    return noStore(authJsonError(error))
  }
}

export async function DELETE(request: Request) {
  const authorization = webAccessAuthorization(request)
  if (authorization) {
    try {
      await revokeCurrentUserSession(authorization)
    } catch {
      // Expired or already revoked sessions still need their browser cookies cleared.
    }
  }

  const headers = new Headers()
  clearWebSessionCookies(headers)
  return noStore(Response.json({ data: { authenticated: false } }, { headers }))
}
