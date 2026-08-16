import { eq } from "drizzle-orm"
import { z } from "zod"

import { getDb } from "@/db"
import { users } from "@/db/schema"
import { requireUserId } from "@/server/auth/user-context"
import {
  enrichCatalog,
  fetchCatalogPage,
  normalizedLearnerLevel,
  uniqueCatalogItems,
} from "@/server/catalog/catalog"
import { getDailyCatalogRecommendations } from "@/server/catalog/daily-recommendations"
import { dateInTimezone } from "@/server/interview/rate-limit"
import { jsonError } from "@/server/shared/http"

const querySchema = z.object({
  query: z.string().trim().max(100).optional().default(""),
  page: z.coerce.number().int().min(1).max(20).optional().default(1),
})

export async function GET(request: Request) {
  try {
    const userId = await requireUserId(request)
    const [learner] = await getDb()
      .select({
        levelEstimate: users.levelEstimate,
        timezone: users.timezone,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
    const learnerLevel = normalizedLearnerLevel(learner?.levelEstimate ?? null)
    const url = new URL(request.url)
    const { query, page } = querySchema.parse({
      query: url.searchParams.get("query") ?? "",
      page: url.searchParams.get("page") ?? "1",
    })
    const catalog = await fetchCatalogPage({ query, page })
    let items = await enrichCatalog(catalog.items, learnerLevel)

    if (!query && page === 1 && learner) {
      const planDate = dateInTimezone(new Date(), learner.timezone)
      const daily = await getDailyCatalogRecommendations(userId, planDate)
      if (daily) {
        items = uniqueCatalogItems([...daily.items, ...items])
      }
    }

    return Response.json({
      data: items,
      source: "tmdb_ai",
      learnerLevel,
      page,
      hasMore: catalog.hasMore,
    })
  } catch (error) {
    return jsonError(error)
  }
}
