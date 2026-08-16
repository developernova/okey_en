import {
  completeDailyPlanItem,
  getOrCreateDailyPlan,
} from "@/server/daily-plan/daily-plan-service"
import { calculateComprehension } from "@/server/progress/comprehension"
import { buildDailyQueue } from "@/server/srs/daily-queue"
import {
  getAssignedReviewProgress,
  getOrCreateReviewAssignment,
  noCardsReviewCompletionMetadata,
  reviewCompletionFromMetadata,
  reviewStepState,
} from "@/server/today/review-step"

export async function getToday(
  userId: string,
  options: { autoCompleteEmptyReview?: boolean } = {}
) {
  let plan = await getOrCreateDailyPlan(userId)
  const [baseQueue, comprehension] = await Promise.all([
    buildDailyQueue({
      userId,
      episodeId: plan.episodeId,
      returnGapDays: plan.returnGapDays,
    }),
    calculateComprehension({ userId, episodeId: plan.episodeId }),
  ])
  const persistReviewState = options.autoCompleteEmptyReview !== false
  const assignment = await getOrCreateReviewAssignment({
    dailyPlanId: plan.planId,
    candidateCards: baseQueue.cards,
    persist: persistReviewState,
  })
  const progress = await getAssignedReviewProgress({
    userId,
    dailyPlanId: plan.planId,
    assignedCardIds: assignment.assignedCardIds,
  })
  let completionState = reviewCompletionFromMetadata(assignment.metadata)

  if (
    persistReviewState &&
    progress.remainingCards.length === 0 &&
    !plan.completedItems.includes("review")
  ) {
    const noUserReviews = progress.reviewedCount === 0
    const completion = await completeDailyPlanItem({
      userId,
      planId: plan.planId,
      episodeId: plan.episodeId,
      type: "review",
      ...(noUserReviews
        ? { completionMetadata: noCardsReviewCompletionMetadata }
        : {}),
    })
    completionState = {
      skippedForNoCards: noUserReviews,
      reviewedCount: progress.reviewedCount,
    }
    plan = {
      ...plan,
      status: completion.status,
      completedItems: completion.completedItems,
      completedAt:
        completion.status === "complete" ? new Date() : plan.completedAt,
    }
  }
  const reviewStep = reviewStepState({
    completed: plan.completedItems.includes("review"),
    skippedForNoCards:
      completionState.skippedForNoCards ||
      (!plan.completedItems.includes("review") && progress.assignedCount === 0),
    assignedCount: progress.assignedCount,
    reviewedCount: Math.max(
      progress.reviewedCount,
      completionState.reviewedCount
    ),
  })
  const queueCards = plan.completedItems.includes("review")
    ? []
    : progress.remainingCards
  const shownReviews = queueCards.filter((card) => card.reps > 0).length
  const planCalendarDate = new Date(`${plan.planDate}T00:00:00.000Z`)

  return {
    planDate: plan.planDate,
    date: new Intl.DateTimeFormat("ru-RU", {
      timeZone: "UTC",
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(planCalendarDate),
    plan: {
      id: plan.planId,
      status: plan.status,
      completedItems: plan.completedItems,
      completedAt: plan.completedAt,
    },
    episode: {
      id: plan.episodeId,
      youtubeId: plan.youtubeId,
      title: plan.episodeTitle,
      programTitle: plan.programTitle,
      sequenceNumber: plan.sequenceNumber,
      durationMinutes: Math.max(1, Math.ceil(plan.durationSeconds / 60)),
      youtubeUrl: `https://www.youtube.com/watch?v=${plan.youtubeId}`,
    },
    comprehension: {
      percentage: comprehension.percentage,
      isReady: comprehension.isReady,
      isEstimated: comprehension.isEstimated,
      knownLexemeCount: comprehension.knownLexemeCount,
      languageFit: comprehension.languageFit,
    },
    queue: {
      ...baseQueue,
      cards: queueCards,
      shownReviews,
      estimatedMinutes:
        queueCards.length === 0
          ? 0
          : Math.max(1, Math.ceil(queueCards.length * 0.4)),
      reviewStep,
    },
  }
}
