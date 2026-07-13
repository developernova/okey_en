import { z } from "zod"

import { CEFR_LEVELS } from "@/server/content/cefr"

export const transcriptSegmentSchema = z.object({
  index: z.number().int().nonnegative(),
  text: z.string().min(1),
  normalizedText: z.string().min(1),
  offsetMs: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
})

export type TranscriptSegment = z.infer<typeof transcriptSegmentSchema>

export const extractedPhraseSchema = z.object({
  phrase: z.string().min(2).max(120),
  lemma: z.string().min(1).max(120),
  translationRu: z.string().min(1).max(240),
  contextSentence: z.string().min(2).max(500),
  cefr: z.enum(CEFR_LEVELS),
  segmentIndex: z.number().int().nonnegative(),
  confidence: z.number().min(0).max(1),
  rationale: z.string().min(1).max(300),
})

export const extractionResponseSchema = z.object({
  phrases: z.array(extractedPhraseSchema).max(30),
})

export type ExtractedPhrase = z.infer<typeof extractedPhraseSchema>

export const importEpisodeSchema = z.object({
  youtubeUrl: z.string().min(6),
  title: z.string().min(2).max(200),
  program: z.object({
    slug: z.string().regex(/^[a-z0-9-]+$/),
    title: z.string().min(2).max(120),
    description: z.string().max(500).optional(),
    levelMin: z.enum(CEFR_LEVELS).default("A1"),
    levelMax: z.enum(CEFR_LEVELS).default("C2"),
  }),
  sequenceNumber: z.number().int().positive(),
  durationSeconds: z.number().int().positive().optional(),
  transcriptLanguage: z.string().min(2).max(10).default("en"),
  maxPhrases: z.number().int().min(5).max(30).default(15),
})

export type ImportEpisodeInput = z.infer<typeof importEpisodeSchema>
