import { z } from "zod"

export const questionGlossSchema = z.preprocess(
  (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return value
    const item = value as Record<string, unknown>
    return {
      ...item,
      translationRu:
        item.translationRu ??
        item.translation ??
        item.russian ??
        item.translation_ru,
    }
  },
  z.object({
    word: z.string().min(1).max(60),
    lemma: z.string().min(1).max(60),
    translationRu: z.string().min(1).max(160),
  })
)

export const interviewQuestionSchema = z.preprocess(
  (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return value
    const item = value as Record<string, unknown>
    return {
      ...item,
      text: item.text ?? item.question,
      kind: item.kind ?? "factual",
    }
  },
  z
    .object({
      kind: z.enum(["factual", "retell", "transfer"]),
      text: z.string().min(1).max(300),
      glossary: z.array(questionGlossSchema).min(1).max(40),
    })
    .refine(({ text, glossary }) => {
      const glossed = new Set(
        glossary.map(({ word }) => normalizeQuestionWord(word))
      )
      return questionWords(text).every((word) =>
        glossed.has(normalizeQuestionWord(word))
      )
    }, "Every English word in the question must have a glossary entry")
)

export type InterviewQuestion = z.infer<typeof interviewQuestionSchema>
export type QuestionGloss = z.infer<typeof questionGlossSchema>

export function normalizeQuestionWord(value: string) {
  return value
    .toLocaleLowerCase("en")
    .replace(/[’]/g, "'")
    .replace(/[^a-z'-]/g, "")
}

export function questionWords(text: string) {
  return text.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) ?? []
}

export function findQuestionGloss(question: InterviewQuestion, word: string) {
  const normalized = normalizeQuestionWord(word)
  return question.glossary.find(
    (item) => normalizeQuestionWord(item.word) === normalized
  )
}
