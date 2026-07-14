import { and, asc, desc, eq, gte } from "drizzle-orm"

import { getDb } from "@/db"
import {
  dailyPlans,
  episodes,
  transcriptSegments,
  userLexemes,
  userProgramProgress,
  users,
} from "@/db/schema"
import { completeDailyPlanItem } from "@/server/daily-plan/daily-plan-service"
import {
  generateContinuationTurn,
  generateInterviewAnalysis,
  generateInterviewQuestions,
} from "@/server/interview/openrouter"
import { findQuestionGloss } from "@/server/interview/question"
import {
  dateInTimezone,
  reserveInterviewRequest,
} from "@/server/interview/rate-limit"
import {
  signInterviewState,
  verifyInterviewState,
} from "@/server/interview/session"
import { AppError } from "@/server/shared/errors"
import { prioritizeInterviewWord } from "@/server/interview/word-help"

async function getInterviewContext(
  userId: string,
  episodeId: string,
  now = new Date()
) {
  const db = getDb()
  const [user] = await db
    .select({
      timezone: users.timezone,
      levelEstimate: users.levelEstimate,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (!user) {
    throw new AppError("User not found", 404, "USER_NOT_FOUND")
  }

  const planDate = dateInTimezone(now, user.timezone)
  const [[readyEpisode], [activeEpisode], [todayEpisode]] = await Promise.all([
    db
      .select({ id: episodes.id })
      .from(episodes)
      .where(
        and(
          eq(episodes.id, episodeId),
          eq(episodes.ingestionStatus, "ready"),
          eq(episodes.isActive, true)
        )
      )
      .limit(1),
    db
      .select({ episodeId: userProgramProgress.currentEpisodeId })
      .from(userProgramProgress)
      .where(
        and(
          eq(userProgramProgress.userId, userId),
          eq(userProgramProgress.currentEpisodeId, episodeId),
          eq(userProgramProgress.isActive, true)
        )
      )
      .limit(1),
    db
      .select({ episodeId: dailyPlans.episodeId })
      .from(dailyPlans)
      .where(
        and(
          eq(dailyPlans.userId, userId),
          eq(dailyPlans.episodeId, episodeId),
          eq(dailyPlans.planDate, planDate)
        )
      )
      .limit(1),
  ])

  if (!readyEpisode || (!activeEpisode && !todayEpisode)) {
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

  const knownVocabulary = await db
    .select({ lemma: userLexemes.lemma })
    .from(userLexemes)
    .where(
      and(eq(userLexemes.userId, userId), gte(userLexemes.confidence, 0.8))
    )
    .orderBy(desc(userLexemes.confidence), asc(userLexemes.lemma))
    .limit(1_200)

  return {
    timezone: user.timezone,
    learnerLevel: user.levelEstimate ?? "A2",
    knownVocabulary: knownVocabulary.map((item) => item.lemma),
    transcript: segments.map((segment) => segment.text).join("\n"),
  }
}

function assertUsableInterviewState(input: {
  state: ReturnType<typeof verifyInterviewState>
  userId: string
  episodeId: string
  requestDate: string
  now: Date
}) {
  if (
    input.state.userId !== input.userId ||
    input.state.episodeId !== input.episodeId ||
    input.state.requestDate !== input.requestDate ||
    input.now.getTime() - input.state.issuedAt > 6 * 60 * 60 * 1000 ||
    input.state.issuedAt > input.now.getTime() + 5 * 60 * 1000
  ) {
    throw new AppError(
      "Интервью устарело. Начни его заново.",
      400,
      "INTERVIEW_SESSION_EXPIRED"
    )
  }
}

function assertQuestionState(state: ReturnType<typeof verifyInterviewState>) {
  if (state.mode !== "interview" || state.answersCompleted >= 3) {
    throw new AppError(
      "Интервью устарело. Начни его заново.",
      400,
      "INTERVIEW_SESSION_EXPIRED"
    )
  }
}

function recentConversation(
  conversation: ReturnType<typeof verifyInterviewState>["conversation"]
) {
  return conversation.slice(-10)
}

function publicQuestionWords(
  question: ReturnType<typeof verifyInterviewState>["questions"][number]
) {
  return [...new Set(question.glossary.map((item) => item.word))]
}

export async function startInterview(userId: string, episodeId: string) {
  const now = new Date()
  const context = await getInterviewContext(userId, episodeId, now)
  const { requestDate } = await reserveInterviewRequest({
    userId,
    episodeId,
    kind: "start",
    now,
  })
  const plan = await generateInterviewQuestions({
    episodeId,
    transcript: context.transcript,
    learnerLevel: context.learnerLevel,
    knownVocabulary: context.knownVocabulary,
  })
  const firstQuestion = plan.questions[0]
  const state = {
    version: 3 as const,
    userId,
    episodeId,
    requestDate,
    mode: "interview" as const,
    answersCompleted: 0,
    questions: plan.questions,
    conversation: [{ role: "assistant" as const, content: firstQuestion.text }],
    issuedAt: now.getTime(),
  }

  return {
    message: firstQuestion.text,
    questionWords: publicQuestionWords(firstQuestion),
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
  const context = await getInterviewContext(input.userId, input.episodeId, now)
  const state = verifyInterviewState(input.sessionToken)
  const requestDate = dateInTimezone(now, context.timezone)
  assertUsableInterviewState({
    state,
    userId: input.userId,
    episodeId: input.episodeId,
    requestDate,
    now,
  })

  await reserveInterviewRequest({
    userId: input.userId,
    episodeId: input.episodeId,
    kind: "reply",
    now,
  })

  const answer = input.answer.trim()
  if (state.mode === "continuation") {
    const conversation = recentConversation([
      ...state.conversation,
      { role: "user" as const, content: answer },
    ])
    const turn = await generateContinuationTurn({
      episodeId: input.episodeId,
      transcript: context.transcript,
      learnerLevel: context.learnerLevel,
      knownVocabulary: context.knownVocabulary,
      conversation,
    })
    const assistantContent = [
      turn.correction ? `Language correction: ${turn.correction}` : null,
      turn.message,
    ]
      .filter(Boolean)
      .join("\n")
    const nextConversation = recentConversation([
      ...conversation,
      { role: "assistant" as const, content: assistantContent },
    ])

    return {
      message: turn.message,
      correction: turn.correction,
      reaction: null,
      queuedWord: null,
      completed: true,
      answersCompleted: 3,
      questionNumber: null,
      questionWords: [],
      sessionToken: signInterviewState({
        ...state,
        conversation: nextConversation,
        issuedAt: now.getTime(),
      }),
    }
  }

  assertQuestionState(state)
  const answersCompleted = state.answersCompleted + 1
  const currentQuestion = state.questions[state.answersCompleted]
  const conversation = [
    ...state.conversation,
    { role: "user" as const, content: answer },
  ]
  const turn = await generateInterviewAnalysis({
    episodeId: input.episodeId,
    transcript: context.transcript,
    question: currentQuestion.text,
    answer,
  })
  const unknownGloss = turn.unknownWord
    ? findQuestionGloss(currentQuestion, turn.unknownWord)
    : undefined
  const queuedWord = unknownGloss
    ? await prioritizeInterviewWord({
        userId: input.userId,
        episodeId: input.episodeId,
        question: currentQuestion,
        word: unknownGloss.word,
        now,
      })
    : null
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
    ? "Шаг засчитан ✓. Хочешь ещё обсудить видео — пиши, или возвращайся к плану."
    : state.questions[answersCompleted].text
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
    queuedWord,
    completed,
    answersCompleted,
    questionNumber: completed ? null : answersCompleted + 1,
    questionWords: completed
      ? []
      : publicQuestionWords(state.questions[answersCompleted]),
    sessionToken: signInterviewState({
      ...state,
      mode: completed ? "continuation" : "interview",
      answersCompleted,
      conversation: recentConversation(nextConversation),
      issuedAt: now.getTime(),
    }),
  }
}

export async function helpWithInterviewWord(input: {
  userId: string
  episodeId: string
  sessionToken: string
  word: string
}) {
  const now = new Date()
  const context = await getInterviewContext(input.userId, input.episodeId, now)
  const state = verifyInterviewState(input.sessionToken)
  assertUsableInterviewState({
    state,
    userId: input.userId,
    episodeId: input.episodeId,
    requestDate: dateInTimezone(now, context.timezone),
    now,
  })
  assertQuestionState(state)

  return prioritizeInterviewWord({
    userId: input.userId,
    episodeId: input.episodeId,
    question: state.questions[state.answersCompleted],
    word: input.word,
    now,
  })
}
