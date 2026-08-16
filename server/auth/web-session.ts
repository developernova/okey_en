import { AppError } from "@/server/shared/errors"

export const webAccessCookie = "catch_english_access"
export const webRefreshCookie = "catch_english_refresh"
export const webDeviceCookie = "catch_english_device"
export const webAuthAttemptCookie = "catch_english_auth_attempt"
export const webAuthVerifierCookie = "catch_english_auth_verifier"
export const webAuthReturnCookie = "catch_english_auth_return"
export const webQrChallengeCookie = "catch_english_qr_challenge"

const WEB_DEVICE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60
const WEB_AUTH_ATTEMPT_MAX_AGE_SECONDS = 5 * 60
const WEB_QR_CHALLENGE_MAX_AGE_SECONDS = 3 * 60

type WebSessionTokens = {
  accessToken: string
  expiresAt: string
  refreshToken: string
  refreshExpiresAt: string
}

function cookieValue(request: Request, name: string) {
  const cookies = request.headers.get("cookie")?.split(";") ?? []
  for (const cookie of cookies) {
    const separator = cookie.indexOf("=")
    if (separator === -1) continue
    if (cookie.slice(0, separator).trim() !== name) continue
    try {
      return decodeURIComponent(cookie.slice(separator + 1).trim())
    } catch {
      return undefined
    }
  }
  return undefined
}

export function safeWebAuthReturnPath(value: string | null | undefined) {
  if (!value || value.length > 160) return undefined
  return /^\/login\/qr\/[A-Za-z\d_-]{43}$/.test(value) ? value : undefined
}

function cookieHeader(input: {
  name: string
  value: string
  maxAge: number
  path?: string
}) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : ""
  return `${input.name}=${encodeURIComponent(input.value)}; Path=${input.path ?? "/"}; HttpOnly; SameSite=Lax; Max-Age=${Math.max(0, Math.floor(input.maxAge))}; Priority=High${secure}`
}

function secondsUntil(value: string, now = new Date()) {
  const expiresAt = new Date(value).getTime()
  if (!Number.isFinite(expiresAt)) return 0
  return Math.max(0, Math.floor((expiresAt - now.getTime()) / 1_000))
}

export function webAccessAuthorization(request: Request) {
  const token = cookieValue(request, webAccessCookie)
  return token ? `Bearer ${token}` : undefined
}

export function requireWebAccessAuthorization(request: Request) {
  const authorization = webAccessAuthorization(request)
  if (!authorization) {
    throw new AppError("Authentication required", 401, "AUTH_REQUIRED")
  }
  return authorization
}

export function requireWebRefreshToken(request: Request) {
  const refreshToken = cookieValue(request, webRefreshCookie)
  if (!refreshToken) {
    throw new AppError("Authentication required", 401, "AUTH_REQUIRED")
  }
  return refreshToken
}

export function webDeviceId(request: Request) {
  const value = cookieValue(request, webDeviceCookie)
  return value && /^[0-9a-f-]{36}$/i.test(value) ? value : undefined
}

export function webAuthHandoff(request: Request) {
  return {
    attemptId: cookieValue(request, webAuthAttemptCookie),
    verifier: cookieValue(request, webAuthVerifierCookie),
  }
}

export function webAuthReturnPath(request: Request) {
  return safeWebAuthReturnPath(cookieValue(request, webAuthReturnCookie))
}

export function webQrChallenge(request: Request) {
  const value = cookieValue(request, webQrChallengeCookie)
  const match = /^([0-9a-f-]{36})\.([A-Za-z\d_-]{43})$/i.exec(value ?? "")
  return match ? { id: match[1], verifier: match[2] } : undefined
}

export function appendWebAuthCookies(
  headers: Headers,
  input: {
    attemptId: string
    verifier: string
    deviceId: string
    returnTo?: string
  }
) {
  headers.append(
    "Set-Cookie",
    cookieHeader({
      name: webAuthAttemptCookie,
      value: input.attemptId,
      maxAge: WEB_AUTH_ATTEMPT_MAX_AGE_SECONDS,
      path: "/api/auth/telegram",
    })
  )
  headers.append(
    "Set-Cookie",
    cookieHeader({
      name: webAuthVerifierCookie,
      value: input.verifier,
      maxAge: WEB_AUTH_ATTEMPT_MAX_AGE_SECONDS,
      path: "/api/auth/telegram",
    })
  )
  appendWebDeviceCookie(headers, input.deviceId)
  if (input.returnTo) {
    headers.append(
      "Set-Cookie",
      cookieHeader({
        name: webAuthReturnCookie,
        value: input.returnTo,
        maxAge: WEB_AUTH_ATTEMPT_MAX_AGE_SECONDS,
        path: "/api/auth/telegram",
      })
    )
  }
}

export function appendWebDeviceCookie(headers: Headers, deviceId: string) {
  headers.append(
    "Set-Cookie",
    cookieHeader({
      name: webDeviceCookie,
      value: deviceId,
      maxAge: WEB_DEVICE_MAX_AGE_SECONDS,
    })
  )
}

export function clearWebAuthCookies(headers: Headers) {
  for (const name of [
    webAuthAttemptCookie,
    webAuthVerifierCookie,
    webAuthReturnCookie,
  ]) {
    headers.append(
      "Set-Cookie",
      cookieHeader({
        name,
        value: "",
        maxAge: 0,
        path: "/api/auth/telegram",
      })
    )
  }
}

export function appendWebQrChallengeCookie(
  headers: Headers,
  input: { id: string; verifier: string }
) {
  headers.append(
    "Set-Cookie",
    cookieHeader({
      name: webQrChallengeCookie,
      value: `${input.id}.${input.verifier}`,
      maxAge: WEB_QR_CHALLENGE_MAX_AGE_SECONDS,
      path: "/api/auth/qr",
    })
  )
}

export function clearWebQrChallengeCookie(headers: Headers) {
  headers.append(
    "Set-Cookie",
    cookieHeader({
      name: webQrChallengeCookie,
      value: "",
      maxAge: 0,
      path: "/api/auth/qr",
    })
  )
}

export function appendWebSessionCookies(
  headers: Headers,
  tokens: WebSessionTokens,
  now = new Date()
) {
  headers.append(
    "Set-Cookie",
    cookieHeader({
      name: webAccessCookie,
      value: tokens.accessToken,
      maxAge: secondsUntil(tokens.expiresAt, now),
    })
  )
  headers.append(
    "Set-Cookie",
    cookieHeader({
      name: webRefreshCookie,
      value: tokens.refreshToken,
      maxAge: secondsUntil(tokens.refreshExpiresAt, now),
    })
  )
}

export function clearWebSessionCookies(headers: Headers) {
  for (const name of [webAccessCookie, webRefreshCookie]) {
    headers.append("Set-Cookie", cookieHeader({ name, value: "", maxAge: 0 }))
  }
}
