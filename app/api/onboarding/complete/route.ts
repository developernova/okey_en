import { z } from "zod"

import { requireUserId } from "@/server/auth/user-context"
import { completeOnboarding } from "@/server/onboarding/complete-onboarding"
import { jsonError } from "@/server/shared/http"

const requestSchema = z.object({ level: z.enum(["A1", "A2", "B1", "B2"]) })

export async function POST(request: Request) {
  try {
    const userId = await requireUserId(request)
    const input = requestSchema.parse(await request.json())
    return Response.json({
      data: await completeOnboarding(userId, input.level),
    })
  } catch (error) {
    return jsonError(error)
  }
}
