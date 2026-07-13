import { after } from "next/server"

import { listAdminCatalog } from "@/server/admin/catalog-service"
import { requireAdmin } from "@/server/auth/user-context"
import { startImportWorker } from "@/server/content/import-queue"
import { jsonError } from "@/server/shared/http"

export async function GET(request: Request) {
  try {
    requireAdmin(request)
    const catalog = await listAdminCatalog()
    after(() => startImportWorker())
    return Response.json({ data: catalog })
  } catch (error) {
    return jsonError(error)
  }
}
