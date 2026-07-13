import { createHmac, timingSafeEqual } from "node:crypto"

import { z } from "zod"

import { env } from "@/server/config/env"
import { AppError } from "@/server/shared/errors"

const conversationMessageSchema = z.object({
  role: z.enum(["assistant", "user"]),
  content: z.string().min(1).max(1_200),
})

export const interviewStateSchema = z.object({
  version: z.literal(1),
  userId: z.uuid(),
  episodeId: z.uuid(),
  requestDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  answersCompleted: z.number().int().min(0).max(3),
  questions: z.array(z.string().min(1).max(300)).length(3),
  conversation: z.array(conversationMessageSchema).max(7),
  issuedAt: z.number().int().positive(),
})

export type InterviewState = z.infer<typeof interviewStateSchema>

function defaultSecret() {
  return `okey-english-interview:${env().ADMIN_API_SECRET}`
}

export function signInterviewState(
  state: InterviewState,
  secret = defaultSecret()
) {
  const payload = Buffer.from(JSON.stringify(state)).toString("base64url")
  const signature = createHmac("sha256", secret)
    .update(payload)
    .digest("base64url")
  return `${payload}.${signature}`
}

export function verifyInterviewState(token: string, secret = defaultSecret()) {
  const [payload, signature, extra] = token.split(".")
  if (!payload || !signature || extra) {
    throw new AppError("Invalid interview session", 400, "INVALID_INTERVIEW_SESSION")
  }
  const expected = createHmac("sha256", secret).update(payload).digest()
  const received = Buffer.from(signature, "base64url")
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw new AppError("Invalid interview session", 400, "INVALID_INTERVIEW_SESSION")
  }
  try {
    return interviewStateSchema.parse(
      JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
    )
  } catch {
    throw new AppError("Invalid interview session", 400, "INVALID_INTERVIEW_SESSION")
  }
}
