import { z } from "zod"

import { authJsonError, noStore } from "@/server/auth/auth-http"
import { exchangeTelegramHandoff } from "@/server/auth/user-session"
import { AppError } from "@/server/shared/errors"
import { canonicalizeIanaTimezone } from "@/server/shared/timezone"

const requestSchema = z.object({
  attemptId: z.uuid(),
  code: z.string().min(1).max(512),
  handoffCodeVerifier: z.string().min(43).max(128),
  timezone: z.string().trim().min(1).max(100).optional(),
})

export async function POST(request: Request) {
  try {
    const input = requestSchema.parse(await request.json())
    const timezone = canonicalizeIanaTimezone(input.timezone)
    if (input.timezone && !timezone) {
      throw new AppError("Invalid timezone", 400, "INVALID_TIMEZONE")
    }
    const data = await exchangeTelegramHandoff({ ...input, timezone })
    return noStore(Response.json({ data }))
  } catch (error) {
    return noStore(authJsonError(error))
  }
}
