export function dailyQueuePolicy(returnGapDays: number) {
  const gapDays = Number.isFinite(returnGapDays)
    ? Math.max(0, Math.floor(returnGapDays))
    : 0
  const isReturnDay = gapDays >= 2

  return {
    gapDays,
    isReturnDay,
    reviewLimit: isReturnDay ? 25 : 100,
    mode: isReturnDay
      ? gapDays >= 14
        ? ("soft_restart" as const)
        : ("return" as const)
      : ("normal" as const),
  }
}

export function dailyNewCardLimit(input: {
  isReturnDay: boolean
  pauseNewCards: boolean
  reviewLimit: number
  shownReviews: number
}) {
  if (input.isReturnDay) {
    return Math.min(5, Math.max(0, input.reviewLimit - input.shownReviews))
  }
  return input.pauseNewCards ? 5 : 15
}
