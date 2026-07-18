import { z } from "zod"

import { requireUserId } from "@/server/auth/user-context"
import { completeDailyPlanItem } from "@/server/daily-plan/daily-plan-service"
import { jsonError } from "@/server/shared/http"

const requestSchema = z.object({
  planId: z.uuid(),
  episodeId: z.uuid(),
  type: z.enum(["watch", "review", "retell"]),
})

export async function POST(request: Request) {
  try {
    const userId = await requireUserId(request)
    const input = requestSchema.parse(await request.json())
    return Response.json({
      data: await completeDailyPlanItem({ userId, ...input }),
    })
  } catch (error) {
    return jsonError(error)
  }
}
