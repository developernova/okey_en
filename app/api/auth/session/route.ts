import {
  authJsonError,
  noStore,
  requireAuthorizationHeader,
} from "@/server/auth/auth-http"
import {
  getCurrentUserSession,
  revokeCurrentUserSession,
} from "@/server/auth/user-session"

export async function GET(request: Request) {
  try {
    const data = await getCurrentUserSession(
      requireAuthorizationHeader(request)
    )
    return noStore(Response.json({ data }))
  } catch (error) {
    return noStore(authJsonError(error))
  }
}

export async function DELETE(request: Request) {
  try {
    await revokeCurrentUserSession(requireAuthorizationHeader(request))
    return noStore(new Response(null, { status: 204 }))
  } catch (error) {
    return noStore(authJsonError(error))
  }
}
