import { z } from "zod"

import { requireUserId } from "@/server/auth/user-context"
import { snapshotDailyReturnGap } from "@/server/daily-plan/daily-plan-service"
import { jsonError } from "@/server/shared/http"
import { reviewCard } from "@/server/srs/review-card"

const reviewRequestSchema = z.object({
  cardId: z.uuid(),
  rating: z.enum(["again", "hard", "good"]),
  eventId: z.uuid(),
  answeredAt: z.string().datetime({ offset: true }),
})

export async function POST(request: Request) {
  try {
    const userId = await requireUserId(request)
    const input = reviewRequestSchema.parse(await request.json())
    const serverNow = new Date()
    const answeredAt = new Date(input.answeredAt)
    const oldestAccepted = serverNow.getTime() - 30 * 24 * 60 * 60 * 1000
    const newestAccepted = serverNow.getTime() + 5 * 60 * 1000
    const reviewTime =
      answeredAt.getTime() >= oldestAccepted &&
      answeredAt.getTime() <= newestAccepted
        ? answeredAt
        : serverNow
    // Offline reviews can replay before the client loads /api/today. Freeze the
    // return-day gap on today's plan before reviewCard updates lastActiveAt.
    await snapshotDailyReturnGap(userId, serverNow)
    const result = await reviewCard({
      userId,
      cardId: input.cardId,
      rating: input.rating,
      clientEventId: input.eventId,
      now: reviewTime,
      activityAt: serverNow,
    })
    return Response.json({ data: result })
  } catch (error) {
    return jsonError(error)
  }
}
