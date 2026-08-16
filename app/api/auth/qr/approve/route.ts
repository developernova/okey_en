import { z } from "zod"

import { authJsonError, privateNoStore } from "@/server/auth/auth-http"
import { approveQrAuthChallenge } from "@/server/auth/qr-auth"
import { resolveAccessSession } from "@/server/auth/user-session"
import { requireWebAccessAuthorization } from "@/server/auth/web-session"

const inputSchema = z.object({ token: z.string().min(1).max(128) })

export async function POST(request: Request) {
  try {
    const input = inputSchema.parse(await request.json())
    const session = await resolveAccessSession(
      requireWebAccessAuthorization(request)
    )
    const data = await approveQrAuthChallenge(input.token, session.userId)
    return privateNoStore(Response.json({ data }))
  } catch (error) {
    return privateNoStore(authJsonError(error))
  }
}
