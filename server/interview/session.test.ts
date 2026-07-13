import { describe, expect, it } from "vitest"

import {
  signInterviewState,
  verifyInterviewState,
} from "@/server/interview/session"

const secret = "test-secret-that-is-long-enough"
const state = {
  version: 2 as const,
  userId: "11111111-1111-4111-8111-111111111111",
  episodeId: "22222222-2222-4222-8222-222222222222",
  requestDate: "2026-07-13",
  answersCompleted: 1,
  questions: [
    {
      text: "What did the family make?",
      glossary: [
        { word: "What", lemma: "what", translationRu: "что" },
        { word: "did", lemma: "do", translationRu: "вспомогательный глагол" },
        { word: "the", lemma: "the", translationRu: "определённый артикль" },
        { word: "family", lemma: "family", translationRu: "семья" },
        { word: "make", lemma: "make", translationRu: "готовить" },
      ],
    },
    {
      text: "Who helped with dinner?",
      glossary: [
        { word: "Who", lemma: "who", translationRu: "кто" },
        { word: "helped", lemma: "help", translationRu: "помог" },
        { word: "with", lemma: "with", translationRu: "с" },
        { word: "dinner", lemma: "dinner", translationRu: "ужин" },
      ],
    },
    {
      text: "What happened after dinner?",
      glossary: [
        { word: "What", lemma: "what", translationRu: "что" },
        { word: "happened", lemma: "happen", translationRu: "произошло" },
        { word: "after", lemma: "after", translationRu: "после" },
        { word: "dinner", lemma: "dinner", translationRu: "ужин" },
      ],
    },
  ],
  conversation: [
    { role: "assistant" as const, content: "What did the family eat?" },
    { role: "user" as const, content: "They ate pizza." },
  ],
  issuedAt: 1_784_000_000_000,
}

describe("interview session token", () => {
  it("round-trips a signed state", () => {
    const token = signInterviewState(state, secret)
    expect(verifyInterviewState(token, secret)).toEqual(state)
  })

  it("rejects a modified token", () => {
    const token = signInterviewState(state, secret)
    expect(() => verifyInterviewState(`${token}x`, secret)).toThrow(
      "Invalid interview session"
    )
  })
})
