import { z } from "zod"
import { and, eq, gt, isNull } from "drizzle-orm"
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose"

import { getDb } from "@/db"
import { telegramAuthAttempts } from "@/db/schema"
import { resolveOidcUserId } from "@/server/auth/telegram-user"
import { consumeNativeAuthStartRateLimit } from "@/server/auth/native-auth-rate-limit"
import { env } from "@/server/config/env"
import { AppError } from "@/server/shared/errors"
import {
  randomBase64Url,
  secureHashEqual,
  sha256Base64Url,
  sha256Hex,
} from "@/server/auth/token-crypto"

const TELEGRAM_OIDC_ISSUER = "https://oauth.telegram.org"
const TELEGRAM_AUTHORIZATION_ENDPOINT = `${TELEGRAM_OIDC_ISSUER}/auth`
const TELEGRAM_TOKEN_ENDPOINT = `${TELEGRAM_OIDC_ISSUER}/token`
const TELEGRAM_JWKS_URL = `${TELEGRAM_OIDC_ISSUER}/.well-known/jwks.json`

export const TELEGRAM_AUTH_ATTEMPT_TTL_MS = 5 * 60 * 1_000
export const TELEGRAM_HANDOFF_TTL_MS = 60 * 1_000
const TELEGRAM_TOKEN_TIMEOUT_MS = 10_000
const TELEGRAM_MAX_USER_ID = BigInt(2 ** 52 - 1)

let remoteJwks: ReturnType<typeof createRemoteJWKSet> | undefined

type TelegramOidcConfig = {
  clientId: string
  clientSecret: string
  callbackUrl: string
  nativeReturnUrl: string
}

type TelegramKeyResolver = JWTVerifyGetKey

export function isNativeAuthReturnUrl(value: string) {
  try {
    const url = new URL(value)
    return (
      url.protocol === "catchenglish:" &&
      url.hostname === "auth" &&
      url.port === "" &&
      url.username === "" &&
      url.password === "" &&
      (url.pathname === "" || url.pathname === "/") &&
      url.search === "" &&
      url.hash === ""
    )
  } catch {
    return false
  }
}

const telegramIdSchema = z.union([
  z
    .number()
    .int()
    .positive()
    .max(2 ** 52 - 1),
  z.string().regex(/^\d{1,20}$/),
])

const telegramClaimsSchema = z.object({
  sub: z.string().min(1).max(255),
  nonce: z.string().min(1).max(255),
  id: telegramIdSchema,
  name: z.string().trim().min(1).max(256).optional(),
  given_name: z.string().trim().min(1).max(128).optional(),
  family_name: z.string().trim().max(128).optional(),
  preferred_username: z.string().trim().max(64).optional(),
  picture: z.url().max(2_048).optional(),
})

export type StartTelegramOidcInput = {
  platform: "ios" | "macos" | "web"
  deviceId: string
  deviceName?: string
  handoffCodeChallenge: string
}

export type ClaimedTelegramAuthAttempt = {
  id: string
  platform: "ios" | "macos" | "web"
  oidcNonceHash: string
  oidcCodeVerifier: string
}

function claimedPlatform(
  value: string
): ClaimedTelegramAuthAttempt["platform"] {
  if (value === "web" || value === "macos") return value
  return "ios"
}

function configuredTelegramOidc(): TelegramOidcConfig {
  const config = env()
  const clientId = config.TELEGRAM_OIDC_CLIENT_ID
  const clientSecret = config.TELEGRAM_OIDC_CLIENT_SECRET
  const callbackUrl = config.TELEGRAM_OIDC_CALLBACK_URL
  const nativeReturnUrl = config.NATIVE_AUTH_RETURN_URL

  if (!clientId || !clientSecret || !callbackUrl || !nativeReturnUrl) {
    throw new AppError(
      "Telegram native login is not configured",
      503,
      "TELEGRAM_OIDC_NOT_CONFIGURED"
    )
  }

  const callback = new URL(callbackUrl)
  if (process.env.NODE_ENV === "production" && callback.protocol !== "https:") {
    throw new AppError(
      "Telegram OIDC callback must use HTTPS",
      503,
      "TELEGRAM_OIDC_NOT_CONFIGURED"
    )
  }

  if (!isNativeAuthReturnUrl(nativeReturnUrl)) {
    throw new AppError(
      "Native authentication return URL is invalid",
      503,
      "TELEGRAM_OIDC_NOT_CONFIGURED"
    )
  }

  return { clientId, clientSecret, callbackUrl, nativeReturnUrl }
}

export function isS256CodeChallenge(value: string) {
  return /^[A-Za-z\d_-]{43}$/.test(value)
}

export function createS256CodeChallenge(verifier: string) {
  return sha256Base64Url(verifier)
}

export function buildTelegramAuthorizationUrl(input: {
  config: Pick<TelegramOidcConfig, "clientId" | "callbackUrl">
  state: string
  nonce: string
  oidcCodeChallenge: string
}) {
  const url = new URL(TELEGRAM_AUTHORIZATION_ENDPOINT)
  url.searchParams.set("client_id", input.config.clientId)
  url.searchParams.set("redirect_uri", input.config.callbackUrl)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("scope", "openid profile telegram:bot_access")
  url.searchParams.set("state", input.state)
  url.searchParams.set("nonce", input.nonce)
  url.searchParams.set("code_challenge", input.oidcCodeChallenge)
  url.searchParams.set("code_challenge_method", "S256")
  return url.toString()
}

export function buildNativeAuthRedirect(input: {
  nativeReturnUrl: string
  attemptId: string
  handoffCode?: string
  error?: "cancelled" | "authentication_failed"
}) {
  const url = new URL(input.nativeReturnUrl)
  url.searchParams.set("attempt_id", input.attemptId)
  if (input.handoffCode) url.searchParams.set("code", input.handoffCode)
  if (input.error) url.searchParams.set("error", input.error)
  return url.toString()
}

export async function startTelegramOidc(
  input: StartTelegramOidcInput,
  now = new Date()
) {
  if (!isS256CodeChallenge(input.handoffCodeChallenge)) {
    throw new AppError(
      "Invalid handoff code challenge",
      400,
      "INVALID_HANDOFF_CODE_CHALLENGE"
    )
  }

  const config = configuredTelegramOidc()
  const state = randomBase64Url()
  const nonce = randomBase64Url()
  const oidcCodeVerifier = randomBase64Url()
  const expiresAt = new Date(now.getTime() + TELEGRAM_AUTH_ATTEMPT_TTL_MS)

  const attempt = await getDb().transaction(async (tx) => {
    await consumeNativeAuthStartRateLimit(tx, input.deviceId, now)
    const [created] = await tx
      .insert(telegramAuthAttempts)
      .values({
        stateHash: sha256Hex(state),
        oidcNonceHash: sha256Hex(nonce),
        oidcCodeVerifier,
        handoffCodeChallenge: input.handoffCodeChallenge,
        platform: input.platform,
        deviceId: input.deviceId,
        deviceName: input.deviceName ?? null,
        expiresAt,
        createdAt: now,
      })
      .returning({ id: telegramAuthAttempts.id })
    return created
  })

  if (!attempt) {
    throw new AppError(
      "Unable to start Telegram login",
      500,
      "TELEGRAM_AUTH_START_FAILED"
    )
  }

  return {
    attemptId: attempt.id,
    authorizationUrl: buildTelegramAuthorizationUrl({
      config,
      state,
      nonce,
      oidcCodeChallenge: createS256CodeChallenge(oidcCodeVerifier),
    }),
    expiresAt: expiresAt.toISOString(),
  }
}

export async function claimTelegramOidcAttempt(
  state: string,
  now = new Date()
): Promise<ClaimedTelegramAuthAttempt> {
  if (!state || state.length > 512) {
    throw new AppError(
      "Invalid Telegram login state",
      400,
      "TELEGRAM_AUTH_STATE_INVALID"
    )
  }

  const result = await getDb().transaction(async (tx) => {
    const [attempt] = await tx
      .select({
        id: telegramAuthAttempts.id,
        platform: telegramAuthAttempts.platform,
        oidcNonceHash: telegramAuthAttempts.oidcNonceHash,
        oidcCodeVerifier: telegramAuthAttempts.oidcCodeVerifier,
      })
      .from(telegramAuthAttempts)
      .where(
        and(
          eq(telegramAuthAttempts.stateHash, sha256Hex(state)),
          gt(telegramAuthAttempts.expiresAt, now),
          isNull(telegramAuthAttempts.callbackStartedAt),
          isNull(telegramAuthAttempts.consumedAt)
        )
      )
      .for("update")
      .limit(1)

    if (!attempt?.oidcCodeVerifier) return null

    await tx
      .update(telegramAuthAttempts)
      .set({ callbackStartedAt: now })
      .where(eq(telegramAuthAttempts.id, attempt.id))

    return {
      id: attempt.id,
      platform: claimedPlatform(attempt.platform),
      oidcNonceHash: attempt.oidcNonceHash,
      oidcCodeVerifier: attempt.oidcCodeVerifier,
    }
  })

  if (!result) {
    throw new AppError(
      "Telegram login state is invalid or expired",
      400,
      "TELEGRAM_AUTH_STATE_INVALID"
    )
  }
  return result
}

function getTelegramJwks() {
  remoteJwks ??= createRemoteJWKSet(new URL(TELEGRAM_JWKS_URL), {
    timeoutDuration: TELEGRAM_TOKEN_TIMEOUT_MS,
  })
  return remoteJwks
}

async function exchangeAuthorizationCode(
  code: string,
  verifier: string,
  config: TelegramOidcConfig
) {
  if (!code || code.length > 4_096) {
    throw new AppError(
      "Invalid Telegram authorization code",
      400,
      "TELEGRAM_AUTH_CODE_INVALID"
    )
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.callbackUrl,
    client_id: config.clientId,
    code_verifier: verifier,
  })
  const basic = Buffer.from(
    `${config.clientId}:${config.clientSecret}`
  ).toString("base64")

  let response: Response
  try {
    response = await fetch(TELEGRAM_TOKEN_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(TELEGRAM_TOKEN_TIMEOUT_MS),
    })
  } catch {
    throw new AppError(
      "Telegram token exchange failed",
      502,
      "TELEGRAM_TOKEN_EXCHANGE_FAILED"
    )
  }

  if (!response.ok) {
    throw new AppError(
      "Telegram token exchange failed",
      502,
      "TELEGRAM_TOKEN_EXCHANGE_FAILED"
    )
  }

  const tokenResponse = z
    .object({ id_token: z.string().min(20).max(20_000) })
    .safeParse(await response.json())
  if (!tokenResponse.success) {
    throw new AppError(
      "Telegram returned an invalid token response",
      502,
      "TELEGRAM_TOKEN_RESPONSE_INVALID"
    )
  }
  return tokenResponse.data.id_token
}

export async function verifyTelegramIdToken(
  idToken: string,
  expectedNonceHash: string,
  config = configuredTelegramOidc(),
  keyResolver: TelegramKeyResolver = getTelegramJwks()
) {
  let payload: Awaited<ReturnType<typeof jwtVerify>>["payload"]
  try {
    ;({ payload } = await jwtVerify(idToken, keyResolver, {
      algorithms: ["RS256"],
      issuer: TELEGRAM_OIDC_ISSUER,
      audience: config.clientId,
      clockTolerance: 60,
      requiredClaims: ["sub", "iat", "exp", "nonce"],
    }))
  } catch {
    throw new AppError(
      "Invalid Telegram identity token",
      401,
      "TELEGRAM_ID_TOKEN_INVALID"
    )
  }

  const result = telegramClaimsSchema.safeParse(payload)
  if (!result.success) {
    throw new AppError(
      "Invalid Telegram identity token",
      401,
      "TELEGRAM_ID_TOKEN_INVALID"
    )
  }
  if (!secureHashEqual(sha256Hex(result.data.nonce), expectedNonceHash)) {
    throw new AppError(
      "Invalid Telegram identity token nonce",
      401,
      "TELEGRAM_ID_TOKEN_INVALID"
    )
  }

  const telegramUserId = String(result.data.id)
  if (BigInt(telegramUserId) > TELEGRAM_MAX_USER_ID) {
    throw new AppError(
      "Invalid Telegram user identifier",
      401,
      "TELEGRAM_ID_TOKEN_INVALID"
    )
  }
  const firstName = result.data.given_name ?? result.data.name
  if (!firstName) {
    throw new AppError(
      "Telegram profile is missing a name",
      401,
      "TELEGRAM_ID_TOKEN_INVALID"
    )
  }

  return {
    subject: result.data.sub,
    telegramUserId,
    firstName,
    lastName: result.data.family_name,
    username: result.data.preferred_username,
    photoUrl: result.data.picture,
  }
}

export async function completeTelegramOidcAttempt(
  attempt: ClaimedTelegramAuthAttempt,
  code: string,
  now = new Date()
) {
  const config = configuredTelegramOidc()
  const idToken = await exchangeAuthorizationCode(
    code,
    attempt.oidcCodeVerifier,
    config
  )
  const identity = await verifyTelegramIdToken(
    idToken,
    attempt.oidcNonceHash,
    config
  )
  const userId = await resolveOidcUserId(identity)
  const handoffCode = randomBase64Url()
  const handoffExpiresAt = new Date(now.getTime() + TELEGRAM_HANDOFF_TTL_MS)

  const [updated] = await getDb()
    .update(telegramAuthAttempts)
    .set({
      userId,
      handoffCodeHash: sha256Hex(handoffCode),
      handoffExpiresAt,
      callbackCompletedAt: now,
      oidcCodeVerifier: null,
    })
    .where(
      and(
        eq(telegramAuthAttempts.id, attempt.id),
        isNull(telegramAuthAttempts.callbackCompletedAt),
        isNull(telegramAuthAttempts.consumedAt)
      )
    )
    .returning({ id: telegramAuthAttempts.id })

  if (!updated) {
    throw new AppError(
      "Telegram login attempt is no longer active",
      409,
      "TELEGRAM_AUTH_ATTEMPT_CONSUMED"
    )
  }

  return {
    attemptId: attempt.id,
    handoffCode,
    platform: attempt.platform,
    redirectUrl:
      attempt.platform === "web"
        ? null
        : buildNativeAuthRedirect({
            nativeReturnUrl: config.nativeReturnUrl,
            attemptId: attempt.id,
            handoffCode,
          }),
  }
}

export async function failTelegramOidcAttempt(
  attemptId: string,
  error: "cancelled" | "authentication_failed",
  now = new Date()
) {
  const config = configuredTelegramOidc()
  await getDb()
    .update(telegramAuthAttempts)
    .set({ callbackCompletedAt: now, oidcCodeVerifier: null })
    .where(eq(telegramAuthAttempts.id, attemptId))

  return buildNativeAuthRedirect({
    nativeReturnUrl: config.nativeReturnUrl,
    attemptId,
    error,
  })
}
