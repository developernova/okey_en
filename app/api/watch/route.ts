import { and, asc, eq } from "drizzle-orm"

import { getDb } from "@/db"
import { episodes, programs } from "@/db/schema"
import { requireUserId } from "@/server/auth/user-context"
import { jsonError } from "@/server/shared/http"

export async function GET(request: Request) {
  try {
    await requireUserId(request)
    const data = await getDb()
      .select({
        id: episodes.id,
        youtubeId: episodes.youtubeId,
        title: episodes.title,
        durationSeconds: episodes.durationSeconds,
        programTitle: programs.title,
        levelMin: programs.levelMin,
        levelMax: programs.levelMax,
      })
      .from(episodes)
      .innerJoin(programs, eq(programs.id, episodes.programId))
      .where(
        and(
          eq(episodes.isActive, true),
          eq(episodes.ingestionStatus, "ready"),
          eq(programs.isActive, true)
        )
      )
      .orderBy(asc(programs.title), asc(episodes.sequenceNumber))

    return Response.json({ data })
  } catch (error) {
    return jsonError(error)
  }
}
