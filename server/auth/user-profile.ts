import { eq } from "drizzle-orm"

import { getDb } from "@/db"
import { users } from "@/db/schema"
import { AppError } from "@/server/shared/errors"

export async function getUserProfile(userId: string) {
  const [user] = await getDb()
    .select({
      onboardingCompleted: users.onboardingCompleted,
      levelEstimate: users.levelEstimate,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (!user) {
    throw new AppError("User not found", 404, "USER_NOT_FOUND")
  }

  return {
    onboardingCompleted:
      user.onboardingCompleted || user.levelEstimate !== null,
    placementLevel: user.levelEstimate,
  }
}
