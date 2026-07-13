import { and, asc, eq } from "drizzle-orm"

import { getDb } from "@/db"
import {
  episodes,
  transcriptSegments,
  userProgramProgress,
  users,
} from "@/db/schema"
import { completeDailyPlanItem } from "@/server/daily-plan/daily-plan-service"
import {
  generateInterviewAnalysis,
  generateInterviewQuestions,
} from "@/server/interview/openrouter"
import {
  dateInTimezone,
  reserveInterviewRequest,
} from "@/server/interview/rate-limit"
import {
  signInterviewState,
  verifyInterviewState,
} from "@/server/interview/session"
import { AppError } from "@/server/shared/errors"

async function getInterviewContext(userId: string, episodeId: string) {
  const db = getDb()
  const [episode] = await db
    .select({ timezone: users.timezone })
    .from(userProgramProgress)
    .innerJoin(users, eq(users.id, userProgramProgress.userId))
    .innerJoin(episodes, eq(episodes.id, userProgramProgress.currentEpisodeId))
    .where(
      and(
        eq(userProgramProgress.userId, userId),
        eq(userProgramProgress.currentEpisodeId, episodeId),
        eq(userProgramProgress.isActive, true),
        eq(episodes.ingestionStatus, "ready")
      )
    )
    .limit(1)

  if (!episode) {
    throw new AppError(
      "Episode is not active for this user",
      404,
      "INTERVIEW_EPISODE_NOT_ACTIVE"
    )
  }

  const segments = await db
    .select({ text: transcriptSegments.text })
    .from(transcriptSegments)
    .where(eq(transcriptSegments.episodeId, episodeId))
    .orderBy(asc(transcriptSegments.segmentIndex))

  if (segments.length === 0) {
    throw new AppError("Transcript not found", 404, "TRANSCRIPT_NOT_FOUND")
  }

  return {
    timezone: episode.timezone,
    transcript: segments.map((segment) => segment.text).join("\n"),
  }
}

export async function startInterview(userId: string, episodeId: string) {
  const now = new Date()
  const context = await getInterviewContext(userId, episodeId)
  const { requestDate } = await reserveInterviewRequest({
    userId,
    episodeId,
    kind: "start",
    now,
  })
  const plan = await generateInterviewQuestions({
    episodeId,
    transcript: context.transcript,
  })
  const firstQuestion = plan.questions[0]
  const state = {
    version: 1 as const,
    userId,
    episodeId,
    requestDate,
    answersCompleted: 0,
    questions: plan.questions,
    conversation: [{ role: "assistant" as const, content: firstQuestion }],
    issuedAt: now.getTime(),
  }

  return {
    message: firstQuestion,
    correction: null,
    reaction: null,
    completed: false,
    answersCompleted: 0,
    questionNumber: 1,
    sessionToken: signInterviewState(state),
  }
}

export async function replyToInterview(input: {
  userId: string
  episodeId: string
  sessionToken: string
  answer: string
}) {
  const now = new Date()
  const context = await getInterviewContext(input.userId, input.episodeId)
  const state = verifyInterviewState(input.sessionToken)
  const requestDate = dateInTimezone(now, context.timezone)

  if (
    state.userId !== input.userId ||
    state.episodeId !== input.episodeId ||
    state.requestDate !== requestDate ||
    state.answersCompleted >= 3 ||
    now.getTime() - state.issuedAt > 6 * 60 * 60 * 1000 ||
    state.issuedAt > now.getTime() + 5 * 60 * 1000
  ) {
    throw new AppError(
      "Интервью устарело. Начни его заново.",
      400,
      "INTERVIEW_SESSION_EXPIRED"
    )
  }

  await reserveInterviewRequest({
    userId: input.userId,
    episodeId: input.episodeId,
    kind: "reply",
    now,
  })

  const answer = input.answer.trim()
  const answersCompleted = state.answersCompleted + 1
  const conversation = [
    ...state.conversation,
    { role: "user" as const, content: answer },
  ]
  const turn = await generateInterviewAnalysis({
    episodeId: input.episodeId,
    transcript: context.transcript,
    question: state.questions[state.answersCompleted],
    answer,
    answersCompleted,
  })
  const completed = answersCompleted === 3
  if (completed) {
    await completeDailyPlanItem({
      userId: input.userId,
      episodeId: input.episodeId,
      type: "retell",
      now,
    })
  }
  const message = completed
    ? (turn.closing ?? "Спасибо, на сегодня всё.")
    : state.questions[answersCompleted]
  const assistantContent = [
    turn.correction ? `Language correction: ${turn.correction}` : null,
    turn.reaction,
    message,
  ]
    .filter(Boolean)
    .join("\n")
  const nextConversation = [
    ...conversation,
    { role: "assistant" as const, content: assistantContent },
  ]

  return {
    message,
    correction: turn.correction,
    reaction: turn.reaction,
    completed,
    answersCompleted,
    questionNumber: completed ? null : answersCompleted + 1,
    sessionToken: completed
      ? null
      : signInterviewState({
          ...state,
          answersCompleted,
          conversation: nextConversation,
          issuedAt: now.getTime(),
        }),
  }
}
