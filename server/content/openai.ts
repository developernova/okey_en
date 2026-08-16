import { z } from "zod"

import { env } from "@/server/config/env"
import { CEFR_LEVELS } from "@/server/content/cefr"
import {
  extractionResponseSchema,
  type ExtractedPhrase,
  type TranscriptSegment,
} from "@/server/content/types"
import { normalizePhrase } from "@/server/content/text"
import { AppError } from "@/server/shared/errors"
import {
  describeOpenAiError,
  isOpenAiSchemaUnsupported,
} from "@/server/content/openai-error"

const openAiResponseSchema = z.object({
  id: z.string(),
  model: z.string(),
  choices: z.array(
    z.object({
      message: z.object({ content: z.string() }),
      finish_reason: z.string().nullable().optional(),
    })
  ),
  usage: z
    .object({
      prompt_tokens: z.number().optional(),
      completion_tokens: z.number().optional(),
      total_tokens: z.number().optional(),
      prompt_tokens_details: z
        .object({ cached_tokens: z.number().nonnegative().optional() })
        .optional(),
    })
    .optional(),
})

export type ImportLlmUsage = {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  costUsd: number
}

export const EMPTY_IMPORT_LLM_USAGE: ImportLlmUsage = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  costUsd: 0,
}

export const MAX_EXTRACTION_CHUNKS = 8

export class RetryableOpenAiError extends AppError {
  readonly queueBlocking = true

  constructor(message: string, options: { cause: unknown }) {
    super(
      message,
      502,
      "OPENAI_RETRY_EXHAUSTED",
      options.cause instanceof Error ? options.cause.message : options.cause
    )
    this.name = "RetryableOpenAiError"
    this.cause = options.cause
  }
}

export function isRetryableOpenAiError(
  error: unknown
): error is RetryableOpenAiError {
  return error instanceof RetryableOpenAiError
}

export function addImportLlmUsage(
  left: ImportLlmUsage,
  right: ImportLlmUsage
): ImportLlmUsage {
  return {
    promptTokens: left.promptTokens + right.promptTokens,
    completionTokens: left.completionTokens + right.completionTokens,
    totalTokens: left.totalTokens + right.totalTokens,
    costUsd: left.costUsd + right.costUsd,
  }
}

export function phraseExtractionMaxTokens(requestedCount: number) {
  return Math.min(4_000, 240 + Math.max(1, requestedCount) * 160)
}

export function estimateOpenAiCostUsd(input: {
  model: string
  promptTokens: number
  cachedPromptTokens?: number
  completionTokens: number
}) {
  if (!/^gpt-5\.4-mini(?:-|$)/.test(input.model)) return 0

  const cachedPromptTokens = Math.min(
    input.promptTokens,
    Math.max(0, input.cachedPromptTokens ?? 0)
  )
  const uncachedPromptTokens = input.promptTokens - cachedPromptTokens
  return (
    (uncachedPromptTokens * 0.75 +
      cachedPromptTokens * 0.075 +
      input.completionTokens * 4.5) /
    1_000_000
  )
}

const phraseJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    phrases: {
      type: "array",
      maxItems: 30,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          phrase: {
            type: "string",
            description: "Exact English phrase from transcript",
          },
          lemma: {
            type: "string",
            description: "Dictionary form of the target lexical item",
          },
          translationRu: {
            type: "string",
            description: "Natural Russian translation in this context",
          },
          contextSentence: {
            type: "string",
            description: "Exact transcript sentence containing the phrase",
          },
          cefr: { type: "string", enum: CEFR_LEVELS },
          segmentIndex: { type: "integer", minimum: 0 },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          rationale: {
            type: "string",
            description: "Short reason this phrase is useful",
          },
        },
        required: [
          "phrase",
          "lemma",
          "translationRu",
          "contextSentence",
          "cefr",
          "segmentIndex",
          "confidence",
          "rationale",
        ],
      },
    },
  },
  required: ["phrases"],
} as const

const promotionalPatterns = [
  /subscribe/,
  /youtube channel/,
  /videos? like this/,
  /like and share/,
  /hit the bell/,
  /follow us/,
]

function chunkTranscript(
  segments: TranscriptSegment[],
  maxCharacters = 16_000
) {
  const chunks: TranscriptSegment[][] = []
  let current: TranscriptSegment[] = []
  let size = 0

  for (const segment of segments) {
    const lineSize = segment.text.length + 30
    if (current.length > 0 && size + lineSize > maxCharacters) {
      chunks.push(current)
      current = []
      size = 0
    }
    current.push(segment)
    size += lineSize
  }

  if (current.length > 0) chunks.push(current)
  return chunks
}

export function limitExtractionChunks<T>(
  chunks: T[],
  maxChunks = MAX_EXTRACTION_CHUNKS
) {
  if (chunks.length <= maxChunks) return chunks
  if (maxChunks <= 0) return []
  if (maxChunks === 1) return [chunks[0]]

  // Preserve coverage of the whole episode without allowing an unusually
  // long transcript to create an unbounded number of paid LLM requests.
  return Array.from({ length: maxChunks }, (_, index) => {
    const sourceIndex = Math.round(
      (index * (chunks.length - 1)) / (maxChunks - 1)
    )
    return chunks[sourceIndex]
  })
}

async function extractChunk(input: {
  segments: TranscriptSegment[]
  requestedCount: number
  onUsage?: (usage: ImportLlmUsage) => void | Promise<void>
}) {
  const config = env()
  if (!config.OPENAI_API_KEY) {
    throw new AppError(
      "OPENAI_API_KEY is not configured",
      503,
      "OPENAI_NOT_CONFIGURED"
    )
  }
  const transcript = input.segments
    .map((segment) => `${segment.index}|${segment.offsetMs}|${segment.text}`)
    .join("\n")

  const messages = [
    {
      role: "system",
      content:
        "You select useful English vocabulary cards from video transcripts. Never invent text. Select lexical units worth memorizing: idioms, phrasal verbs, collocations, and fixed spoken expressions. Prefer reusable chunks of 2–7 words. Exclude pure grammar frames and compositional fragments such as 'instead of doing', as well as full sentences, names, trivia, transparent cognates, calls to subscribe, or channel promotion.",
    },
    {
      role: "user",
      content: [
        `Return up to ${input.requestedCount} useful phrases.`,
        "Return one JSON object with a single phrases array. Every phrase must contain phrase, lemma, translationRu, contextSentence, cefr, segmentIndex, confidence, and rationale.",
        "Determine the CEFR level of every phrase independently from A1 to C2. Do not force phrases into a requested level range.",
        "Each phrase and context must appear verbatim in the transcript.",
        "Never select promotional calls to subscribe, like, share, follow, or watch more videos.",
        "Avoid near-duplicates and prefer variety across scenes and meanings. Do not fill the list with several phrases teaching the same idea from one short passage.",
        "Confidence is your combined confidence that the item is a reusable lexical unit, is grounded verbatim in the transcript, and has an accurate translation and CEFR label. It is not confidence about transcript existence alone.",
        "Use the supplied segment index. Translate naturally into Russian.",
        "Transcript lines have format segmentIndex|offsetMs|text:",
        transcript,
      ].join("\n\n"),
    },
  ]

  const requestBody = (strictSchema: boolean) =>
    JSON.stringify({
      model: config.OPENAI_TEXT_MODEL,
      reasoning_effort: "none",
      max_completion_tokens: phraseExtractionMaxTokens(input.requestedCount),
      messages,
      response_format: strictSchema
        ? {
            type: "json_schema",
            json_schema: {
              name: "episode_phrases",
              strict: true,
              schema: phraseJsonSchema,
            },
          }
        : { type: "json_object" },
    })

  let response: Response | undefined
  let lastError: unknown
  let strictSchema = true

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: requestBody(strictSchema),
        signal: AbortSignal.timeout(180_000),
      })

      if (response.ok) break
      const details = await response.text()
      if (strictSchema && isOpenAiSchemaUnsupported(response.status, details)) {
        strictSchema = false
        lastError = new Error(
          "The selected OpenAI model rejected the strict JSON schema; retrying in JSON mode"
        )
        continue
      }
      const retryableStatus =
        response.status === 408 ||
        response.status === 425 ||
        response.status === 429 ||
        response.status >= 500
      if (!retryableStatus) {
        throw new AppError(
          describeOpenAiError(response.status, details),
          502,
          "OPENAI_ERROR",
          details
        )
      }
      lastError = new Error(
        `OpenAI temporary error ${response.status}: ${details}`
      )
    } catch (error) {
      if (error instanceof AppError) throw error
      lastError = error
    }

    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 1_000 * 2 ** attempt))
    }
  }

  if (!response?.ok) {
    throw new RetryableOpenAiError("OpenAI did not complete after retries", {
      cause: lastError,
    })
  }

  const completion = openAiResponseSchema.parse(await response.json())
  const reportedUsage = completion.usage
  const promptTokens = reportedUsage?.prompt_tokens ?? 0
  const completionTokens = reportedUsage?.completion_tokens ?? 0
  const usage = {
    promptTokens,
    completionTokens,
    totalTokens: reportedUsage?.total_tokens ?? promptTokens + completionTokens,
    costUsd: estimateOpenAiCostUsd({
      model: completion.model,
      promptTokens,
      cachedPromptTokens:
        reportedUsage?.prompt_tokens_details?.cached_tokens ?? 0,
      completionTokens,
    }),
  } satisfies ImportLlmUsage
  await input.onUsage?.(usage)

  const content = completion.choices[0]?.message.content
  if (!content) {
    throw new AppError("OpenAI returned no content", 502, "EMPTY_LLM_RESPONSE")
  }

  return {
    phrases: extractionResponseSchema.parse(JSON.parse(content)).phrases,
    usage,
  }
}

export async function extractPhrases(input: {
  segments: TranscriptSegment[]
  maxPhrases: number
  onUsage?: (usage: ImportLlmUsage) => void | Promise<void>
}): Promise<{ phrases: ExtractedPhrase[]; usage: ImportLlmUsage }> {
  const chunks = limitExtractionChunks(chunkTranscript(input.segments))
  const perChunk = Math.min(
    30,
    Math.max(3, Math.ceil(input.maxPhrases / chunks.length) + 1)
  )
  const results: Awaited<ReturnType<typeof extractChunk>>[] = []
  for (const segments of chunks) {
    const result = await extractChunk({
      segments,
      requestedCount: perChunk,
      onUsage: input.onUsage,
    })
    results.push(result)
  }

  const transcriptText = normalizePhrase(
    input.segments.map((segment) => segment.text).join(" ")
  )
  const segmentByIndex = new Map(
    input.segments.map((segment) => [segment.index, segment])
  )
  const unique = new Map<string, ExtractedPhrase>()

  for (const candidate of results.flatMap((result) => result.phrases)) {
    const normalized = normalizePhrase(candidate.phrase)
    const sourceSegment = segmentByIndex.get(candidate.segmentIndex)
    if (!normalized || !sourceSegment || candidate.confidence < 0.65) continue
    if (!transcriptText.includes(normalized)) continue
    const wordCount = normalized.split(" ").length
    if (wordCount < 2 || wordCount > 7) continue
    if (promotionalPatterns.some((pattern) => pattern.test(normalized)))
      continue

    const contextCandidate = normalizePhrase(candidate.contextSentence)
    const contextIsGrounded =
      contextCandidate.includes(normalized) &&
      transcriptText.includes(contextCandidate)
    const sourcePosition = input.segments.findIndex(
      (segment) => segment.index === candidate.segmentIndex
    )
    const contextWindow = input.segments
      .slice(Math.max(0, sourcePosition - 1), sourcePosition + 2)
      .map((segment) => segment.text)
      .join(" ")

    const canonical: ExtractedPhrase = {
      ...candidate,
      phrase: candidate.phrase.trim(),
      lemma: normalizePhrase(candidate.lemma),
      contextSentence: contextIsGrounded
        ? candidate.contextSentence.trim()
        : contextWindow,
    }

    const existing = unique.get(normalized)
    if (!existing || existing.confidence < canonical.confidence) {
      unique.set(normalized, canonical)
    }
  }

  return {
    phrases: [...unique.values()]
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, input.maxPhrases),
    usage: results.reduce(
      (usage, result) => addImportLlmUsage(usage, result.usage),
      EMPTY_IMPORT_LLM_USAGE
    ),
  }
}
