import { z } from "zod"

import { requireUserId } from "@/server/auth/user-context"
import { transcribePhrasePracticeAudio } from "@/server/phrase-practice/phrase-practice"
import { jsonError } from "@/server/shared/http"

const fieldsSchema = z.object({
  cardId: z.uuid(),
})

export async function POST(request: Request) {
  try {
    const userId = await requireUserId(request)
    const formData = await request.formData()
    const fields = fieldsSchema.parse({ cardId: formData.get("cardId") })
    const audio = formData.get("audio")
    if (!(audio instanceof File)) {
      return Response.json(
        { error: { code: "INVALID_PHRASE_AUDIO" } },
        { status: 400 }
      )
    }

    const data = await transcribePhrasePracticeAudio({
      userId,
      cardId: fields.cardId,
      audio,
    })
    return Response.json({ data })
  } catch (error) {
    return jsonError(error)
  }
}
