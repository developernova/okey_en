import { and, eq, ne } from "drizzle-orm"

import { env } from "@/server/config/env"
import { getDb } from "@/db"
import { users } from "@/db/schema"
import {
  configuredAdminSecret,
  hasValidAdminSession,
  secureStringEqual,
} from "@/server/auth/admin-session"
import { validateTelegramInitData } from "@/server/auth/telegram-init-data"
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
  const now = new Date()
  const [user] = await getDb()
    .insert(users)
    .values({
      telegramUserId: identity.telegramUserId,
      firstName: identity.firstName,
      lastName: identity.lastName ?? null,
      username: identity.username ?? null,
      languageCode: identity.languageCode ?? null,
      isPremium: identity.isPremium,
      addedToAttachmentMenu: identity.addedToAttachmentMenu,
      allowsWriteToPm: identity.allowsWriteToPm,
      photoUrl: identity.photoUrl ?? null,
      ...(timezone ? { timezone } : {}),
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: users.telegramUserId,
      set: {
        firstName: identity.firstName,
        lastName: identity.lastName ?? null,
        username: identity.username ?? null,
        languageCode: identity.languageCode ?? null,
        isPremium: identity.isPremium,
        addedToAttachmentMenu: identity.addedToAttachmentMenu,
        allowsWriteToPm: identity.allowsWriteToPm,
        photoUrl: identity.photoUrl ?? null,
        ...(timezone ? { timezone } : {}),
        updatedAt: now,
      },
    })
    .returning({ id: users.id })

  if (!user) {
    throw new AppError("Unable to resolve user", 500, "USER_RESOLUTION_FAILED")
  }

  return user.id
}

export async function requireUserId(request: Request) {
  const timezone = canonicalizeIanaTimezone(
    request.headers.get("x-user-timezone")
  )
  const rawInitData = request.headers.get("x-telegram-init-data")
  if (rawInitData) return resolveTelegramUserId(rawInitData, timezone)

  if (process.env.NODE_ENV === "production") {
    throw new AppError(
      "Open the app inside Telegram",
      401,
      "TELEGRAM_INIT_DATA_REQUIRED"
    )
  }

  const userId = request.headers.get("x-user-id") ?? env().DEV_USER_ID

  if (!userId) {
    throw new AppError(
      "Set DEV_USER_ID or pass x-user-id in development",
      401,
      "USER_REQUIRED"
    )
  }

  if (timezone) {
    const now = new Date()
    await getDb()
      .update(users)
      .set({ timezone, updatedAt: now })
      .where(and(eq(users.id, userId), ne(users.timezone, timezone)))
  }

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
