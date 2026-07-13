import { z } from "zod"

import {
  deleteEpisodePermanently,
  getAdminEpisodeDetail,
  updateEpisode,
} from "@/server/admin/catalog-service"
import { updateEpisodeSchema } from "@/server/admin/catalog-schemas"
import { requireAdmin } from "@/server/auth/user-context"
import { jsonError } from "@/server/shared/http"

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    requireAdmin(request)
    const { id } = await context.params
    return Response.json({
      data: await getAdminEpisodeDetail(z.uuid().parse(id)),
    })
  } catch (error) {
    return jsonError(error)
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    requireAdmin(request)
    const { id } = await context.params
    const episodeId = z.uuid().parse(id)
    const input = updateEpisodeSchema.parse(await request.json())
    return Response.json({ data: await updateEpisode(episodeId, input) })
  } catch (error) {
    return jsonError(error)
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    requireAdmin(request)
    const { id } = await context.params
    return Response.json({
      data: await deleteEpisodePermanently(z.uuid().parse(id)),
    })
  } catch (error) {
    return jsonError(error)
  }
}
