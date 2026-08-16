import { authJsonError, noStore } from "@/server/auth/auth-http"
import { refreshUserSession } from "@/server/auth/user-session"
import {
  appendWebSessionCookies,
  clearWebSessionCookies,
  requireWebRefreshToken,
} from "@/server/auth/web-session"

export async function POST(request: Request) {
  try {
    const session = await refreshUserSession(requireWebRefreshToken(request))
    const headers = new Headers()
    appendWebSessionCookies(headers, session)
    return noStore(
      Response.json(
        { data: { user: session.user, expiresAt: session.expiresAt } },
        { headers }
      )
    )
  } catch (error) {
    const response = authJsonError(error)
    const headers = new Headers(response.headers)
    clearWebSessionCookies(headers)
    return noStore(
      new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      })
    )
  }
}
