import { describe, expect, it } from "vitest"

import {
  findQuestionGloss,
  interviewQuestionSchema,
  questionWords,
} from "./question"

describe("interview question glossary", () => {
  const question = {
    kind: "factual" as const,
    text: "What chores did they do?",
    glossary: [
      { word: "What", lemma: "what", translationRu: "какие" },
      { word: "chores", lemma: "chore", translationRu: "домашние дела" },
      { word: "did", lemma: "do", translationRu: "вспомогательный глагол" },
      { word: "they", lemma: "they", translationRu: "они" },
      { word: "do", lemma: "do", translationRu: "делать" },
    ],
  }

  it("requires every word to be tappable", () => {
    expect(interviewQuestionSchema.parse(question)).toEqual(question)
    expect(() =>
      interviewQuestionSchema.parse({
        ...question,
        glossary: question.glossary.filter((item) => item.word !== "chores"),
      })
    ).toThrow("Every English word")
  })

  it("finds a contextual translation case-insensitively", () => {
    expect(findQuestionGloss(question, "CHORES")?.translationRu).toBe(
      "домашние дела"
    )
    expect(questionWords(question.text)).toEqual([
      "What",
      "chores",
      "did",
      "they",
      "do",
    ])
  })

  it("normalizes harmless JSON-mode field aliases", () => {
    const parsed = interviewQuestionSchema.parse({
      question: "What happened?",
      glossary: [
        { word: "What", lemma: "what", translation: "что" },
        { word: "happened", lemma: "happen", russian: "произошло" },
      ],
    })
    expect(parsed.kind).toBe("factual")
    expect(parsed.text).toBe("What happened?")
    expect(parsed.glossary[0]?.translationRu).toBe("что")
  })
})
