import { createProgram } from "@/server/admin/catalog-service"
import { createProgramSchema } from "@/server/admin/catalog-schemas"
import { requireAdmin } from "@/server/auth/user-context"
import { jsonError } from "@/server/shared/http"

export async function POST(request: Request) {
  try {
    requireAdmin(request)
    const input = createProgramSchema.parse(await request.json())
    return Response.json({ data: await createProgram(input) }, { status: 201 })
  } catch (error) {
    return jsonError(error)
  }
}
