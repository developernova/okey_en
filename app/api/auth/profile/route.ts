import { authJsonError, privateNoStore } from "@/server/auth/auth-http"
import { requireUserId } from "@/server/auth/user-context"
import { getUserProfile } from "@/server/auth/user-profile"

export async function GET(request: Request) {
  try {
    const userId = await requireUserId(request)
    return privateNoStore(
      Response.json({ data: { user: await getUserProfile(userId) } })
    )
  } catch (error) {
    return privateNoStore(authJsonError(error))
  }
}
