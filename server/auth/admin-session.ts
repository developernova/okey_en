import { createHmac, timingSafeEqual } from "node:crypto"

import { env } from "@/server/config/env"
import { AppError } from "@/server/shared/errors"

export const adminSessionCookie = "okey_admin_session"
export const adminSessionLifetimeSeconds = 8 * 60 * 60

export function configuredAdminSecret() {
  try {
    return env().ADMIN_API_SECRET
  } catch (error) {
    if (error instanceof Error && error.message.includes("ADMIN_API_SECRET")) {
      throw new AppError(
        "ADMIN_API_SECRET должен содержать минимум 16 символов",
        503,
        "ADMIN_NOT_CONFIGURED"
      )
    }
    throw error
  }
}

function signature(secret: string, expiresAt: number) {
  return createHmac("sha256", secret)
    .update(`okey-admin:${expiresAt}`)
    .digest("base64url")
}

export function secureStringEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  )
}

export function createAdminSessionToken(secret: string, now = new Date()) {
  const expiresAt =
    Math.floor(now.getTime() / 1_000) + adminSessionLifetimeSeconds
  return `${expiresAt}.${signature(secret, expiresAt)}`
}

export function verifyAdminSessionToken(
  token: string | undefined,
  secret: string,
  now = new Date()
) {
  if (!token) return false
  const [expiresValue, providedSignature, ...extra] = token.split(".")
  if (extra.length > 0 || !expiresValue || !providedSignature) return false
  const expiresAt = Number(expiresValue)
  if (!Number.isSafeInteger(expiresAt)) return false
  if (expiresAt <= Math.floor(now.getTime() / 1_000)) return false
  return secureStringEqual(providedSignature, signature(secret, expiresAt))
}

function cookieValue(request: Request, name: string) {
  const cookies = request.headers.get("cookie")?.split(";") ?? []
  for (const cookie of cookies) {
    const separator = cookie.indexOf("=")
    if (separator === -1) continue
    if (cookie.slice(0, separator).trim() !== name) continue
    return decodeURIComponent(cookie.slice(separator + 1).trim())
  }
  return undefined
}

export function hasValidAdminSession(request: Request) {
  return verifyAdminSessionToken(
    cookieValue(request, adminSessionCookie),
    configuredAdminSecret()
  )
}

export function adminSessionCookieHeader(token: string, maxAge: number) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : ""
  return `${adminSessionCookie}=${encodeURIComponent(token)}; Path=/api/admin; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`
}
