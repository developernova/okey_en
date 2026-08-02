import { and, eq, gt, isNotNull, isNull, lt } from "drizzle-orm"

import { getDb } from "@/db"
import {
  authSessions,
  authTokens,
  telegramAuthAttempts,
  users,
} from "@/db/schema"
import {
  randomBase64Url,
  secureHashEqual,
  sha256Base64Url,
  sha256Hex,
} from "@/server/auth/token-crypto"
import { consumeNativeAuthRefreshRateLimit } from "@/server/auth/native-auth-rate-limit"
import { AppError } from "@/server/shared/errors"

export const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1_000
export const REFRESH_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1_000
export const SESSION_ABSOLUTE_TTL_MS = 365 * 24 * 60 * 60 * 1_000
const SESSION_TOUCH_INTERVAL_MS = 60 * 60 * 1_000
const ACCESS_TOKEN_PREFIX = "ce_at_"
const REFRESH_TOKEN_PREFIX = "ce_rt_"

type PlacementLevel = "A1" | "A2" | "B1" | "B2"

type SafeUserRow = {
  id: string
  firstName: string | null
  lastName: string | null
  username: string | null
  photoUrl: string | null
  levelEstimate: string | null
}

function placementLevel(value: string | null): PlacementLevel | null {
  return value === "A1" || value === "A2" || value === "B1" || value === "B2"
    ? value
    : null
}

function userDto(user: SafeUserRow) {
  const level = placementLevel(user.levelEstimate)
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
    photoUrl: user.photoUrl,
    onboardingCompleted: level !== null,
    placementLevel: level,
  }
}

function generateAccessToken() {
  return `${ACCESS_TOKEN_PREFIX}${randomBase64Url()}`
}

function generateRefreshToken() {
  return `${REFRESH_TOKEN_PREFIX}${randomBase64Url()}`
}

function invalidAccessToken(code = "AUTH_TOKEN_INVALID"): never {
  throw new AppError("Invalid or expired access token", 401, code)
}

function invalidRefreshToken(code = "REFRESH_TOKEN_INVALID"): never {
  throw new AppError("Invalid or expired refresh token", 401, code)
}

export function parseBearerAuthorization(value: string) {
  const match = /^Bearer ([A-Za-z\d._~-]{1,512})$/i.exec(value)
  if (!match?.[1] || !match[1].startsWith(ACCESS_TOKEN_PREFIX)) {
    invalidAccessToken()
  }
  return match[1]
}

function parseRefreshToken(value: string) {
  if (
    value.length > 512 ||
    !value.startsWith(REFRESH_TOKEN_PREFIX) ||
    !/^ce_rt_[A-Za-z\d_-]{43}$/.test(value)
  ) {
    invalidRefreshToken()
  }
  return value
}

function safeUserSelection() {
  return {
    id: users.id,
    firstName: users.firstName,
    lastName: users.lastName,
    username: users.username,
    photoUrl: users.photoUrl,
    levelEstimate: users.levelEstimate,
  }
}

export async function resolveAccessSession(
  authorization: string,
  now = new Date()
) {
  const token = parseBearerAuthorization(authorization)
  const [session] = await getDb()
    .select({
      sessionId: authSessions.id,
      userId: authSessions.userId,
      platform: authSessions.platform,
      deviceId: authSessions.deviceId,
      deviceName: authSessions.deviceName,
      sessionCreatedAt: authSessions.createdAt,
      sessionExpiresAt: authSessions.absoluteExpiresAt,
      sessionRevokedAt: authSessions.revokedAt,
      lastSeenAt: authSessions.lastSeenAt,
      accessExpiresAt: authTokens.expiresAt,
    })
    .from(authTokens)
    .innerJoin(authSessions, eq(authTokens.sessionId, authSessions.id))
    .where(
      and(
        eq(authTokens.tokenHash, sha256Hex(token)),
        eq(authTokens.kind, "access")
      )
    )
    .limit(1)

  if (!session) invalidAccessToken()
  if (session.sessionRevokedAt) invalidAccessToken("AUTH_SESSION_REVOKED")
  if (
    session.accessExpiresAt.getTime() <= now.getTime() ||
    session.sessionExpiresAt.getTime() <= now.getTime()
  ) {
    invalidAccessToken("AUTH_TOKEN_EXPIRED")
  }

  if (
    session.lastSeenAt.getTime() <=
    now.getTime() - SESSION_TOUCH_INTERVAL_MS
  ) {
    await getDb()
      .update(authSessions)
      .set({ lastSeenAt: now })
      .where(
        and(
          eq(authSessions.id, session.sessionId),
          lt(
            authSessions.lastSeenAt,
            new Date(now.getTime() - SESSION_TOUCH_INTERVAL_MS)
          )
        )
      )
  }

  return session
}

export async function resolveBearerUserId(
  authorization: string,
  now = new Date()
) {
  return (await resolveAccessSession(authorization, now)).userId
}

function tokenExpiry(now: Date, absoluteExpiresAt: Date) {
  return {
    accessExpiresAt: new Date(
      Math.min(now.getTime() + ACCESS_TOKEN_TTL_MS, absoluteExpiresAt.getTime())
    ),
    refreshExpiresAt: new Date(
      Math.min(
        now.getTime() + REFRESH_TOKEN_TTL_MS,
        absoluteExpiresAt.getTime()
      )
    ),
  }
}

function validHandoffCode(value: string) {
  return /^[A-Za-z\d_-]{43}$/.test(value)
}

function validHandoffVerifier(value: string) {
  return /^[A-Za-z\d._~-]{43,128}$/.test(value)
}

export async function exchangeTelegramHandoff(input: {
  attemptId: string
  code: string
  handoffCodeVerifier: string
  timezone: string | null
  now?: Date
}) {
  if (
    !validHandoffCode(input.code) ||
    !validHandoffVerifier(input.handoffCodeVerifier)
  ) {
    throw new AppError(
      "Invalid or expired Telegram handoff",
      401,
      "TELEGRAM_HANDOFF_INVALID"
    )
  }

  const now = input.now ?? new Date()
  const accessToken = generateAccessToken()
  const refreshToken = generateRefreshToken()
  const absoluteExpiresAt = new Date(now.getTime() + SESSION_ABSOLUTE_TTL_MS)
  const { accessExpiresAt, refreshExpiresAt } = tokenExpiry(
    now,
    absoluteExpiresAt
  )

  const result = await getDb().transaction(async (tx) => {
    const [attempt] = await tx
      .select({
        id: telegramAuthAttempts.id,
        userId: telegramAuthAttempts.userId,
        platform: telegramAuthAttempts.platform,
        deviceId: telegramAuthAttempts.deviceId,
        deviceName: telegramAuthAttempts.deviceName,
        handoffCodeChallenge: telegramAuthAttempts.handoffCodeChallenge,
      })
      .from(telegramAuthAttempts)
      .where(
        and(
          eq(telegramAuthAttempts.id, input.attemptId),
          eq(telegramAuthAttempts.handoffCodeHash, sha256Hex(input.code)),
          gt(telegramAuthAttempts.handoffExpiresAt, now),
          isNotNull(telegramAuthAttempts.userId),
          isNotNull(telegramAuthAttempts.callbackCompletedAt),
          isNull(telegramAuthAttempts.consumedAt)
        )
      )
      .for("update")
      .limit(1)

    if (!attempt?.userId) return null
    if (
      !secureHashEqual(
        sha256Base64Url(input.handoffCodeVerifier),
        attempt.handoffCodeChallenge
      )
    ) {
      return null
    }

    await tx
      .update(telegramAuthAttempts)
      .set({ consumedAt: now })
      .where(eq(telegramAuthAttempts.id, attempt.id))

    const [session] = await tx
      .insert(authSessions)
      .values({
        userId: attempt.userId,
        platform: attempt.platform,
        deviceId: attempt.deviceId,
        deviceName: attempt.deviceName,
        absoluteExpiresAt,
        lastSeenAt: now,
        createdAt: now,
      })
      .returning({ id: authSessions.id })

    if (!session) return null

    await tx.insert(authTokens).values([
      {
        tokenHash: sha256Hex(accessToken),
        sessionId: session.id,
        kind: "access",
        expiresAt: accessExpiresAt,
        createdAt: now,
      },
      {
        tokenHash: sha256Hex(refreshToken),
        sessionId: session.id,
        kind: "refresh",
        expiresAt: refreshExpiresAt,
        createdAt: now,
      },
    ])

    if (input.timezone) {
      await tx
        .update(users)
        .set({ timezone: input.timezone, updatedAt: now })
        .where(eq(users.id, attempt.userId))
    }

    const [user] = await tx
      .select(safeUserSelection())
      .from(users)
      .where(eq(users.id, attempt.userId))
      .limit(1)
    if (!user) {
      throw new AppError("User not found", 500, "USER_RESOLUTION_FAILED")
    }

    return { sessionId: session.id, user }
  })

  if (!result) {
    throw new AppError(
      "Invalid or expired Telegram handoff",
      401,
      "TELEGRAM_HANDOFF_INVALID"
    )
  }

  return {
    sessionId: result.sessionId,
    accessToken,
    expiresAt: accessExpiresAt.toISOString(),
    refreshToken,
    refreshExpiresAt: refreshExpiresAt.toISOString(),
    user: userDto(result.user),
  }
}

export async function refreshUserSession(
  rawRefreshToken: string,
  now = new Date()
) {
  const refreshToken = parseRefreshToken(rawRefreshToken)
  const nextAccessToken = generateAccessToken()
  const nextRefreshToken = generateRefreshToken()

  const outcome = await getDb().transaction(async (tx) => {
    const [record] = await tx
      .select({
        tokenExpiresAt: authTokens.expiresAt,
        consumedAt: authTokens.consumedAt,
        sessionId: authSessions.id,
        userId: authSessions.userId,
        absoluteExpiresAt: authSessions.absoluteExpiresAt,
        revokedAt: authSessions.revokedAt,
      })
      .from(authTokens)
      .innerJoin(authSessions, eq(authTokens.sessionId, authSessions.id))
      .where(
        and(
          eq(authTokens.tokenHash, sha256Hex(refreshToken)),
          eq(authTokens.kind, "refresh")
        )
      )
      .for("update")
      .limit(1)

    if (!record) return { kind: "invalid" as const }
    if (record.consumedAt) {
      await tx
        .update(authSessions)
        .set({ revokedAt: now })
        .where(
          and(
            eq(authSessions.id, record.sessionId),
            isNull(authSessions.revokedAt)
          )
        )
      return { kind: "reused" as const }
    }
    if (
      record.revokedAt ||
      record.tokenExpiresAt.getTime() <= now.getTime() ||
      record.absoluteExpiresAt.getTime() <= now.getTime()
    ) {
      return { kind: "invalid" as const }
    }

    await consumeNativeAuthRefreshRateLimit(
      tx,
      record.userId,
      record.sessionId,
      now
    )

    const { accessExpiresAt, refreshExpiresAt } = tokenExpiry(
      now,
      record.absoluteExpiresAt
    )
    await tx
      .update(authTokens)
      .set({ consumedAt: now })
      .where(
        and(
          eq(authTokens.tokenHash, sha256Hex(refreshToken)),
          isNull(authTokens.consumedAt)
        )
      )

    await tx.insert(authTokens).values([
      {
        tokenHash: sha256Hex(nextAccessToken),
        sessionId: record.sessionId,
        kind: "access",
        expiresAt: accessExpiresAt,
        createdAt: now,
      },
      {
        tokenHash: sha256Hex(nextRefreshToken),
        sessionId: record.sessionId,
        kind: "refresh",
        expiresAt: refreshExpiresAt,
        createdAt: now,
      },
    ])
    await tx
      .update(authSessions)
      .set({ lastSeenAt: now })
      .where(eq(authSessions.id, record.sessionId))

    const [user] = await tx
      .select(safeUserSelection())
      .from(users)
      .where(eq(users.id, record.userId))
      .limit(1)
    if (!user) {
      throw new AppError("User not found", 500, "USER_RESOLUTION_FAILED")
    }

    return {
      kind: "ok" as const,
      sessionId: record.sessionId,
      accessExpiresAt,
      refreshExpiresAt,
      user,
    }
  })

  if (outcome.kind === "reused") {
    invalidRefreshToken("REFRESH_TOKEN_REUSED")
  }
  if (outcome.kind !== "ok") invalidRefreshToken()

  return {
    sessionId: outcome.sessionId,
    accessToken: nextAccessToken,
    expiresAt: outcome.accessExpiresAt.toISOString(),
    refreshToken: nextRefreshToken,
    refreshExpiresAt: outcome.refreshExpiresAt.toISOString(),
    user: userDto(outcome.user),
  }
}

export async function getCurrentUserSession(
  authorization: string,
  now = new Date()
) {
  const resolved = await resolveAccessSession(authorization, now)
  const [user] = await getDb()
    .select(safeUserSelection())
    .from(users)
    .where(eq(users.id, resolved.userId))
    .limit(1)
  if (!user) invalidAccessToken()

  return {
    session: {
      id: resolved.sessionId,
      platform: resolved.platform,
      deviceId: resolved.deviceId,
      deviceName: resolved.deviceName,
      createdAt: resolved.sessionCreatedAt.toISOString(),
      expiresAt: resolved.sessionExpiresAt.toISOString(),
    },
    user: userDto(user),
  }
}

export async function revokeCurrentUserSession(
  authorization: string,
  now = new Date()
) {
  const resolved = await resolveAccessSession(authorization, now)
  await getDb()
    .update(authSessions)
    .set({ revokedAt: now })
    .where(
      and(
        eq(authSessions.id, resolved.sessionId),
        isNull(authSessions.revokedAt)
      )
    )
}
