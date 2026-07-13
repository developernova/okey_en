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
  describeOpenRouterError,
  isOpenRouterInvalidArgument,
} from "@/server/content/openrouter-error"

const openRouterResponseSchema = z.object({
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
    })
    .optional(),
})

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

async function extractChunk(input: {
  segments: TranscriptSegment[]
  requestedCount: number
}) {
  const config = env()
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
      model: config.OPENROUTER_MODEL,
      temperature: 0.2,
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
      provider: { require_parameters: true },
    })

  let response: Response | undefined
  let lastError: unknown
  let strictSchema = true

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": config.OPENROUTER_APP_URL,
          "X-OpenRouter-Title": config.OPENROUTER_APP_NAME,
          "X-OpenRouter-Metadata": "enabled",
        },
        body: requestBody(strictSchema),
        signal: AbortSignal.timeout(180_000),
      })

      if (response.ok) break
      const details = await response.text()
      if (
        strictSchema &&
        isOpenRouterInvalidArgument(response.status, details)
      ) {
        strictSchema = false
        lastError = new Error(
          "OpenRouter provider rejected the strict JSON schema; retrying in JSON mode"
        )
        continue
      }
      if (response.status < 500 && response.status !== 429) {
        throw new AppError(
          describeOpenRouterError(response.status, details),
          502,
          "OPENROUTER_ERROR",
          details
        )
      }
      lastError = new Error(
        `OpenRouter temporary error ${response.status}: ${details}`
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
    throw new AppError(
      "OpenRouter did not complete after retries",
      502,
      "OPENROUTER_RETRY_EXHAUSTED",
      lastError instanceof Error ? lastError.message : undefined
    )
  }

  const completion = openRouterResponseSchema.parse(await response.json())
  const content = completion.choices[0]?.message.content
  if (!content) {
    throw new AppError(
      "OpenRouter returned no content",
      502,
      "EMPTY_LLM_RESPONSE"
    )
  }

  return extractionResponseSchema.parse(JSON.parse(content)).phrases
}

export async function extractPhrases(input: {
  segments: TranscriptSegment[]
  maxPhrases: number
}): Promise<ExtractedPhrase[]> {
  const chunks = chunkTranscript(input.segments)
  const perChunk = Math.max(3, Math.ceil(input.maxPhrases / chunks.length) + 1)
  const results: ExtractedPhrase[][] = []
  for (const segments of chunks) {
    results.push(
      await extractChunk({
        segments,
        requestedCount: perChunk,
      })
    )
  }

  const transcriptText = normalizePhrase(
    input.segments.map((segment) => segment.text).join(" ")
  )
  const segmentByIndex = new Map(
    input.segments.map((segment) => [segment.index, segment])
  )
  const unique = new Map<string, ExtractedPhrase>()

  for (const candidate of results.flat()) {
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

  return [...unique.values()]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, input.maxPhrases)
}
