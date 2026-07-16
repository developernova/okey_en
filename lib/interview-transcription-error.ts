export class InterviewTranscriptionRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message)
    this.name = "InterviewTranscriptionRequestError"
  }
}

export function isEmptyInterviewTranscriptionError(error: unknown) {
  return (
    error instanceof InterviewTranscriptionRequestError &&
    (error.status === 422 || error.code === "EMPTY_TRANSCRIPTION")
  )
}
