import { z } from "zod"

import { requireUserId } from "@/server/auth/user-context"
import {
  replyToInterview,
  startInterview,
} from "@/server/interview/interview-service"
import { jsonError } from "@/server/shared/http"

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), episodeId: z.uuid() }),
  z.object({
    action: z.literal("reply"),
    episodeId: z.uuid(),
    sessionToken: z.string().min(20).max(12_000),
    answer: z.string().trim().min(1).max(600),
  }),
])

export async function POST(request: Request) {
  try {
    const userId = await requireUserId(request)
    const input = requestSchema.parse(await request.json())
    const data =
      input.action === "start"
        ? await startInterview(userId, input.episodeId)
        : await replyToInterview({ userId, ...input })
    return Response.json({ data })
  } catch (error) {
    return jsonError(error)
  }
}
