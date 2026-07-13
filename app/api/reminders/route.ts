import { z } from "zod"

import { requireUserId } from "@/server/auth/user-context"
import { getReminder, setReminder } from "@/server/reminders/reminder-service"
import { jsonError } from "@/server/shared/http"

const requestSchema = z.object({
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .nullable(),
})

export async function GET(request: Request) {
  try {
    const userId = await requireUserId(request)
    return Response.json({ data: await getReminder(userId) })
  } catch (error) {
    return jsonError(error)
  }
}

export async function PUT(request: Request) {
  try {
    const userId = await requireUserId(request)
    const input = requestSchema.parse(await request.json())
    return Response.json({ data: await setReminder(userId, input.time) })
  } catch (error) {
    return jsonError(error)
  }
}
