import { z } from "zod"

import { authJsonError, noStore } from "@/server/auth/auth-http"
import { startTelegramOidc } from "@/server/auth/telegram-oidc"

const requestSchema = z.object({
  platform: z.enum(["ios", "macos"]),
  deviceId: z.uuid(),
  deviceName: z.string().trim().min(1).max(100).optional(),
  handoffCodeChallenge: z.string().regex(/^[A-Za-z\d_-]{43}$/),
  handoffCodeChallengeMethod: z.literal("S256"),
})

export async function POST(request: Request) {
  try {
    const input = requestSchema.parse(await request.json())
    const data = await startTelegramOidc(input)
    return noStore(Response.json({ data }, { status: 201 }))
  } catch (error) {
    return noStore(authJsonError(error))
  }
}
