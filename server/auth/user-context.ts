import { env } from "@/server/config/env"
import {
  configuredAdminSecret,
  hasValidAdminSession,
  secureStringEqual,
} from "@/server/auth/admin-session"
import { validateTelegramInitData } from "@/server/auth/telegram-init-data"
import {
  resolveMiniAppUserId,
  updateUserTimezone,
} from "@/server/auth/telegram-user"
import { resolveBearerUserId } from "@/server/auth/user-session"
import { AppError } from "@/server/shared/errors"
import { canonicalizeIanaTimezone } from "@/server/shared/timezone"

async function resolveTelegramUserId(
  rawInitData: string,
  timezone: string | null
) {
  const botToken = env().TELEGRAM_BOT_TOKEN
  if (!botToken) {
    throw new AppError(
      "TELEGRAM_BOT_TOKEN is not configured",
      503,
      "TELEGRAM_AUTH_NOT_CONFIGURED"
    )
  }

  const identity = validateTelegramInitData(rawInitData, botToken)
  return resolveMiniAppUserId(identity, timezone)
}

export async function requireUserId(request: Request) {
  const timezone = canonicalizeIanaTimezone(
    request.headers.get("x-user-timezone")
  )
  const authorization = request.headers.get("authorization")
  if (authorization !== null) {
    const userId = await resolveBearerUserId(authorization)
    await updateUserTimezone(userId, timezone)
    return userId
  }

  const rawInitData = request.headers.get("x-telegram-init-data")
  if (rawInitData) return resolveTelegramUserId(rawInitData, timezone)

  if (process.env.NODE_ENV === "production") {
    throw new AppError("Authentication required", 401, "AUTH_REQUIRED")
  }

  const userId = request.headers.get("x-user-id") ?? env().DEV_USER_ID

  if (!userId) {
    throw new AppError(
      "Set DEV_USER_ID or pass x-user-id in development",
      401,
      "USER_REQUIRED"
    )
  }

  await updateUserTimezone(userId, timezone)

  return userId
}

export function requireAdmin(request: Request) {
  const secret = request.headers.get("x-admin-secret")

  if (
    !hasValidAdminSession(request) &&
    (!secret || !secureStringEqual(secret, configuredAdminSecret()))
  ) {
    throw new AppError("Invalid admin secret", 401, "ADMIN_REQUIRED")
  }
}
