import { after } from "next/server"

import { cleanupExpiredAuthRecords } from "@/server/auth/auth-maintenance"
import { env } from "@/server/config/env"
import { startImportWorker } from "@/server/content/import-queue"
import { sendDueReminders } from "@/server/reminders/reminder-service"
import { AppError } from "@/server/shared/errors"
import { jsonError } from "@/server/shared/http"

export async function POST(request: Request) {
  try {
    const secret = request.headers.get("x-cron-secret")
    if (!env().REMINDER_CRON_SECRET || secret !== env().REMINDER_CRON_SECRET) {
      throw new AppError("Invalid cron secret", 401, "CRON_REQUIRED")
    }
    // The same durable cron tick also wakes database-backed imports after a
    // deploy/restart. Register it before reminder work so one Telegram failure
    // cannot prevent queue recovery.
    after(() => startImportWorker())
    const [result, authCleanup] = await Promise.all([
      sendDueReminders(),
      cleanupExpiredAuthRecords(),
    ])
    return Response.json({ data: { ...result, authCleanup } })
  } catch (error) {
    return jsonError(error)
  }
}
