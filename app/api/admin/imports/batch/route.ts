import { after } from "next/server"
import { z } from "zod"

import { requireAdmin } from "@/server/auth/user-context"
import {
  enqueueImportBatch,
  getImportBatch,
  startImportWorker,
} from "@/server/content/import-queue"
import { importEpisodeSchema } from "@/server/content/types"
import { jsonError } from "@/server/shared/http"

const batchSchema = z.object({
  items: z.array(importEpisodeSchema).min(1).max(5_000),
})

export async function POST(request: Request) {
  try {
    requireAdmin(request)
    const input = batchSchema.parse(await request.json())
    const queued = await enqueueImportBatch(input.items)
    after(() => startImportWorker())
    return Response.json({ data: queued }, { status: 202 })
  } catch (error) {
    return jsonError(error)
  }
}

export async function GET(request: Request) {
  try {
    requireAdmin(request)
    const batchId = z
      .uuid()
      .parse(new URL(request.url).searchParams.get("batchId"))
    const batch = await getImportBatch(batchId)
    after(() => startImportWorker())
    return Response.json({ data: batch })
  } catch (error) {
    return jsonError(error)
  }
}
