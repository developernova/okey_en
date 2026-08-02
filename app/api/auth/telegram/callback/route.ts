import { authJsonError, privateNoStore } from "@/server/auth/auth-http"
import {
  claimTelegramOidcAttempt,
  completeTelegramOidcAttempt,
  failTelegramOidcAttempt,
} from "@/server/auth/telegram-oidc"

function redirect(url: string) {
  return privateNoStore(Response.redirect(url, 302))
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const state = url.searchParams.get("state") ?? ""

  let attempt
  try {
    attempt = await claimTelegramOidcAttempt(state)
  } catch (error) {
    return privateNoStore(authJsonError(error))
  }

  if (url.searchParams.has("error")) {
    return redirect(await failTelegramOidcAttempt(attempt.id, "cancelled"))
  }

  const code = url.searchParams.get("code")
  if (!code) {
    return redirect(
      await failTelegramOidcAttempt(attempt.id, "authentication_failed")
    )
  }

  try {
    return redirect(await completeTelegramOidcAttempt(attempt, code))
  } catch {
    // Never reflect or log provider payloads, authorization codes or tokens.
    return redirect(
      await failTelegramOidcAttempt(attempt.id, "authentication_failed")
    )
  }
}
