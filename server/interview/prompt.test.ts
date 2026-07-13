import { describe, expect, it } from "vitest"

import {
  buildFactualReactionMessages,
  buildLanguageCorrectionMessages,
  buildQuestionPlanMessages,
  factualReactionSystemPrompt,
  languageCorrectionSystemPrompt,
} from "@/server/interview/prompt"

describe("interview prompts", () => {
  it("isolates language correction from factual reference content", () => {
    const messages = buildLanguageCorrectionMessages({
      question: "What do they need for the smoothie?",
      answer: "They need to use milk and banana.",
    })
    const content = messages.map((message) => message.content).join("\n")

    expect(content).toContain("milk and banana")
    expect(content).not.toContain("REFERENCE VIDEO TRANSCRIPT")
    expect(languageCorrectionSystemPrompt).toContain("Judge LANGUAGE only")
    expect(languageCorrectionSystemPrompt).toContain(
      "Never add, remove, negate, or replace factual claims"
    )
  })

  it("allows one A2 countability correction without a list", () => {
    expect(languageCorrectionSystemPrompt).toContain(
      "single most useful, highest-impact"
    )
    expect(languageCorrectionSystemPrompt).toContain(
      "exactly one teaching point"
    )
    expect(languageCorrectionSystemPrompt).toContain("milk and a banana")
    expect(languageCorrectionSystemPrompt).toContain(
      "weather is may be sunny or rain"
    )
  })

  it("routes transcript-aware facts only through a reaction prompt", () => {
    const messages = buildFactualReactionMessages({
      transcript: "They make a smoothie with milk and strawberries.",
      question: "What do they need for the smoothie?",
      answer: "They need milk and a banana.",
    })
    const content = messages.map((message) => message.content).join("\n")

    expect(content).toContain("REFERENCE VIDEO TRANSCRIPT")
    expect(factualReactionSystemPrompt).toContain(
      "never teach or correct English"
    )
    expect(factualReactionSystemPrompt).toContain(
      "Usually return reaction=null"
    )
  })

  it("plans exactly three questions from the transcript", () => {
    const messages = buildQuestionPlanMessages("The family made dinner.", {
      level: "A2",
      knownVocabulary: ["family", "make", "dinner"],
    })
    expect(messages[1]?.content).toContain("The family made dinner")
    expect(messages[1]?.content).toContain("family, make, dinner")
    expect(messages.at(-1)?.content).toContain(
      "Plan three distinct content questions"
    )
    expect(messages[0]?.content).toContain("must not test unseen vocabulary")
    expect(messages[0]?.content).toContain("every English word")
  })

  it("detects only explicit unknown-word statements", () => {
    expect(languageCorrectionSystemPrompt).toContain("unknownWord")
    expect(languageCorrectionSystemPrompt).toContain(
      "directly says they do not know"
    )
    expect(languageCorrectionSystemPrompt).toContain("I don't know this word")
  })
})
