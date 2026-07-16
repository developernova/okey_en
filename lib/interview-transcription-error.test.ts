import { describe, expect, it } from "vitest"

import {
  InterviewTranscriptionRequestError,
  isEmptyInterviewTranscriptionError,
} from "@/lib/interview-transcription-error"

describe("interview transcription errors", () => {
  it("classifies an empty transcription by API code", () => {
    expect(
      isEmptyInterviewTranscriptionError(
        new InterviewTranscriptionRequestError(
          "Empty transcription",
          400,
          "EMPTY_TRANSCRIPTION"
        )
      )
    ).toBe(true)
  })

  it("classifies the transcription endpoint's 422 response as empty", () => {
    expect(
      isEmptyInterviewTranscriptionError(
        new InterviewTranscriptionRequestError("Empty transcription", 422)
      )
    ).toBe(true)
  })

  it.each([400, 401, 408, 429, 500, 502, 503])(
    "keeps a %s failure retryable",
    (status) => {
      expect(
        isEmptyInterviewTranscriptionError(
          new InterviewTranscriptionRequestError(
            "Transcription unavailable",
            status,
            "TRANSCRIPTION_UNAVAILABLE"
          )
        )
      ).toBe(false)
    }
  )

  it("does not classify unrelated exceptions as empty recordings", () => {
    expect(
      isEmptyInterviewTranscriptionError(new TypeError("Failed to fetch"))
    ).toBe(false)
  })
})
