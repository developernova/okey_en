import { describe, expect, it } from "vitest"

import {
  importRetryDelayMs,
  MAX_IMPORT_ATTEMPTS,
  retryableImportError,
  shouldRetryImport,
} from "./import-episode"
import {
  availableImportInputs,
  shouldStopImportDrain,
  uniqueImportInputs,
} from "./import-queue"
import {
  addImportLlmUsage,
  estimateOpenAiCostUsd,
  limitExtractionChunks,
  phraseExtractionMaxTokens,
  RetryableOpenAiError,
} from "./openai"
import { RetryableYoutubeTranscriptError } from "./youtube-transcript"

describe("content import safety", () => {
  it("deduplicates repeated videos before enqueueing", () => {
    const input = {
      youtubeUrl: "https://youtube.com/watch?v=dQw4w9WgXcQ",
      title: "Episode",
      program: {
        slug: "test-program",
        title: "Test program",
        levelMin: "A1" as const,
        levelMax: "B1" as const,
      },
      sequenceNumber: 1,
      transcriptLanguage: "en",
      maxPhrases: 15,
    }
    const unique = uniqueImportInputs([
      input,
      { ...input, title: "Duplicate", sequenceNumber: 2 },
    ])

    expect(unique.size).toBe(1)
    expect(unique.get("dQw4w9WgXcQ")).toMatchObject({
      position: 0,
      input: { title: "Episode" },
    })
    expect(
      availableImportInputs(unique, new Set(["dQw4w9WgXcQ"]))
    ).toHaveLength(0)
  })

  it("retries transient failures only within the bounded attempt policy", () => {
    const transient = new RetryableYoutubeTranscriptError("temporary", {
      cause: new Error("429"),
      queueBlocking: true,
    })

    expect(shouldRetryImport(transient, 1, true)).toBe(true)
    expect(shouldRetryImport(transient, MAX_IMPORT_ATTEMPTS, true)).toBe(false)
    expect(shouldRetryImport(transient, 1, false)).toBe(false)
    expect(shouldRetryImport(new Error("permanent"), 1, true)).toBe(false)
    expect(shouldStopImportDrain(transient)).toBe(true)
    expect(
      shouldStopImportDrain(
        new RetryableYoutubeTranscriptError("network", {
          cause: new Error("reset"),
          queueBlocking: false,
        })
      )
    ).toBe(false)

    const providerFailure = new RetryableOpenAiError("temporary", {
      cause: new Error("429"),
    })
    expect(retryableImportError(providerFailure)).toBe(providerFailure)
    expect(shouldRetryImport(providerFailure, 1, true)).toBe(true)
    expect(shouldStopImportDrain(providerFailure)).toBe(true)
  })

  it("uses bounded completion token limits", () => {
    expect(phraseExtractionMaxTokens(1)).toBe(400)
    expect(phraseExtractionMaxTokens(15)).toBe(2_640)
    expect(phraseExtractionMaxTokens(100)).toBe(4_000)
  })

  it("estimates the standard gpt-5.4-mini price including cached input", () => {
    expect(
      estimateOpenAiCostUsd({
        model: "gpt-5.4-mini-2026-03-17",
        promptTokens: 1_000,
        cachedPromptTokens: 400,
        completionTokens: 100,
      })
    ).toBeCloseTo(0.00093)
    expect(
      estimateOpenAiCostUsd({
        model: "custom-model",
        promptTokens: 1_000,
        completionTokens: 100,
      })
    ).toBe(0)
  })

  it("bounds transcript chunks while retaining whole-episode coverage", () => {
    const chunks = Array.from({ length: 20 }, (_, index) => index)

    expect(limitExtractionChunks(chunks)).toHaveLength(8)
    expect(limitExtractionChunks(chunks)[0]).toBe(0)
    expect(limitExtractionChunks(chunks).at(-1)).toBe(19)
  })

  it("accumulates token usage and cost across chunks", () => {
    expect(
      addImportLlmUsage(
        {
          promptTokens: 100,
          completionTokens: 20,
          totalTokens: 120,
          costUsd: 0.001,
        },
        {
          promptTokens: 200,
          completionTokens: 30,
          totalTokens: 230,
          costUsd: 0.002,
        }
      )
    ).toEqual({
      promptTokens: 300,
      completionTokens: 50,
      totalTokens: 350,
      costUsd: 0.003,
    })
  })

  it("backs off much longer after a queue-blocking response", () => {
    expect(importRetryDelayMs(1, false, () => 0.5)).toBe(30_000)
    expect(importRetryDelayMs(2, false, () => 0.5)).toBe(60_000)
    expect(importRetryDelayMs(1, true, () => 0.5)).toBe(600_000)
  })
})
