import { and, eq, ne, or } from "drizzle-orm"

import { getDb } from "@/db"
import { users } from "@/db/schema"
import type { TelegramIdentity } from "@/server/auth/telegram-init-data"
import { AppError } from "@/server/shared/errors"

export type TelegramOidcIdentity = {
  subject: string
  telegramUserId: string
  firstName: string
  lastName?: string
  username?: string
  photoUrl?: string
}

export async function resolveMiniAppUserId(
  identity: TelegramIdentity,
  timezone: string | null
) {
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

function identityConflict(): never {
  throw new AppError(
    "Telegram identity is already linked to another account",
    409,
    "TELEGRAM_IDENTITY_CONFLICT"
  )
}

async function findOidcIdentity(identity: TelegramOidcIdentity) {
  return getDb()
    .select({
      id: users.id,
      telegramUserId: users.telegramUserId,
      telegramOidcSubject: users.telegramOidcSubject,
    })
    .from(users)
    .where(
      or(
        eq(users.telegramUserId, identity.telegramUserId),
        eq(users.telegramOidcSubject, identity.subject)
      )
    )
    .limit(2)
}

export async function resolveOidcUserId(identity: TelegramOidcIdentity) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const matches = await findOidcIdentity(identity)
    const uniqueUserIds = new Set(matches.map((match) => match.id))
    if (uniqueUserIds.size > 1) identityConflict()

    const existing = matches[0]
    if (existing) {
      if (
        (existing.telegramUserId &&
          existing.telegramUserId !== identity.telegramUserId) ||
        (existing.telegramOidcSubject &&
          existing.telegramOidcSubject !== identity.subject)
      ) {
        identityConflict()
      }

      const [updated] = await getDb()
        .update(users)
        .set({
          telegramUserId: identity.telegramUserId,
          telegramOidcSubject: identity.subject,
          firstName: identity.firstName,
          lastName: identity.lastName ?? null,
          username: identity.username ?? null,
          photoUrl: identity.photoUrl ?? null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, existing.id))
        .returning({ id: users.id })

      if (!updated) {
        throw new AppError(
          "Unable to resolve user",
          500,
          "USER_RESOLUTION_FAILED"
        )
      }
      return updated.id
    }

    const [inserted] = await getDb()
      .insert(users)
      .values({
        telegramUserId: identity.telegramUserId,
        telegramOidcSubject: identity.subject,
        firstName: identity.firstName,
        lastName: identity.lastName ?? null,
        username: identity.username ?? null,
        photoUrl: identity.photoUrl ?? null,
      })
      .onConflictDoNothing()
      .returning({ id: users.id })

    if (inserted) return inserted.id
    // A concurrent callback may have inserted the same identity. Resolve it on
    // the second pass; unique constraints prevent two accounts from claiming it.
  }

  const matches = await findOidcIdentity(identity)
  if (matches.length === 1) {
    const match = matches[0]
    if (
      (match.telegramUserId &&
        match.telegramUserId !== identity.telegramUserId) ||
      (match.telegramOidcSubject &&
        match.telegramOidcSubject !== identity.subject)
    ) {
      identityConflict()
    }
    return match.id
  }
  if (matches.length > 1) identityConflict()
  throw new AppError("Unable to resolve user", 500, "USER_RESOLUTION_FAILED")
}

export async function updateUserTimezone(
  userId: string,
  timezone: string | null
) {
  if (!timezone) return
  const now = new Date()
  await getDb()
    .update(users)
    .set({ timezone, updatedAt: now })
    .where(and(eq(users.id, userId), ne(users.timezone, timezone)))
}
