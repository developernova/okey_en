import { and, eq, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm"

import { getDb } from "@/db"
import { dailyPlans, reminderDeliveries, users } from "@/db/schema"
import { env } from "@/server/config/env"
import { AppError, toErrorMessage } from "@/server/shared/errors"
import { getToday } from "@/server/today/get-today"

const REMINDER_GRACE_MINUTES = 180
const CLAIM_LEASE_MS = 10 * 60 * 1000
const MAX_DELIVERY_ATTEMPTS = 8
const RETRY_DELAYS_MINUTES = [1, 2, 5, 10, 30, 60] as const

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

function timeToMinutes(value: string) {
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number)
  return hours * 60 + minutes
}

function timezoneOffsetMinutes(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date)
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  )
  const representedAsUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second)
  )
  const instantWithoutMilliseconds = Math.floor(date.getTime() / 1_000) * 1_000
  return Math.round((representedAsUtc - instantWithoutMilliseconds) / 60_000)
}

export function reminderOccurrence(
  now: Date,
  timezone: string,
  scheduledTime: string
) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now)
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  )
  const year = Number(values.year)
  const month = Number(values.month) - 1
  const day = Number(values.day)
  const nowWallClock = Date.UTC(
    year,
    month,
    day,
    Number(values.hour),
    Number(values.minute)
  )
  const scheduledMinutes = timeToMinutes(scheduledTime)
  const scheduledHour = Math.floor(scheduledMinutes / 60)
  const scheduledMinute = scheduledMinutes % 60
  let scheduledWallClock = Date.UTC(
    year,
    month,
    day,
    scheduledHour,
    scheduledMinute
  )
  if (scheduledWallClock > nowWallClock) {
    scheduledWallClock = Date.UTC(
      year,
      month,
      day - 1,
      scheduledHour,
      scheduledMinute
    )
  }

  const wallClockElapsedMinutes = Math.floor(
    (nowWallClock - scheduledWallClock) / 60_000
  )
  // Wall-clock subtraction is normally what reminder users expect, but it is
  // one hour too large/small when the interval crosses a DST transition.
  // Estimate the target instant from the wall interval and compensate for the
  // offset change. For a nonexistent spring-forward time, keep the wall value
  // so a 02:30 reminder can still be delivered just after 03:00.
  const approximateTarget = new Date(
    now.getTime() - wallClockElapsedMinutes * 60_000
  )
  const offsetDelta =
    timezoneOffsetMinutes(now, timezone) -
    timezoneOffsetMinutes(approximateTarget, timezone)
  const elapsedAcrossOffset = wallClockElapsedMinutes - offsetDelta

  return {
    deliveryDate: new Date(scheduledWallClock).toISOString().slice(0, 10),
    elapsedMinutes:
      elapsedAcrossOffset >= 0 ? elapsedAcrossOffset : wallClockElapsedMinutes,
  }
}

export function isReminderDue(
  now: Date,
  timezone: string,
  scheduledTime: string,
  graceMinutes = REMINDER_GRACE_MINUTES
) {
  const { elapsedMinutes } = reminderOccurrence(now, timezone, scheduledTime)
  return elapsedMinutes >= 0 && elapsedMinutes <= graceMinutes
}

export function reminderRetryDelayMinutes(attemptCount: number) {
  return RETRY_DELAYS_MINUTES[
    Math.min(Math.max(attemptCount - 1, 0), RETRY_DELAYS_MINUTES.length - 1)
  ]
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
  return getDb().transaction(async (tx) => {
    const [current] = await tx
      .select({ reminderTime: users.reminderTime })
      .from(users)
      .where(eq(users.id, userId))
      .for("update")
      .limit(1)
    if (!current) {
      throw new AppError("User not found", 404, "USER_NOT_FOUND")
    }

    const previousTime = current.reminderTime?.slice(0, 5) ?? null
    const nextTime = time?.slice(0, 5) ?? null
    const [user] = await tx
      .update(users)
      .set({
        reminderTime: time,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning({ reminderTime: users.reminderTime })

    if (previousTime !== nextTime) {
      // A failed delivery belongs to the schedule under which it was created.
      // Changing or disabling the reminder must not replay that old delivery.
      await tx
        .delete(reminderDeliveries)
        .where(
          and(
            eq(reminderDeliveries.userId, userId),
            isNull(reminderDeliveries.sentAt)
          )
        )
    }

    return { time: user.reminderTime?.slice(0, 5) ?? null }
  })
}

async function sendTelegramReminder(chatId: string, minutes: number) {
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
        text: `Сегодняшний план готов — ~${minutes} мин.`,
        ...(config.TELEGRAM_WEB_APP_URL
          ? {
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: "Открыть план",
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
  const realStartedAt = Date.now()
  const currentTime = () =>
    new Date(now.getTime() + Math.max(0, Date.now() - realStartedAt))
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
    const scheduledTime = candidate.reminderTime.slice(0, 5)
    if (!isReminderDue(currentTime(), candidate.timezone, scheduledTime)) {
      continue
    }
    due += 1
    const claim = await db.transaction(async (tx) => {
      // Serialize the claim with setReminder(). The candidate list is only a
      // hint: the learner may have changed or disabled the reminder since it
      // was read.
      const [freshUser] = await tx
        .select({
          timezone: users.timezone,
          reminderTime: users.reminderTime,
          chatId: users.telegramUserId,
        })
        .from(users)
        .where(eq(users.id, candidate.userId))
        .for("update")
        .limit(1)
      if (
        !freshUser?.reminderTime ||
        !freshUser.chatId ||
        freshUser.reminderTime.slice(0, 5) !== scheduledTime ||
        freshUser.timezone !== candidate.timezone ||
        freshUser.chatId !== candidate.chatId
      ) {
        return null
      }

      const claimNow = currentTime()
      const occurrence = reminderOccurrence(
        claimNow,
        freshUser.timezone,
        scheduledTime
      )
      if (
        occurrence.elapsedMinutes < 0 ||
        occurrence.elapsedMinutes > REMINDER_GRACE_MINUTES
      ) {
        return null
      }
      const deliveryDate = occurrence.deliveryDate
      const [completedPlan] = await tx
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
      if (completedPlan) return null

      await tx
        .insert(reminderDeliveries)
        .values({
          userId: candidate.userId,
          deliveryDate,
          scheduledTime: freshUser.reminderTime,
        })
        .onConflictDoNothing({
          target: [reminderDeliveries.userId, reminderDeliveries.deliveryDate],
        })

      const leaseUntil = new Date(claimNow.getTime() + CLAIM_LEASE_MS)
      const [claimedDelivery] = await tx
        .update(reminderDeliveries)
        .set({
          attemptCount: sql`${reminderDeliveries.attemptCount} + 1`,
          lastAttemptAt: claimNow,
          nextAttemptAt: leaseUntil,
        })
        .where(
          and(
            eq(reminderDeliveries.userId, candidate.userId),
            eq(reminderDeliveries.deliveryDate, deliveryDate),
            eq(reminderDeliveries.scheduledTime, freshUser.reminderTime),
            isNull(reminderDeliveries.sentAt),
            lt(reminderDeliveries.attemptCount, MAX_DELIVERY_ATTEMPTS),
            or(
              isNull(reminderDeliveries.nextAttemptAt),
              lte(reminderDeliveries.nextAttemptAt, claimNow)
            )
          )
        )
        .returning({
          id: reminderDeliveries.id,
          attemptCount: reminderDeliveries.attemptCount,
        })
      return claimedDelivery
        ? {
            ...claimedDelivery,
            chatId: freshUser.chatId,
            deliveryDate,
            scheduledTime,
            timezone: freshUser.timezone,
          }
        : null
    })
    if (!claim) continue

    try {
      // A background cron must never count as learner activity. In particular,
      // an empty review queue must not auto-complete a plan item here.
      const today = await getToday(candidate.userId, {
        autoCompleteEmptyReview: false,
      })
      const remainingMinutes = Math.max(
        1,
        (today.plan.completedItems.includes("watch")
          ? 0
          : today.episode.durationMinutes) +
          (today.plan.completedItems.includes("review")
            ? 0
            : today.queue.estimatedMinutes) +
          (today.plan.completedItems.includes("retell") ? 0 : 5)
      )
      const sendNow = currentTime()
      const [stillEligible] = await db
        .select({ id: reminderDeliveries.id })
        .from(reminderDeliveries)
        .innerJoin(users, eq(users.id, reminderDeliveries.userId))
        .where(
          and(
            eq(reminderDeliveries.id, claim.id),
            isNull(reminderDeliveries.sentAt),
            eq(reminderDeliveries.scheduledTime, users.reminderTime),
            eq(users.telegramUserId, claim.chatId),
            eq(users.timezone, claim.timezone)
          )
        )
        .limit(1)
      if (
        !stillEligible ||
        !isReminderDue(sendNow, claim.timezone, claim.scheduledTime)
      ) {
        continue
      }
      await sendTelegramReminder(claim.chatId, remainingMinutes)
      const sentAt = currentTime()
      await db
        .update(reminderDeliveries)
        .set({
          sentAt,
          nextAttemptAt: null,
          lastError: null,
        })
        .where(eq(reminderDeliveries.id, claim.id))
      sent += 1
    } catch (error) {
      const message = toErrorMessage(error)
      const failedAt = currentTime()
      const retryAt = new Date(
        failedAt.getTime() +
          reminderRetryDelayMinutes(claim.attemptCount) * 60_000
      )
      await db
        .update(reminderDeliveries)
        .set({
          lastError: message,
          nextAttemptAt: retryAt,
        })
        .where(eq(reminderDeliveries.id, claim.id))
      console.error("Telegram reminder delivery failed", {
        userId: candidate.userId,
        deliveryDate: claim.deliveryDate,
        attempt: claim.attemptCount,
        error: message,
      })
      failed += 1
    }
  }

  return { checked: candidates.length, due, sent, failed }
}
