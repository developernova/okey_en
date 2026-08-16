import { z } from "zod"

import { env } from "@/server/config/env"
import { reserveInterviewRequest } from "@/server/interview/rate-limit"
import { verifyInterviewState } from "@/server/interview/session"
import { AppError } from "@/server/shared/errors"

const maxAudioBytes = 8 * 1024 * 1024
const acceptedAudioTypes = new Set([
  "audio/flac",
  "audio/m4a",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "audio/x-m4a",
  "audio/x-wav",
  "video/mp4",
  "video/webm",
])

const transcriptionSchema = z.object({
  text: z.string(),
})

export function validateEnglishAudioFile(
  audio: File,
  errorCode = "INVALID_AUDIO"
) {
  if (
    audio.size === 0 ||
    audio.size > maxAudioBytes ||
    !acceptedAudioTypes.has(audio.type.toLowerCase().split(";", 1)[0])
  ) {
    throw new AppError("Invalid audio", 400, errorCode)
  }
}

export function validateInterviewAudio(input: {
  userId: string
  episodeId: string
  sessionToken: string
  audio: File
  now?: Date
}) {
  const now = input.now ?? new Date()
  const state = verifyInterviewState(input.sessionToken)

  if (
    state.userId !== input.userId ||
    state.episodeId !== input.episodeId ||
    (state.mode === "interview" && state.answersCompleted >= 3) ||
    now.getTime() - state.issuedAt > 30 * 60 * 60 * 1000 ||
    state.issuedAt > now.getTime() + 5 * 60 * 1000
  ) {
    throw new AppError(
      "Интервью устарело. Начни его заново.",
      400,
      "INTERVIEW_SESSION_EXPIRED"
    )
  }

  validateEnglishAudioFile(input.audio, "INVALID_INTERVIEW_AUDIO")
}

export async function transcribeEnglishAudio(audio: File) {
  validateEnglishAudioFile(audio)
  const config = env()

  const body = new FormData()
  body.set("file", audio, audio.name || "answer.webm")
  body.set("model", config.OPENROUTER_TRANSCRIPTION_MODEL)
  body.set("language", "en")
  body.set("temperature", "0")

  let response: Response
  try {
    response = await fetch(
      "https://openrouter.ai/api/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.OPENROUTER_API_KEY}`,
          "HTTP-Referer": config.OPENROUTER_APP_URL,
          "X-OpenRouter-Title": config.OPENROUTER_APP_NAME,
        },
        body,
        signal: AbortSignal.timeout(45_000),
      }
    )
  } catch (error) {
    throw new AppError(
      "Voice input is unavailable",
      502,
      "TRANSCRIPTION_UNAVAILABLE",
      error instanceof Error ? error.message : undefined
    )
  }

  if (!response.ok) {
    throw new AppError(
      "Voice input is unavailable",
      502,
      "TRANSCRIPTION_ERROR",
      await response.text()
    )
  }

  const parsed = transcriptionSchema.safeParse(await response.json())
  const text = parsed.success ? parsed.data.text.trim() : ""
  if (!text) {
    throw new AppError("Empty transcription", 422, "EMPTY_TRANSCRIPTION")
  }

  return { text: text.slice(0, 600) }
}

export async function transcribeInterviewAudio(input: {
  userId: string
  episodeId: string
  sessionToken: string
  audio: File
}) {
  validateInterviewAudio(input)

  await reserveInterviewRequest({
    userId: input.userId,
    episodeId: input.episodeId,
    kind: "transcribe",
  })
  return transcribeEnglishAudio(input.audio)
}
