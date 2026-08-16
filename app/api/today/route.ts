import { after } from "next/server"

import { requireUserId } from "@/server/auth/user-context"
import { ensureDailyCatalogRecommendations } from "@/server/catalog/daily-recommendations"
import { jsonError } from "@/server/shared/http"
import { getToday } from "@/server/today/get-today"

export async function GET(request: Request) {
  try {
    const userId = await requireUserId(request)
    const data = await getToday(userId)
    after(async () => {
      await ensureDailyCatalogRecommendations({
        userId,
        planId: data.plan.id,
        planDate: data.planDate,
        episodeId: data.episode.id,
      }).catch(() => undefined)
    })
    return Response.json({ data })
  } catch (error) {
    return jsonError(error)
  }
}
