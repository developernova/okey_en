import { and, eq, isNotNull, isNull, lte, or } from "drizzle-orm"

import { getDb } from "@/db"
import {
  authRateLimitBuckets,
  authSessions,
  authTokens,
  qrAuthChallenges,
  telegramAuthAttempts,
} from "@/db/schema"

export const TELEGRAM_CALLBACK_STALE_AFTER_MS = 5 * 60 * 1_000

export async function cleanupExpiredAuthRecords(now = new Date()) {
  const staleCallbackBefore = new Date(
    now.getTime() - TELEGRAM_CALLBACK_STALE_AFTER_MS
  )

  return getDb().transaction(async (tx) => {
    const deletedAttempts = await tx
      .delete(telegramAuthAttempts)
      .where(
        or(
          isNotNull(telegramAuthAttempts.consumedAt),
          and(
            isNotNull(telegramAuthAttempts.callbackCompletedAt),
            or(
              isNull(telegramAuthAttempts.handoffExpiresAt),
              lte(telegramAuthAttempts.handoffExpiresAt, now)
            )
          ),
          and(
            isNull(telegramAuthAttempts.callbackStartedAt),
            lte(telegramAuthAttempts.expiresAt, now)
          ),
          and(
            isNotNull(telegramAuthAttempts.callbackStartedAt),
            isNull(telegramAuthAttempts.callbackCompletedAt),
            lte(telegramAuthAttempts.expiresAt, now),
            lte(telegramAuthAttempts.callbackStartedAt, staleCallbackBefore)
          )
        )
      )
      .returning({ id: telegramAuthAttempts.id })

    const deletedAccessTokens = await tx
      .delete(authTokens)
      .where(and(eq(authTokens.kind, "access"), lte(authTokens.expiresAt, now)))
      .returning({ tokenHash: authTokens.tokenHash })

    const deletedQrChallenges = await tx
      .delete(qrAuthChallenges)
      .where(
        or(
          isNotNull(qrAuthChallenges.consumedAt),
          lte(qrAuthChallenges.expiresAt, now)
        )
      )
      .returning({ id: qrAuthChallenges.id })

    // Deleting only absolutely expired sessions deliberately retains consumed
    // refresh-token hashes for the full session lifetime. The FK cascade then
    // removes all tokens together once reuse detection is no longer needed.
    const deletedSessions = await tx
      .delete(authSessions)
      .where(lte(authSessions.absoluteExpiresAt, now))
      .returning({ id: authSessions.id })

    const deletedRateLimitBuckets = await tx
      .delete(authRateLimitBuckets)
      .where(lte(authRateLimitBuckets.windowExpiresAt, now))
      .returning({ key: authRateLimitBuckets.key })

    return {
      attempts: deletedAttempts.length,
      qrChallenges: deletedQrChallenges.length,
      accessTokens: deletedAccessTokens.length,
      sessions: deletedSessions.length,
      rateLimitBuckets: deletedRateLimitBuckets.length,
    }
  })
}
