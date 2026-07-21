import { z } from "zod"

import { env } from "@/server/config/env"
import {
  buildContinuationMessages,
  buildFactualReactionMessages,
  buildLanguageCorrectionMessages,
  buildQuestionPlanMessages,
  type InterviewPromptMessage,
} from "@/server/interview/prompt"
import { interviewQuestionSchema } from "@/server/interview/question"
import {
  describeOpenAiError,
  isOpenAiSchemaUnsupported,
} from "@/server/content/openai-error"
import { AppError } from "@/server/shared/errors"

const questionPlanSchema = z.preprocess(
  (value) => (Array.isArray(value) ? { questions: value } : value),
  z
    .object({ questions: z.array(interviewQuestionSchema).length(3) })
    .refine(
      ({ questions }) =>
        questions[0]?.kind === "factual" &&
        questions[1]?.kind === "retell" &&
        questions[2]?.kind === "transfer",
      "Questions must be factual, retell, and transfer in that order"
    )
    .refine(
      ({ questions }) =>
        new Set(questions.map((question) => question.text.trim().toLowerCase()))
          .size === 3,
      "Questions must be distinct"
    )
)

const languageCorrectionSchema = z.object({
  correction: z.string().min(1).max(500).nullable(),
  unknownWord: z.string().min(1).max(60).nullable(),
})

const factualReactionSchema = z.object({
  reaction: z.string().min(1).max(500).nullable(),
})

const continuationTurnSchema = z.object({
  correction: z.string().min(1).max(500).nullable(),
  message: z.string().min(1).max(500),
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
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          kind: {
            type: "string",
            enum: ["factual", "retell", "transfer"],
          },
          text: { type: "string", minLength: 1, maxLength: 300 },
          glossary: {
            type: "array",
            minItems: 1,
            maxItems: 40,
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                word: { type: "string", minLength: 1, maxLength: 60 },
                lemma: { type: "string", minLength: 1, maxLength: 60 },
                translationRu: {
                  type: "string",
                  minLength: 1,
                  maxLength: 160,
                },
              },
              required: ["word", "lemma", "translationRu"],
            },
          },
        },
        required: ["kind", "text", "glossary"],
      },
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
    unknownWord: {
      anyOf: [
        { type: "string", minLength: 1, maxLength: 60 },
        { type: "null" },
      ],
    },
  },
  required: ["correction", "unknownWord"],
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

const continuationTurnJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    correction: {
      anyOf: [
        { type: "string", minLength: 1, maxLength: 500 },
        { type: "null" },
      ],
    },
    message: { type: "string", minLength: 1, maxLength: 500 },
  },
  required: ["correction", "message"],
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
  let repairInstruction: string | undefined
  const body = (strictSchema: boolean) =>
    JSON.stringify({
      model: config.OPENAI_TEXT_MODEL,
      reasoning_effort: "none",
      max_completion_tokens: input.maxTokens,
      messages: repairInstruction
        ? [
            ...input.messages,
            {
              role: "system",
              content: repairInstruction,
            },
          ]
        : input.messages,
      response_format: strictSchema
        ? {
            type: "json_schema",
            json_schema: {
              name: input.schemaName,
              strict: true,
              schema: input.jsonSchema,
            },
          }
        : { type: "json_object" },
    })

  let lastError: unknown
  let strictSchema = true
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: body(strictSchema),
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
            const details =
              error instanceof z.ZodError
                ? JSON.stringify(error.issues)
                : error instanceof Error
                  ? error.message
                  : "Invalid JSON response"
            repairInstruction = `REPAIR THE PREVIOUS RESPONSE. It failed validation: ${details.slice(0, 1_500)}. Return a complete corrected JSON object. Do not omit required array items or fields.`
          }
        } else {
          lastError = new Error(
            `OpenAI returned empty content (${choice?.finish_reason ?? "unknown"})`
          )
        }
      } else {
        const details = await response.text()
        if (
          strictSchema &&
          isOpenAiSchemaUnsupported(response.status, details)
        ) {
          strictSchema = false
          lastError = new Error(
            "The selected OpenAI model rejected the strict JSON schema; retrying in JSON mode"
          )
          continue
        }
        if (response.status < 500 && response.status !== 429) {
          throw new AppError(
            describeOpenAiError(response.status, details),
            502,
            "OPENAI_INTERVIEW_ERROR",
            details
          )
        }
        lastError = new Error(`OpenAI temporary error ${response.status}`)
      }
    } catch (error) {
      if (error instanceof AppError) throw error
      lastError = error
    }
  }

  throw new AppError(
    "Интервью сейчас недоступно. Попробуй ещё раз.",
    502,
    "OPENAI_INTERVIEW_UNAVAILABLE",
    lastError instanceof Error ? lastError.message : undefined
  )
}

export function generateInterviewQuestions(input: {
  episodeId: string
  transcript: string
  learnerLevel: string
  knownVocabulary: string[]
}) {
  return requestStructured({
    episodeId: input.episodeId,
    messages: buildQuestionPlanMessages(input.transcript, {
      level: input.learnerLevel,
      knownVocabulary: input.knownVocabulary,
    }),
    schemaName: "video_interview_questions",
    jsonSchema: questionPlanJsonSchema,
    responseSchema: questionPlanSchema,
    maxTokens: 1_400,
  })
}

export function generateInterviewAnalysis(input: {
  episodeId: string
  transcript: string
  question: string
  questionKind: "factual" | "retell" | "transfer"
  answer: string
}) {
  const correction = requestStructured({
    episodeId: input.episodeId,
    messages: buildLanguageCorrectionMessages(input),
    schemaName: "video_interview_language_correction",
    jsonSchema: languageCorrectionJsonSchema,
    responseSchema: languageCorrectionSchema,
    maxTokens: 180,
  })
  const reaction =
    input.questionKind === "transfer"
      ? Promise.resolve({ reaction: null })
      : requestStructured({
          episodeId: input.episodeId,
          messages: buildFactualReactionMessages(input),
          schemaName: "video_interview_factual_reaction",
          jsonSchema: factualReactionJsonSchema,
          responseSchema: factualReactionSchema,
          maxTokens: 140,
        }).catch(() => ({ reaction: null }))

  return Promise.all([correction, reaction]).then(([language, factual]) => ({
    correction: language.correction,
    unknownWord: language.unknownWord,
    reaction: factual.reaction,
  }))
}

export function generateContinuationTurn(input: {
  episodeId: string
  transcript: string
  learnerLevel: string
  knownVocabulary: string[]
  conversation: Array<{ role: "assistant" | "user"; content: string }>
}) {
  return requestStructured({
    episodeId: input.episodeId,
    messages: buildContinuationMessages({
      transcript: input.transcript,
      level: input.learnerLevel,
      knownVocabulary: input.knownVocabulary,
      conversation: input.conversation,
    }),
    schemaName: "video_interview_continuation",
    jsonSchema: continuationTurnJsonSchema,
    responseSchema: continuationTurnSchema,
    maxTokens: 220,
  })
}
