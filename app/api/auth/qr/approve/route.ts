import { z } from "zod"

import { authJsonError, privateNoStore } from "@/server/auth/auth-http"
import { approveQrAuthChallenge } from "@/server/auth/qr-auth"
import { requireUserId } from "@/server/auth/user-context"

const inputSchema = z.object({ token: z.string().min(1).max(128) })

export async function POST(request: Request) {
  try {
    const input = inputSchema.parse(await request.json())
    const userId = await requireUserId(request)
    const data = await approveQrAuthChallenge(input.token, userId)
    return privateNoStore(Response.json({ data }))
  } catch (error) {
    return privateNoStore(authJsonError(error))
  }
}
