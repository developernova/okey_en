import { z } from "zod"

import { requireUserId } from "@/server/auth/user-context"
import { transcribeInterviewAudio } from "@/server/interview/transcription"
import { jsonError } from "@/server/shared/http"

const fieldsSchema = z.object({
  episodeId: z.uuid(),
  sessionToken: z.string().min(20).max(12_000),
})

export async function POST(request: Request) {
  try {
    const userId = await requireUserId(request)
    const formData = await request.formData()
    const fields = fieldsSchema.parse({
      episodeId: formData.get("episodeId"),
      sessionToken: formData.get("sessionToken"),
    })
    const audio = formData.get("audio")
    if (!(audio instanceof File)) {
      return Response.json(
        { error: { code: "INVALID_INTERVIEW_AUDIO" } },
        { status: 400 }
      )
    }

    const data = await transcribeInterviewAudio({ userId, audio, ...fields })
    return Response.json({ data })
  } catch (error) {
    return jsonError(error)
  }
}
