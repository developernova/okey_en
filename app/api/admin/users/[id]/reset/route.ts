import { z } from "zod"

import { resetAdminUser } from "@/server/admin/user-service"
import { requireAdmin } from "@/server/auth/user-context"
import { jsonError } from "@/server/shared/http"

const resetSchema = z.object({ confirmation: z.literal("СБРОСИТЬ") })

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    requireAdmin(request)
    const { id } = await context.params
    const userId = z.uuid().parse(id)
    resetSchema.parse(await request.json())
    return Response.json({ data: await resetAdminUser(userId) })
  } catch (error) {
    return jsonError(error)
  }
}
