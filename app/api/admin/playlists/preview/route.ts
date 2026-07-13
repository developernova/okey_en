import { inArray } from "drizzle-orm"
import { z } from "zod"

import { getDb } from "@/db"
import { episodes } from "@/db/schema"
import { requireAdmin } from "@/server/auth/user-context"
import { getYoutubePlaylist } from "@/server/content/youtube-playlist"
import { jsonError } from "@/server/shared/http"

const requestSchema = z.object({
  playlistUrl: z.string().min(10).max(500),
})

export async function POST(request: Request) {
  try {
    requireAdmin(request)
    const input = requestSchema.parse(await request.json())
    const playlist = await getYoutubePlaylist(input.playlistUrl)
    const videoIds = playlist.items.map((item) => item.videoId)
    const imported =
      videoIds.length > 0
        ? await getDb()
            .select({ youtubeId: episodes.youtubeId })
            .from(episodes)
            .where(inArray(episodes.youtubeId, videoIds))
        : []
    const importedIds = new Set(imported.map((item) => item.youtubeId))
    return Response.json({
      data: {
        ...playlist,
        items: playlist.items.map((item) => ({
          ...item,
          alreadyImported: importedIds.has(item.videoId),
        })),
      },
    })
  } catch (error) {
    return jsonError(error)
  }
}
