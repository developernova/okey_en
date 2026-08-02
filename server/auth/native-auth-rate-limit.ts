import { lte, lt, or, sql } from "drizzle-orm"

import type { Database } from "@/db"
import { authRateLimitBuckets } from "@/db/schema"
import { sha256Hex } from "@/server/auth/token-crypto"
import { AppError } from "@/server/shared/errors"

type DatabaseTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0]

export const NATIVE_AUTH_DEVICE_START_LIMIT = 6
export const NATIVE_AUTH_DEVICE_WINDOW_MS = 10 * 60 * 1_000
export const NATIVE_AUTH_GLOBAL_START_LIMIT = 300
export const NATIVE_AUTH_GLOBAL_WINDOW_MS = 60 * 1_000
export const NATIVE_AUTH_SESSION_REFRESH_LIMIT = 120
export const NATIVE_AUTH_USER_REFRESH_LIMIT = 300
export const NATIVE_AUTH_REFRESH_WINDOW_MS = 24 * 60 * 60 * 1_000

const GLOBAL_BUCKET_KEY = "native-auth-start:global"

function deviceBucketKey(deviceId: string) {
  return `native-auth-start:device:${sha256Hex(deviceId)}`
}

function refreshUserBucketKey(userId: string) {
  return `native-auth-refresh:user:${sha256Hex(userId)}`
}

function refreshSessionBucketKey(sessionId: string) {
  return `native-auth-refresh:session:${sha256Hex(sessionId)}`
}

function rateLimited(input: {
  code: "NATIVE_AUTH_RATE_LIMITED" | "NATIVE_AUTH_REFRESH_RATE_LIMITED"
  message: string
  retryAfterMs: number
}): never {
  throw new AppError(input.message, 429, input.code, {
    retryAfterSeconds: Math.ceil(input.retryAfterMs / 1_000),
  })
}

export function nativeAuthFixedWindowSqlValues(now: Date, expiresAt: Date) {
  // Raw Drizzle SQL fragments bypass the timestamp column serializer. Passing
  // Date objects here reaches postgres-js unchanged in the standalone bundle,
  // where wire serialization expects strings or buffers.
  const nowSql = now.toISOString()
  const expiresAtSql = expiresAt.toISOString()

  return {
    requestCount: sql`case when ${authRateLimitBuckets.windowExpiresAt} <= ${nowSql} then 1 else ${authRateLimitBuckets.requestCount} + 1 end`,
    windowStartedAt: sql`case when ${authRateLimitBuckets.windowExpiresAt} <= ${nowSql} then ${nowSql} else ${authRateLimitBuckets.windowStartedAt} end`,
    windowExpiresAt: sql`case when ${authRateLimitBuckets.windowExpiresAt} <= ${nowSql} then ${expiresAtSql} else ${authRateLimitBuckets.windowExpiresAt} end`,
  }
}

async function claimFixedWindow(
  tx: DatabaseTransaction,
  input: {
    key: string
    limit: number
    windowMs: number
    now: Date
    rateLimitCode:
      "NATIVE_AUTH_RATE_LIMITED" | "NATIVE_AUTH_REFRESH_RATE_LIMITED"
    rateLimitMessage: string
  }
) {
  const nextWindowExpiresAt = new Date(input.now.getTime() + input.windowMs)
  const fixedWindowSqlValues = nativeAuthFixedWindowSqlValues(
    input.now,
    nextWindowExpiresAt
  )
  const [claimed] = await tx
    .insert(authRateLimitBuckets)
    .values({
      key: input.key,
      requestCount: 1,
      windowStartedAt: input.now,
      windowExpiresAt: nextWindowExpiresAt,
      updatedAt: input.now,
    })
    .onConflictDoUpdate({
      target: authRateLimitBuckets.key,
      set: {
        ...fixedWindowSqlValues,
        updatedAt: input.now,
      },
      setWhere: or(
        lte(authRateLimitBuckets.windowExpiresAt, input.now),
        lt(authRateLimitBuckets.requestCount, input.limit)
      ),
    })
    .returning({ requestCount: authRateLimitBuckets.requestCount })

  if (!claimed) {
    rateLimited({
      code: input.rateLimitCode,
      message: input.rateLimitMessage,
      retryAfterMs: input.windowMs,
    })
  }
}

export async function consumeNativeAuthStartRateLimit(
  tx: DatabaseTransaction,
  deviceId: string,
  now: Date
) {
  // Every transaction locks buckets in the same order. A later device-level
  // rejection rolls the global increment back with the surrounding attempt
  // transaction, and consistent ordering prevents cross-device deadlocks.
  await claimFixedWindow(tx, {
    key: GLOBAL_BUCKET_KEY,
    limit: NATIVE_AUTH_GLOBAL_START_LIMIT,
    windowMs: NATIVE_AUTH_GLOBAL_WINDOW_MS,
    now,
    rateLimitCode: "NATIVE_AUTH_RATE_LIMITED",
    rateLimitMessage: "Too many Telegram login attempts. Try again later.",
  })
  await claimFixedWindow(tx, {
    key: deviceBucketKey(deviceId),
    limit: NATIVE_AUTH_DEVICE_START_LIMIT,
    windowMs: NATIVE_AUTH_DEVICE_WINDOW_MS,
    now,
    rateLimitCode: "NATIVE_AUTH_RATE_LIMITED",
    rateLimitMessage: "Too many Telegram login attempts. Try again later.",
  })
}

export async function consumeNativeAuthRefreshRateLimit(
  tx: DatabaseTransaction,
  userId: string,
  sessionId: string,
  now: Date
) {
  const rateLimitMessage = "Too many session refreshes. Try again later."
  // All refresh transactions use user → session ordering, so simultaneous
  // refreshes from several Apple devices serialize without lock inversion.
  await claimFixedWindow(tx, {
    key: refreshUserBucketKey(userId),
    limit: NATIVE_AUTH_USER_REFRESH_LIMIT,
    windowMs: NATIVE_AUTH_REFRESH_WINDOW_MS,
    now,
    rateLimitCode: "NATIVE_AUTH_REFRESH_RATE_LIMITED",
    rateLimitMessage,
  })
  await claimFixedWindow(tx, {
    key: refreshSessionBucketKey(sessionId),
    limit: NATIVE_AUTH_SESSION_REFRESH_LIMIT,
    windowMs: NATIVE_AUTH_REFRESH_WINDOW_MS,
    now,
    rateLimitCode: "NATIVE_AUTH_REFRESH_RATE_LIMITED",
    rateLimitMessage,
  })
}
