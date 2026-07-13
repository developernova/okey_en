import { z } from "zod"

import { requireUserId } from "@/server/auth/user-context"
import {
  helpWithInterviewWord,
  replyToInterview,
  startInterview,
} from "@/server/interview/interview-service"
import { jsonError } from "@/server/shared/http"

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), episodeId: z.uuid() }),
  z.object({
    action: z.literal("reply"),
    episodeId: z.uuid(),
    sessionToken: z.string().min(20).max(20_000),
    answer: z.string().trim().min(1).max(600),
  }),
  z.object({
    action: z.literal("word_help"),
    episodeId: z.uuid(),
    sessionToken: z.string().min(20).max(20_000),
    word: z.string().trim().min(1).max(60),
  }),
])

export async function POST(request: Request) {
  try {
    const userId = await requireUserId(request)
    const input = requestSchema.parse(await request.json())
    const data =
      input.action === "start"
        ? await startInterview(userId, input.episodeId)
        : input.action === "reply"
          ? await replyToInterview({ userId, ...input })
          : await helpWithInterviewWord({ userId, ...input })
    return Response.json({ data })
  } catch (error) {
    return jsonError(error)
  }
}
