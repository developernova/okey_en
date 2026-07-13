import { and, eq, isNotNull } from "drizzle-orm"

import { getDb } from "@/db"
import { dailyPlans, reminderDeliveries, users } from "@/db/schema"
import { env } from "@/server/config/env"
import { dateInTimezone } from "@/server/interview/rate-limit"
import { AppError } from "@/server/shared/errors"

export function timeInTimezone(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date)
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  )
  return `${values.hour}:${values.minute}`
}

export async function getReminder(userId: string) {
  const [user] = await getDb()
    .select({ reminderTime: users.reminderTime })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  if (!user) throw new AppError("User not found", 404, "USER_NOT_FOUND")
  return { time: user.reminderTime?.slice(0, 5) ?? null }
}

export async function setReminder(userId: string, time: string | null) {
  const config = env()
  const [user] = await getDb()
    .update(users)
    .set({
      reminderTime: time,
      updatedAt: new Date(),
      ...(config.DEV_TELEGRAM_CHAT_ID
        ? { telegramUserId: config.DEV_TELEGRAM_CHAT_ID }
        : {}),
    })
    .where(eq(users.id, userId))
    .returning({ reminderTime: users.reminderTime })
  if (!user) throw new AppError("User not found", 404, "USER_NOT_FOUND")
  return { time: user.reminderTime?.slice(0, 5) ?? null }
}

async function sendTelegramReminder(chatId: string) {
  const config = env()
  if (!config.TELEGRAM_BOT_TOKEN) {
    throw new AppError(
      "TELEGRAM_BOT_TOKEN is not configured",
      503,
      "TELEGRAM_BOT_NOT_CONFIGURED"
    )
  }

  const response = await fetch(
    `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: "Небольшая порция английского уже ждёт тебя. Продолжим?",
        ...(config.TELEGRAM_WEB_APP_URL
          ? {
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: "Открыть занятие",
                      web_app: { url: config.TELEGRAM_WEB_APP_URL },
                    },
                  ],
                ],
              },
            }
          : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    }
  )
  if (!response.ok) {
    throw new AppError(
      "Telegram reminder failed",
      502,
      "TELEGRAM_REMINDER_FAILED",
      await response.text()
    )
  }
}

export async function sendDueReminders(now = new Date()) {
  const db = getDb()
  const candidates = await db
    .select({
      userId: users.id,
      timezone: users.timezone,
      reminderTime: users.reminderTime,
      chatId: users.telegramUserId,
    })
    .from(users)
    .where(and(isNotNull(users.reminderTime), isNotNull(users.telegramUserId)))

  let due = 0
  let sent = 0
  let failed = 0
  for (const candidate of candidates) {
    if (!candidate.reminderTime || !candidate.chatId) continue
    const localTime = timeInTimezone(now, candidate.timezone)
    const scheduledTime = candidate.reminderTime.slice(0, 5)
    if (localTime !== scheduledTime) continue
    due += 1
    const deliveryDate = dateInTimezone(now, candidate.timezone)
    const [completedPlan] = await db
      .select({ id: dailyPlans.id })
      .from(dailyPlans)
      .where(
        and(
          eq(dailyPlans.userId, candidate.userId),
          eq(dailyPlans.planDate, deliveryDate),
          eq(dailyPlans.status, "complete")
        )
      )
      .limit(1)
    if (completedPlan) continue

    const [claim] = await db
      .insert(reminderDeliveries)
      .values({
        userId: candidate.userId,
        deliveryDate,
        scheduledTime: candidate.reminderTime,
      })
      .onConflictDoNothing({
        target: [reminderDeliveries.userId, reminderDeliveries.deliveryDate],
      })
      .returning({ id: reminderDeliveries.id })
    if (!claim) continue

    try {
      await sendTelegramReminder(candidate.chatId)
      await db
        .update(reminderDeliveries)
        .set({ sentAt: now })
        .where(eq(reminderDeliveries.id, claim.id))
      sent += 1
    } catch {
      await db
        .delete(reminderDeliveries)
        .where(eq(reminderDeliveries.id, claim.id))
      failed += 1
    }
  }

  return { checked: candidates.length, due, sent, failed }
}
