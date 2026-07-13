import { listAdminCatalog } from "@/server/admin/catalog-service"
import { requireAdmin } from "@/server/auth/user-context"
import { jsonError } from "@/server/shared/http"

export async function GET(request: Request) {
  try {
    requireAdmin(request)
    return Response.json({ data: await listAdminCatalog() })
  } catch (error) {
    return jsonError(error)
  }
}
