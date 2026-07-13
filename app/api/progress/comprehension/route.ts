import { z } from "zod"

import { requireUserId } from "@/server/auth/user-context"
import { calculateComprehension } from "@/server/progress/comprehension"
import { jsonError } from "@/server/shared/http"

const querySchema = z.object({ episodeId: z.uuid() })

export async function GET(request: Request) {
  try {
    const userId = await requireUserId(request)
    const url = new URL(request.url)
    const query = querySchema.parse({
      episodeId: url.searchParams.get("episodeId"),
    })
    const result = await calculateComprehension({ userId, ...query })
    return Response.json({ data: result })
  } catch (error) {
    return jsonError(error)
  }
}
