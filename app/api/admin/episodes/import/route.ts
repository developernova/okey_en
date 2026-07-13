import { importEpisode } from "@/server/content/import-episode"
import { importEpisodeSchema } from "@/server/content/types"
import { requireAdmin } from "@/server/auth/user-context"
import { jsonError } from "@/server/shared/http"

export async function POST(request: Request) {
  try {
    requireAdmin(request)
    const input = importEpisodeSchema.parse(await request.json())
    const result = await importEpisode(input)
    return Response.json({ data: result }, { status: 201 })
  } catch (error) {
    return jsonError(error)
  }
}
