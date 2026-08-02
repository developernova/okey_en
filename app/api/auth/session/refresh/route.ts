import { z } from "zod"

import { authJsonError, noStore } from "@/server/auth/auth-http"
import { refreshUserSession } from "@/server/auth/user-session"

const requestSchema = z.object({
  refreshToken: z.string().min(1).max(512),
})

export async function POST(request: Request) {
  try {
    const { refreshToken } = requestSchema.parse(await request.json())
    const data = await refreshUserSession(refreshToken)
    return noStore(Response.json({ data }))
  } catch (error) {
    return noStore(authJsonError(error))
  }
}
