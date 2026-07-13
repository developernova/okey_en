export class AppError extends Error {
  constructor(
    message: string,
    readonly status = 500,
    readonly code = "INTERNAL_ERROR",
    readonly details?: unknown
  ) {
    super(message)
    this.name = "AppError"
  }
}

export function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error"
}
