import { z } from "zod"

import { requireUserId } from "@/server/auth/user-context"
import {
  replyToPhrasePractice,
  startPhrasePractice,
} from "@/server/phrase-practice/phrase-practice"
import { jsonError } from "@/server/shared/http"

const messageSchema = z.object({
  role: z.enum(["assistant", "user"]),
  content: z.string().trim().min(1).max(600),
})

const requestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), cardId: z.uuid() }),
  z.object({
    action: z.literal("reply"),
    cardId: z.uuid(),
    messages: z.array(messageSchema).min(2).max(10),
  }),
])

export async function POST(request: Request) {
  try {
    const userId = await requireUserId(request)
    const input = requestSchema.parse(await request.json())
    const data =
      input.action === "start"
        ? await startPhrasePractice(userId, input.cardId)
        : await replyToPhrasePractice({ userId, ...input })
    return Response.json({ data })
  } catch (error) {
    return jsonError(error)
  }
}
