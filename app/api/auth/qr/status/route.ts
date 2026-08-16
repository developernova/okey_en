import { authJsonError, privateNoStore } from "@/server/auth/auth-http"
import { exchangeQrAuthChallenge } from "@/server/auth/user-session"
import {
  appendWebSessionCookies,
  clearWebQrChallengeCookie,
  webQrChallenge,
} from "@/server/auth/web-session"
import { AppError } from "@/server/shared/errors"
import { canonicalizeIanaTimezone } from "@/server/shared/timezone"

export async function GET(request: Request) {
  try {
    const challenge = webQrChallenge(request)
    if (!challenge) {
      throw new AppError("QR login expired", 410, "QR_AUTH_EXPIRED")
    }

    const result = await exchangeQrAuthChallenge({
      challengeId: challenge.id,
      desktopVerifier: challenge.verifier,
      timezone: canonicalizeIanaTimezone(
        request.headers.get("x-user-timezone")
      ),
    })

    if (result.kind === "pending") {
      return privateNoStore(Response.json({ data: { status: "pending" } }))
    }

    const headers = new Headers()
    if (result.kind === "expired") {
      clearWebQrChallengeCookie(headers)
      return privateNoStore(
        Response.json({ data: { status: "expired" } }, { status: 410, headers })
      )
    }

    appendWebSessionCookies(headers, result)
    clearWebQrChallengeCookie(headers)
    return privateNoStore(
      Response.json(
        { data: { status: "authenticated", user: result.user } },
        { headers }
      )
    )
  } catch (error) {
    return privateNoStore(authJsonError(error))
  }
}
