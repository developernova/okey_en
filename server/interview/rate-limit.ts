import { and, count, eq, gte } from "drizzle-orm"

import { getDb } from "@/db"
import { interviewRequests, users } from "@/db/schema"
import { AppError } from "@/server/shared/errors"

const requestsPerMinute = 10
const userMessagesPerDay = 30
const totalRequestsPerDay = 40

export type InterviewRequestKind = "start" | "reply" | "transcribe"

export function dateInTimezone(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

export async function reserveInterviewRequest(input: {
  userId: string
  episodeId: string
  kind: InterviewRequestKind
  now?: Date
}) {
  const db = getDb()
  const now = input.now ?? new Date()
  const minuteAgo = new Date(now.getTime() - 60_000)

  return db.transaction(async (tx) => {
    const [user] = await tx
      .select({ timezone: users.timezone })
      .from(users)
      .where(eq(users.id, input.userId))
      .for("update")
      .limit(1)

    if (!user) throw new AppError("User not found", 404, "USER_NOT_FOUND")
    const requestDate = dateInTimezone(now, user.timezone)

    const [[minute], [daily], [dailyReplies]] = await Promise.all([
      tx
        .select({ value: count() })
        .from(interviewRequests)
        .where(
          and(
            eq(interviewRequests.userId, input.userId),
            gte(interviewRequests.createdAt, minuteAgo)
          )
        ),
      tx
        .select({ value: count() })
        .from(interviewRequests)
        .where(
          and(
            eq(interviewRequests.userId, input.userId),
            eq(interviewRequests.requestDate, requestDate)
          )
        ),
      tx
        .select({ value: count() })
        .from(interviewRequests)
        .where(
          and(
            eq(interviewRequests.userId, input.userId),
            eq(interviewRequests.requestDate, requestDate),
            eq(interviewRequests.kind, "reply")
          )
        ),
    ])

    if (minute.value >= requestsPerMinute) {
      throw new AppError(
        "Слишком много сообщений. Попробуй через минуту.",
        429,
        "INTERVIEW_RATE_LIMIT",
        { retryAfterSeconds: 60 }
      )
    }
    if (
      daily.value >= totalRequestsPerDay ||
      (input.kind === "reply" && dailyReplies.value >= userMessagesPerDay)
    ) {
      throw new AppError(
        "Лимит интервью на сегодня закончился. Продолжим завтра.",
        429,
        "INTERVIEW_DAILY_LIMIT"
      )
    }

    await tx.insert(interviewRequests).values({
      userId: input.userId,
      episodeId: input.episodeId,
      kind: input.kind,
      requestDate,
      createdAt: now,
    })

    return { requestDate, timezone: user.timezone }
  })
}
