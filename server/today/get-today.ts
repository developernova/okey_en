import {
  completeDailyPlanItem,
  getOrCreateDailyPlan,
} from "@/server/daily-plan/daily-plan-service"
import { calculateComprehension } from "@/server/progress/comprehension"
import { buildDailyQueue } from "@/server/srs/daily-queue"

export async function getToday(
  userId: string,
  options: { autoCompleteEmptyReview?: boolean } = {}
) {
  let plan = await getOrCreateDailyPlan(userId)
  const [queue, comprehension] = await Promise.all([
    buildDailyQueue({
      userId,
      episodeId: plan.episodeId,
      returnGapDays: plan.returnGapDays,
    }),
    calculateComprehension({ userId, episodeId: plan.episodeId }),
  ])

  if (
    options.autoCompleteEmptyReview !== false &&
    queue.cards.length === 0 &&
    !plan.completedItems.includes("review")
  ) {
    const completion = await completeDailyPlanItem({
      userId,
      episodeId: plan.episodeId,
      type: "review",
    })
    plan = {
      ...plan,
      status: completion.status,
      completedItems: completion.completedItems,
      completedAt:
        completion.status === "complete" ? new Date() : plan.completedAt,
    }
  }

  return {
    date: new Intl.DateTimeFormat("ru-RU", {
      timeZone: plan.timezone,
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(new Date()),
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
      isReady: comprehension.knownLexemeCount >= 50,
      knownLexemeCount: comprehension.knownLexemeCount,
    },
    queue,
  }
}
