import { z } from "zod"

import { updateProgram } from "@/server/admin/catalog-service"
import { updateProgramSchema } from "@/server/admin/catalog-schemas"
import { requireAdmin } from "@/server/auth/user-context"
import { jsonError } from "@/server/shared/http"

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    requireAdmin(request)
    const { id } = await context.params
    const programId = z.uuid().parse(id)
    const input = updateProgramSchema.parse(await request.json())
    return Response.json({ data: await updateProgram(programId, input) })
  } catch (error) {
    return jsonError(error)
  }
}
