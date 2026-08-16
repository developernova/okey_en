import { authJsonError, privateNoStore } from "@/server/auth/auth-http"
import {
  claimTelegramOidcAttempt,
  completeTelegramOidcAttempt,
  failTelegramOidcAttempt,
} from "@/server/auth/telegram-oidc"
import { exchangeTelegramHandoff } from "@/server/auth/user-session"
import {
  appendWebSessionCookies,
  clearWebAuthCookies,
  webAuthHandoff,
} from "@/server/auth/web-session"

function redirect(url: string, headers = new Headers()) {
  headers.set("Location", url)
  return privateNoStore(new Response(null, { status: 302, headers }))
}

async function failAttempt(
  request: Request,
  attempt: { id: string; platform: "ios" | "macos" | "web" },
  error: "cancelled" | "authentication_failed"
) {
  const nativeReturnUrl = await failTelegramOidcAttempt(attempt.id, error)
  if (attempt.platform !== "web") return redirect(nativeReturnUrl)

  const headers = new Headers()
  clearWebAuthCookies(headers)
  const webReturnUrl = new URL("/login", request.url)
  webReturnUrl.searchParams.set("auth_error", error)
  return redirect(webReturnUrl.toString(), headers)
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
    return failAttempt(request, attempt, "cancelled")
  }

  const code = url.searchParams.get("code")
  if (!code) {
    return failAttempt(request, attempt, "authentication_failed")
  }

  try {
    if (attempt.platform === "web") {
      const handoff = webAuthHandoff(request)
      if (
        handoff.attemptId !== attempt.id ||
        !handoff.verifier ||
        handoff.verifier.length < 43
      ) {
        return failAttempt(request, attempt, "authentication_failed")
      }
    }

    const completed = await completeTelegramOidcAttempt(attempt, code)
    if (completed.platform !== "web") {
      return redirect(completed.redirectUrl ?? "catchenglish://auth")
    }

    const handoff = webAuthHandoff(request)
    const session = await exchangeTelegramHandoff({
      attemptId: completed.attemptId,
      code: completed.handoffCode,
      handoffCodeVerifier: handoff.verifier ?? "",
      timezone: null,
    })
    const headers = new Headers()
    appendWebSessionCookies(headers, session)
    clearWebAuthCookies(headers)
    return redirect(new URL("/", request.url).toString(), headers)
  } catch {
    // Never reflect or log provider payloads, authorization codes or tokens.
    return failAttempt(request, attempt, "authentication_failed")
  }
}
