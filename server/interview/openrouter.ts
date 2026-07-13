import { z } from "zod"

import { env } from "@/server/config/env"
import {
  buildFactualReactionMessages,
  buildLanguageCorrectionMessages,
  buildQuestionPlanMessages,
  type InterviewPromptMessage,
} from "@/server/interview/prompt"
import { AppError } from "@/server/shared/errors"

const questionPlanSchema = z
  .object({ questions: z.array(z.string().min(1).max(300)).length(3) })
  .refine(
    ({ questions }) =>
      new Set(questions.map((question) => question.trim().toLowerCase()))
        .size === 3,
    "Questions must be distinct"
  )

const languageCorrectionSchema = z.object({
  correction: z.string().min(1).max(500).nullable(),
})

const factualReactionSchema = z.object({
  reaction: z.string().min(1).max(500).nullable(),
})

const completionSchema = z.object({
  choices: z.array(
    z.object({
      finish_reason: z.string().nullable().optional(),
      message: z.object({ content: z.string().nullable() }),
    })
  ),
})

const questionPlanJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    questions: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: { type: "string", minLength: 1, maxLength: 300 },
    },
  },
  required: ["questions"],
} as const

const languageCorrectionJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    correction: {
      anyOf: [
        { type: "string", minLength: 1, maxLength: 500 },
        { type: "null" },
      ],
    },
  },
  required: ["correction"],
} as const

const factualReactionJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    reaction: {
      anyOf: [
        { type: "string", minLength: 1, maxLength: 500 },
        { type: "null" },
      ],
    },
  },
  required: ["reaction"],
} as const

async function requestStructured<T>(input: {
  episodeId: string
  messages: InterviewPromptMessage[]
  schemaName: string
  jsonSchema: object
  responseSchema: z.ZodType<T>
  maxTokens: number
}) {
  const config = env()
  const body = JSON.stringify({
    model: config.OPENROUTER_INTERVIEW_MODEL,
    session_id: `okey-english-episode-${input.episodeId}-${input.schemaName}`,
    temperature: 0.25,
    max_tokens: input.maxTokens,
    messages: input.messages,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: input.schemaName,
        strict: true,
        schema: input.jsonSchema,
      },
    },
    provider: { require_parameters: true },
  })

  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": config.OPENROUTER_APP_URL,
            "X-OpenRouter-Title": config.OPENROUTER_APP_NAME,
          },
          body,
          signal: AbortSignal.timeout(60_000),
        }
      )
      if (response.ok) {
        const parsedCompletion = completionSchema.safeParse(
          await response.json()
        )
        const choice = parsedCompletion.success
          ? parsedCompletion.data.choices[0]
          : undefined
        const content = choice?.message.content
        if (content) {
          try {
            return input.responseSchema.parse(JSON.parse(content))
          } catch (error) {
            lastError = error
          }
        } else {
          lastError = new Error(
            `OpenRouter returned empty content (${choice?.finish_reason ?? "unknown"})`
          )
        }
      } else {
        const details = await response.text()
        if (response.status < 500 && response.status !== 429) {
          throw new AppError(
            `OpenRouter request failed with ${response.status}`,
            502,
            "OPENROUTER_INTERVIEW_ERROR",
            details
          )
        }
        lastError = new Error(`OpenRouter temporary error ${response.status}`)
      }
    } catch (error) {
      if (error instanceof AppError) throw error
      lastError = error
    }
  }

  throw new AppError(
    "Интервью сейчас недоступно. Попробуй ещё раз.",
    502,
    "OPENROUTER_INTERVIEW_UNAVAILABLE",
    lastError instanceof Error ? lastError.message : undefined
  )
}

export function generateInterviewQuestions(input: {
  episodeId: string
  transcript: string
}) {
  return requestStructured({
    episodeId: input.episodeId,
    messages: buildQuestionPlanMessages(input.transcript),
    schemaName: "video_interview_questions",
    jsonSchema: questionPlanJsonSchema,
    responseSchema: questionPlanSchema,
    maxTokens: 320,
  })
}

export function generateInterviewAnalysis(input: {
  episodeId: string
  transcript: string
  question: string
  answer: string
  answersCompleted: number
}) {
  const correction = requestStructured({
    episodeId: input.episodeId,
    messages: buildLanguageCorrectionMessages(input),
    schemaName: "video_interview_language_correction",
    jsonSchema: languageCorrectionJsonSchema,
    responseSchema: languageCorrectionSchema,
    maxTokens: 180,
  })
  const reaction = requestStructured({
    episodeId: input.episodeId,
    messages: buildFactualReactionMessages(input),
    schemaName: "video_interview_factual_reaction",
    jsonSchema: factualReactionJsonSchema,
    responseSchema: factualReactionSchema,
    maxTokens: 140,
  }).catch(() => ({ reaction: null }))

  return Promise.all([correction, reaction]).then(([language, factual]) => ({
    correction: language.correction,
    reaction: factual.reaction,
    closing:
      input.answersCompleted === 3
        ? "Спасибо за ответы! Было интересно поговорить."
        : null,
  }))
}
