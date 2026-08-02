import { generateKeyPair, SignJWT, type JWTVerifyGetKey } from "jose"
import { describe, expect, it } from "vitest"

import { AppError } from "@/server/shared/errors"

import { sha256Hex } from "./token-crypto"
import {
  buildNativeAuthRedirect,
  buildTelegramAuthorizationUrl,
  createS256CodeChallenge,
  isNativeAuthReturnUrl,
  isS256CodeChallenge,
  verifyTelegramIdToken,
} from "./telegram-oidc"

const oidcConfig = {
  clientId: "123456789",
  clientSecret: "a-client-secret-long-enough",
  callbackUrl: "https://api.example.com/api/auth/telegram/callback",
  nativeReturnUrl: "catchenglish://auth",
}

describe("Telegram OIDC URL and PKCE", () => {
  it("builds a fixed authorization-code URL with nonce and S256 PKCE", () => {
    const verifier = "v".repeat(43)
    const challenge = createS256CodeChallenge(verifier)
    const url = new URL(
      buildTelegramAuthorizationUrl({
        config: oidcConfig,
        state: "state-value",
        nonce: "nonce-value",
        oidcCodeChallenge: challenge,
      })
    )

    expect(url.origin + url.pathname).toBe("https://oauth.telegram.org/auth")
    expect(url.searchParams.get("redirect_uri")).toBe(oidcConfig.callbackUrl)
    expect(url.searchParams.get("response_type")).toBe("code")
    expect(url.searchParams.get("scope")).toBe(
      "openid profile telegram:bot_access"
    )
    expect(url.searchParams.get("state")).toBe("state-value")
    expect(url.searchParams.get("nonce")).toBe("nonce-value")
    expect(url.searchParams.get("code_challenge_method")).toBe("S256")
    expect(url.searchParams.get("code_challenge")).toBe(challenge)
    expect(url.toString()).not.toContain(oidcConfig.clientSecret)
    expect(isS256CodeChallenge(challenge)).toBe(true)
  })

  it("only places the one-time handoff code in the native redirect", () => {
    const url = new URL(
      buildNativeAuthRedirect({
        nativeReturnUrl: oidcConfig.nativeReturnUrl,
        attemptId: "attempt-id",
        handoffCode: "handoff-code",
      })
    )
    expect(url.protocol).toBe("catchenglish:")
    expect(url.searchParams.get("attempt_id")).toBe("attempt-id")
    expect(url.searchParams.get("code")).toBe("handoff-code")
    expect(url.searchParams.has("state")).toBe(false)
  })

  it("only accepts the exact native authentication callback", () => {
    expect(isNativeAuthReturnUrl("catchenglish://auth")).toBe(true)
    expect(isNativeAuthReturnUrl("catchenglish://auth/")).toBe(true)

    for (const value of [
      "catchenglish://auth/other",
      "catchenglish://auth?redirect=https://evil.example",
      "catchenglish://user:password@auth",
      "catchenglish://auth#fragment",
      "catchenglish://other",
      "https://auth",
    ]) {
      expect(isNativeAuthReturnUrl(value)).toBe(false)
    }
  })
})

describe("Telegram ID token validation", () => {
  async function signedToken(input?: {
    nonce?: string
    audience?: string
    expiresInSeconds?: number
  }) {
    const { publicKey, privateKey } = await generateKeyPair("RS256")
    const now = Math.floor(Date.now() / 1_000)
    const token = await new SignJWT({
      nonce: input?.nonce ?? "expected-nonce",
      id: 7_123_456_789,
      name: "Test User",
      given_name: "Test",
      family_name: "User",
      preferred_username: "test_user",
      picture: "https://example.com/avatar.jpg",
    })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer("https://oauth.telegram.org")
      .setAudience(input?.audience ?? oidcConfig.clientId)
      .setSubject("telegram-subject")
      .setIssuedAt(now)
      .setExpirationTime(now + (input?.expiresInSeconds ?? 300))
      .sign(privateKey)
    const keyResolver: JWTVerifyGetKey = async () => publicKey
    return { token, keyResolver }
  }

  it("accepts a signed token and returns the canonical Telegram identity", async () => {
    const { token, keyResolver } = await signedToken()
    await expect(
      verifyTelegramIdToken(
        token,
        sha256Hex("expected-nonce"),
        oidcConfig,
        keyResolver
      )
    ).resolves.toEqual({
      subject: "telegram-subject",
      telegramUserId: "7123456789",
      firstName: "Test",
      lastName: "User",
      username: "test_user",
      photoUrl: "https://example.com/avatar.jpg",
    })
  })

  it("rejects nonce and audience substitution", async () => {
    const nonceMismatch = await signedToken({ nonce: "other-nonce" })
    const audienceMismatch = await signedToken({ audience: "other-client" })

    for (const signed of [nonceMismatch, audienceMismatch]) {
      try {
        await verifyTelegramIdToken(
          signed.token,
          sha256Hex("expected-nonce"),
          oidcConfig,
          signed.keyResolver
        )
        throw new Error("Expected validation to fail")
      } catch (error) {
        expect(error).toBeInstanceOf(AppError)
        expect((error as AppError).code).toBe("TELEGRAM_ID_TOKEN_INVALID")
      }
    }
  })

  it("rejects expired identity tokens", async () => {
    const { token, keyResolver } = await signedToken({
      expiresInSeconds: -120,
    })
    await expect(
      verifyTelegramIdToken(
        token,
        sha256Hex("expected-nonce"),
        oidcConfig,
        keyResolver
      )
    ).rejects.toMatchObject({ code: "TELEGRAM_ID_TOKEN_INVALID" })
  })
})
