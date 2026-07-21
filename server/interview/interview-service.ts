import { and, asc, desc, eq, gte, ne } from "drizzle-orm"
import { randomUUID } from "node:crypto"

import { getDb } from "@/db"
import {
  dailyPlans,
  episodes,
  interviewSessions,
  type StoredInterviewMessage,
  transcriptSegments,
  userLexemes,
  users,
} from "@/db/schema"
import { completeDailyPlanItem } from "@/server/daily-plan/daily-plan-service"
import { isSubstantiveInterviewAnswer } from "@/server/interview/answer"
import {
  generateContinuationTurn,
  generateInterviewAnalysis,
  generateInterviewQuestions,
} from "@/server/interview/openai"
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
  const [[readyEpisode], [todayEpisode]] = await Promise.all([
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
      .select({ planId: dailyPlans.id, episodeId: dailyPlans.episodeId })
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

  if (!readyEpisode || !todayEpisode) {
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
      and(
        eq(userLexemes.userId, userId),
        gte(userLexemes.confidence, 0.8),
        ne(userLexemes.source, "placement_test")
      )
    )
    .orderBy(desc(userLexemes.confidence), asc(userLexemes.lemma))
    .limit(1_200)

  return {
    dailyPlanId: todayEpisode.planId,
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

type StoredSession = {
  sessionToken: string
  messages: StoredInterviewMessage[]
  answersCompleted: number
  completed: boolean
}

function storedSessionResponse(session: StoredSession) {
  const lastAssistant = [...session.messages]
    .reverse()
    .find((message) => message.role === "assistant")
  return {
    message: lastAssistant?.text ?? "",
    questionWords: lastAssistant?.questionWords ?? [],
    correction: null,
    reaction: null,
    queuedWord: null,
    completed: session.completed,
    answersCompleted: session.answersCompleted,
    questionNumber: session.completed ? null : session.answersCompleted + 1,
    sessionToken: session.sessionToken,
    messages: session.messages,
    restored: true,
  }
}

async function findStoredSession(userId: string, dailyPlanId: string) {
  const [session] = await getDb()
    .select({
      sessionToken: interviewSessions.sessionToken,
      messages: interviewSessions.messages,
      answersCompleted: interviewSessions.answersCompleted,
      completed: interviewSessions.completed,
    })
    .from(interviewSessions)
    .where(
      and(
        eq(interviewSessions.userId, userId),
        eq(interviewSessions.dailyPlanId, dailyPlanId)
      )
    )
    .limit(1)
  return session
}

async function saveStoredSession(input: {
  userId: string
  dailyPlanId: string
  episodeId: string
  sessionToken: string
  messages: StoredInterviewMessage[]
  answersCompleted: number
  completed: boolean
  now: Date
}) {
  await getDb()
    .insert(interviewSessions)
    .values({
      userId: input.userId,
      dailyPlanId: input.dailyPlanId,
      episodeId: input.episodeId,
      sessionToken: input.sessionToken,
      messages: input.messages,
      answersCompleted: input.answersCompleted,
      completed: input.completed,
      updatedAt: input.now,
    })
    .onConflictDoUpdate({
      target: interviewSessions.dailyPlanId,
      set: {
        sessionToken: input.sessionToken,
        messages: input.messages,
        answersCompleted: input.answersCompleted,
        completed: input.completed,
        updatedAt: input.now,
      },
    })
}

export async function startInterview(userId: string, episodeId: string) {
  const now = new Date()
  const context = await getInterviewContext(userId, episodeId, now)
  const stored = await findStoredSession(userId, context.dailyPlanId)
  if (stored) {
    try {
      const state = verifyInterviewState(stored.sessionToken)
      assertUsableInterviewState({
        state,
        userId,
        episodeId,
        requestDate: dateInTimezone(now, context.timezone),
        now,
      })
      return storedSessionResponse(stored)
    } catch {
      await getDb()
        .delete(interviewSessions)
        .where(eq(interviewSessions.dailyPlanId, context.dailyPlanId))
    }
  }
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

  const sessionToken = signInterviewState(state)
  const messages: StoredInterviewMessage[] = [
    {
      id: randomUUID(),
      role: "assistant",
      text: firstQuestion.text,
      questionWords: publicQuestionWords(firstQuestion),
      helpToken: sessionToken,
    },
  ]
  await saveStoredSession({
    userId,
    dailyPlanId: context.dailyPlanId,
    episodeId,
    sessionToken,
    messages,
    answersCompleted: 0,
    completed: false,
    now,
  })

  return {
    message: firstQuestion.text,
    questionWords: publicQuestionWords(firstQuestion),
    correction: null,
    reaction: null,
    completed: false,
    answersCompleted: 0,
    questionNumber: 1,
    sessionToken,
    messages,
    restored: false,
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

  const stored = await findStoredSession(input.userId, context.dailyPlanId)
  if (stored && stored.sessionToken !== input.sessionToken) {
    return storedSessionResponse(stored)
  }

  await reserveInterviewRequest({
    userId: input.userId,
    episodeId: input.episodeId,
    kind: "reply",
    now,
  })

  const answer = input.answer.trim()
  const storedMessages = stored?.messages ?? []
  const userMessage: StoredInterviewMessage = {
    id: randomUUID(),
    role: "user",
    text: answer,
  }
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

    const sessionToken = signInterviewState({
      ...state,
      conversation: nextConversation,
      issuedAt: now.getTime(),
    })
    const messages: StoredInterviewMessage[] = [
      ...storedMessages,
      userMessage,
      ...(turn.correction
        ? [
            {
              id: randomUUID(),
              role: "correction" as const,
              text: turn.correction,
            },
          ]
        : []),
      {
        id: randomUUID(),
        role: "assistant",
        text: turn.message,
      },
    ]
    await saveStoredSession({
      userId: input.userId,
      dailyPlanId: context.dailyPlanId,
      episodeId: input.episodeId,
      sessionToken,
      messages,
      answersCompleted: 3,
      completed: true,
      now,
    })

    return {
      message: turn.message,
      correction: turn.correction,
      reaction: null,
      queuedWord: null,
      completed: true,
      answersCompleted: 3,
      questionNumber: null,
      questionWords: [],
      sessionToken,
      messages,
      restored: false,
    }
  }

  assertQuestionState(state)
  if (!isSubstantiveInterviewAnswer(answer)) {
    const message =
      "Ответь одной короткой фразой по-английски — можно простыми словами."
    const conversation = recentConversation([
      ...state.conversation,
      { role: "user" as const, content: answer },
      { role: "assistant" as const, content: message },
    ])
    const sessionToken = signInterviewState({
      ...state,
      conversation,
      issuedAt: now.getTime(),
    })
    const messages: StoredInterviewMessage[] = [
      ...storedMessages,
      userMessage,
      {
        id: randomUUID(),
        role: "assistant",
        text: message,
      },
    ]
    await saveStoredSession({
      userId: input.userId,
      dailyPlanId: context.dailyPlanId,
      episodeId: input.episodeId,
      sessionToken,
      messages,
      answersCompleted: state.answersCompleted,
      completed: false,
      now,
    })

    return {
      message,
      correction: null,
      reaction: null,
      queuedWord: null,
      completed: false,
      answersCompleted: state.answersCompleted,
      questionNumber: state.answersCompleted + 1,
      questionWords: [],
      sessionToken,
      messages,
      restored: false,
    }
  }
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
    questionKind: currentQuestion.kind,
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
      planId: context.dailyPlanId,
      episodeId: input.episodeId,
      type: "retell",
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

  const questionWords = completed
    ? []
    : publicQuestionWords(state.questions[answersCompleted])
  const sessionToken = signInterviewState({
    ...state,
    mode: completed ? "continuation" : "interview",
    answersCompleted,
    conversation: recentConversation(nextConversation),
    issuedAt: now.getTime(),
  })
  const messages: StoredInterviewMessage[] = [
    ...storedMessages,
    userMessage,
    ...(turn.correction
      ? [
          {
            id: randomUUID(),
            role: "correction" as const,
            text: turn.correction,
          },
        ]
      : []),
    ...(turn.reaction
      ? [
          {
            id: randomUUID(),
            role: "assistant" as const,
            text: turn.reaction,
          },
        ]
      : []),
    {
      id: randomUUID(),
      role: "assistant",
      text: message,
      ...(questionWords.length > 0
        ? { questionWords, helpToken: sessionToken }
        : {}),
    },
  ]
  await saveStoredSession({
    userId: input.userId,
    dailyPlanId: context.dailyPlanId,
    episodeId: input.episodeId,
    sessionToken,
    messages,
    answersCompleted,
    completed,
    now,
  })

  return {
    message,
    correction: turn.correction,
    reaction: turn.reaction,
    queuedWord,
    completed,
    answersCompleted,
    questionNumber: completed ? null : answersCompleted + 1,
    questionWords,
    sessionToken,
    messages,
    restored: false,
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
