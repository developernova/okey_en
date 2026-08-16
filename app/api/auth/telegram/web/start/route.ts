import { randomUUID } from "node:crypto"

import { privateNoStore } from "@/server/auth/auth-http"
import {
  createS256CodeChallenge,
  startTelegramOidc,
} from "@/server/auth/telegram-oidc"
import { randomBase64Url } from "@/server/auth/token-crypto"
import { publicAppUrl } from "@/server/config/public-app-url"
import {
  appendWebAuthCookies,
  safeWebAuthReturnPath,
  webDeviceId,
} from "@/server/auth/web-session"

export async function GET(request: Request) {
  const returnTo = safeWebAuthReturnPath(
    new URL(request.url).searchParams.get("return_to")
  )
  try {
    const deviceId = webDeviceId(request) ?? randomUUID()
    const verifier = randomBase64Url()
    const attempt = await startTelegramOidc({
      platform: "web",
      deviceId,
      deviceName: "Web browser",
      handoffCodeChallenge: createS256CodeChallenge(verifier),
    })

    const headers = new Headers({ Location: attempt.authorizationUrl })
    appendWebAuthCookies(headers, {
      attemptId: attempt.attemptId,
      verifier,
      deviceId,
      returnTo,
    })
    return privateNoStore(new Response(null, { status: 302, headers }))
  } catch {
    const returnUrl = publicAppUrl(returnTo ?? "/login", request)
    returnUrl.searchParams.set("auth_error", "authentication_failed")
    return privateNoStore(Response.redirect(returnUrl, 302))
  }
}
