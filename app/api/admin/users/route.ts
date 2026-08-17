import { listAdminUsers } from "@/server/admin/user-service"
import { requireAdmin } from "@/server/auth/user-context"
import { jsonError } from "@/server/shared/http"

export async function GET(request: Request) {
  try {
    requireAdmin(request)
    return Response.json({ data: await listAdminUsers() })
  } catch (error) {
    return jsonError(error)
  }
}
