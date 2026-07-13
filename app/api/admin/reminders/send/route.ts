import { env } from "@/server/config/env"
import { sendDueReminders } from "@/server/reminders/reminder-service"
import { AppError } from "@/server/shared/errors"
import { jsonError } from "@/server/shared/http"

export async function POST(request: Request) {
  try {
    const secret = request.headers.get("x-cron-secret")
    if (!env().REMINDER_CRON_SECRET || secret !== env().REMINDER_CRON_SECRET) {
      throw new AppError("Invalid cron secret", 401, "CRON_REQUIRED")
    }
    return Response.json({ data: await sendDueReminders() })
  } catch (error) {
    return jsonError(error)
  }
}
