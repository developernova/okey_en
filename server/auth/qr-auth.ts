import { and, eq, gt, isNull } from "drizzle-orm"

import { getDb } from "@/db"
import { qrAuthChallenges } from "@/db/schema"
import { consumeNativeAuthStartRateLimit } from "@/server/auth/native-auth-rate-limit"
import { randomBase64Url, sha256Hex } from "@/server/auth/token-crypto"
import { AppError } from "@/server/shared/errors"

export const QR_AUTH_TTL_MS = 3 * 60 * 1_000

const qrTokenPattern = /^[A-Za-z\d_-]{43}$/

export function validQrAuthToken(value: string) {
  return qrTokenPattern.test(value)
}

export async function createQrAuthChallenge(
  desktopDeviceId: string,
  now = new Date()
) {
  const publicToken = randomBase64Url()
  const desktopVerifier = randomBase64Url()
  const expiresAt = new Date(now.getTime() + QR_AUTH_TTL_MS)

  const [challenge] = await getDb().transaction(async (tx) => {
    await consumeNativeAuthStartRateLimit(tx, desktopDeviceId, now)
    return tx
      .insert(qrAuthChallenges)
      .values({
        publicTokenHash: sha256Hex(publicToken),
        desktopVerifierHash: sha256Hex(desktopVerifier),
        desktopDeviceId,
        expiresAt,
        createdAt: now,
      })
      .returning({ id: qrAuthChallenges.id })
  })

  if (!challenge) {
    throw new AppError(
      "Could not create QR login",
      500,
      "QR_AUTH_CREATION_FAILED"
    )
  }

  return {
    id: challenge.id,
    publicToken,
    desktopVerifier,
    expiresAt,
  }
}

export async function approveQrAuthChallenge(
  publicToken: string,
  userId: string,
  now = new Date()
) {
  if (!validQrAuthToken(publicToken)) {
    throw new AppError("Invalid QR login", 404, "QR_AUTH_INVALID")
  }

  return getDb().transaction(async (tx) => {
    const [challenge] = await tx
      .select({
        id: qrAuthChallenges.id,
        userId: qrAuthChallenges.userId,
        approvedAt: qrAuthChallenges.approvedAt,
      })
      .from(qrAuthChallenges)
      .where(
        and(
          eq(qrAuthChallenges.publicTokenHash, sha256Hex(publicToken)),
          gt(qrAuthChallenges.expiresAt, now),
          isNull(qrAuthChallenges.consumedAt)
        )
      )
      .for("update")
      .limit(1)

    if (!challenge) {
      throw new AppError("QR login expired", 410, "QR_AUTH_EXPIRED")
    }

    if (challenge.approvedAt) {
      if (challenge.userId === userId) return { approved: true as const }
      throw new AppError("QR login is already used", 409, "QR_AUTH_USED")
    }

    await tx
      .update(qrAuthChallenges)
      .set({ userId, approvedAt: now })
      .where(
        and(
          eq(qrAuthChallenges.id, challenge.id),
          isNull(qrAuthChallenges.approvedAt),
          isNull(qrAuthChallenges.consumedAt)
        )
      )

    return { approved: true as const }
  })
}
