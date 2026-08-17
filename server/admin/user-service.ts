import { count, desc, eq, inArray } from "drizzle-orm"

import { getDb } from "@/db"
import { dailyPlans, userCards, userProgramProgress, users } from "@/db/schema"
import { AppError } from "@/server/shared/errors"

export async function listAdminUsers() {
  const db = getDb()
  const rows = await db
    .select({
      id: users.id,
      telegramUserId: users.telegramUserId,
      firstName: users.firstName,
      lastName: users.lastName,
      username: users.username,
      levelEstimate: users.levelEstimate,
      onboardingCompleted: users.onboardingCompleted,
      lastActiveAt: users.lastActiveAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .orderBy(desc(users.lastActiveAt), desc(users.createdAt))
    .limit(200)

  if (rows.length === 0) return []

  const userIds = rows.map((user) => user.id)
  const [cardCounts, planCounts, programCounts] = await Promise.all([
    db
      .select({ userId: userCards.userId, value: count() })
      .from(userCards)
      .where(inArray(userCards.userId, userIds))
      .groupBy(userCards.userId),
    db
      .select({ userId: dailyPlans.userId, value: count() })
      .from(dailyPlans)
      .where(inArray(dailyPlans.userId, userIds))
      .groupBy(dailyPlans.userId),
    db
      .select({ userId: userProgramProgress.userId, value: count() })
      .from(userProgramProgress)
      .where(inArray(userProgramProgress.userId, userIds))
      .groupBy(userProgramProgress.userId),
  ])
  const asMap = (values: Array<{ userId: string; value: number }>) =>
    new Map(values.map((item) => [item.userId, item.value]))
  const cardsByUser = asMap(cardCounts)
  const plansByUser = asMap(planCounts)
  const programsByUser = asMap(programCounts)

  return rows.map((user) => ({
    ...user,
    cardCount: cardsByUser.get(user.id) ?? 0,
    planCount: plansByUser.get(user.id) ?? 0,
    programCount: programsByUser.get(user.id) ?? 0,
  }))
}

export async function resetAdminUser(userId: string, now = new Date()) {
  return getDb().transaction(async (tx) => {
    const [current] = await tx
      .select({
        id: users.id,
        telegramUserId: users.telegramUserId,
        telegramOidcSubject: users.telegramOidcSubject,
        firstName: users.firstName,
        lastName: users.lastName,
        username: users.username,
        languageCode: users.languageCode,
        isPremium: users.isPremium,
        addedToAttachmentMenu: users.addedToAttachmentMenu,
        allowsWriteToPm: users.allowsWriteToPm,
        photoUrl: users.photoUrl,
        timezone: users.timezone,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .for("update")
      .limit(1)

    if (!current) {
      throw new AppError("User not found", 404, "USER_NOT_FOUND")
    }

    // Every user-owned table references users.id with ON DELETE CASCADE.
    // Reinsert the stable identity in the same transaction so a failed insert
    // rolls the deletion back and the Telegram account stays linked.
    await tx.delete(users).where(eq(users.id, userId))
    const [resetUser] = await tx
      .insert(users)
      .values({
        ...current,
        reminderTime: null,
        levelEstimate: null,
        onboardingCompleted: false,
        lastActiveAt: null,
        updatedAt: now,
      })
      .returning({
        id: users.id,
        telegramUserId: users.telegramUserId,
        username: users.username,
        onboardingCompleted: users.onboardingCompleted,
      })

    if (!resetUser) {
      throw new AppError("Could not reset user", 500, "USER_RESET_FAILED")
    }

    return { ...resetUser, resetAt: now.toISOString() }
  })
}
