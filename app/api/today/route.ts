import { requireUserId } from "@/server/auth/user-context"
import { jsonError } from "@/server/shared/http"
import { getToday } from "@/server/today/get-today"

export async function GET(request: Request) {
  try {
    const userId = await requireUserId(request)
    return Response.json({ data: await getToday(userId) })
  } catch (error) {
    return jsonError(error)
  }
}
