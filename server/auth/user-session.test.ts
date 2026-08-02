import { beforeEach, describe, expect, it, vi } from "vitest"

import { AppError } from "@/server/shared/errors"

import { sha256Base64Url } from "./token-crypto"

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  consumeNativeAuthRefreshRateLimit: vi.fn(),
}))

vi.mock("@/db", () => ({ getDb: mocks.getDb }))
vi.mock("@/server/auth/native-auth-rate-limit", () => ({
  consumeNativeAuthRefreshRateLimit: mocks.consumeNativeAuthRefreshRateLimit,
}))

import {
  exchangeTelegramHandoff,
  parseBearerAuthorization,
  refreshUserSession,
} from "./user-session"

type FakeTransactionOptions = {
  selectResults: unknown[][]
}

function fakeDatabase(options: FakeTransactionOptions) {
  const selectResults = [...options.selectResults]
  const updates: unknown[] = []
  const inserts: Array<{ table: unknown; values: unknown }> = []

  const tx = {
    select: vi.fn(() => {
      const chain = {
        from: vi.fn(() => chain),
        innerJoin: vi.fn(() => chain),
        where: vi.fn(() => chain),
        for: vi.fn(() => chain),
        limit: vi.fn(async () => selectResults.shift() ?? []),
      }
      return chain
    }),
    update: vi.fn((table: unknown) => ({
      set: vi.fn((values: unknown) => ({
        where: vi.fn(async () => {
          updates.push({ table, values })
          return []
        }),
      })),
    })),
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((values: unknown) => {
        inserts.push({ table, values })
        return {
          returning: vi.fn(async () => [{ id: "session-id" }]),
        }
      }),
    })),
  }
  const database = {
    transaction: vi.fn(async (callback: (transaction: typeof tx) => unknown) =>
      callback(tx)
    ),
  }
  return { database, updates, inserts }
}

const user = {
  id: "user-id",
  firstName: "Test",
  lastName: "User",
  username: "test_user",
  photoUrl: null,
  levelEstimate: "B1",
}

describe("native session credentials", () => {
  beforeEach(() => {
    mocks.getDb.mockReset()
    mocks.consumeNativeAuthRefreshRateLimit
      .mockReset()
      .mockResolvedValue(undefined)
  })

  it("requires the native access-token prefix", () => {
    expect(parseBearerAuthorization("Bearer ce_at_token")).toBe("ce_at_token")
    expect(() => parseBearerAuthorization("Bearer telegram-init-data")).toThrow(
      expect.objectContaining({ code: "AUTH_TOKEN_INVALID" })
    )
  })

  it("binds a handoff code to the app verifier and issues a session atomically", async () => {
    const now = new Date("2026-08-02T12:00:00.000Z")
    const verifier = "v".repeat(43)
    const fake = fakeDatabase({
      selectResults: [
        [
          {
            id: "attempt-id",
            userId: "user-id",
            platform: "ios",
            deviceId: null,
            deviceName: "iPhone",
            handoffCodeChallenge: sha256Base64Url(verifier),
          },
        ],
        [user],
      ],
    })
    mocks.getDb.mockReturnValue(fake.database)

    const result = await exchangeTelegramHandoff({
      attemptId: "774b9ccb-5bc8-4f87-9b8b-e44fbd7773fd",
      code: "c".repeat(43),
      handoffCodeVerifier: verifier,
      timezone: null,
      now,
    })

    expect(result.accessToken).toMatch(/^ce_at_/)
    expect(result.refreshToken).toMatch(/^ce_rt_/)
    expect(result.expiresAt).toBe("2026-08-02T12:15:00.000Z")
    expect(result.refreshExpiresAt).toBe("2026-10-31T12:00:00.000Z")
    expect(result.user).toMatchObject({
      onboardingCompleted: true,
      placementLevel: "B1",
    })
    expect(fake.updates).toHaveLength(1)
    expect(fake.inserts).toHaveLength(2)
  })

  it("does not consume or issue a session for a mismatched handoff verifier", async () => {
    const fake = fakeDatabase({
      selectResults: [
        [
          {
            id: "attempt-id",
            userId: "user-id",
            platform: "macos",
            deviceId: null,
            deviceName: null,
            handoffCodeChallenge: sha256Base64Url("x".repeat(43)),
          },
        ],
      ],
    })
    mocks.getDb.mockReturnValue(fake.database)

    await expect(
      exchangeTelegramHandoff({
        attemptId: "774b9ccb-5bc8-4f87-9b8b-e44fbd7773fd",
        code: "c".repeat(43),
        handoffCodeVerifier: "v".repeat(43),
        timezone: null,
      })
    ).rejects.toMatchObject({ code: "TELEGRAM_HANDOFF_INVALID" })
    expect(fake.updates).toHaveLength(0)
    expect(fake.inserts).toHaveLength(0)
  })

  it("rotates a refresh token and returns the native wire contract", async () => {
    const now = new Date("2026-08-02T12:00:00.000Z")
    const fake = fakeDatabase({
      selectResults: [
        [
          {
            tokenExpiresAt: new Date("2026-09-01T00:00:00.000Z"),
            consumedAt: null,
            sessionId: "session-id",
            userId: "user-id",
            absoluteExpiresAt: new Date("2027-08-02T12:00:00.000Z"),
            revokedAt: null,
          },
        ],
        [user],
      ],
    })
    mocks.getDb.mockReturnValue(fake.database)

    const result = await refreshUserSession(`ce_rt_${"r".repeat(43)}`, now)
    expect(result.accessToken).toMatch(/^ce_at_/)
    expect(result.refreshToken).toMatch(/^ce_rt_/)
    expect(result.expiresAt).toBe("2026-08-02T12:15:00.000Z")
    expect(result.refreshExpiresAt).toBe("2026-10-31T12:00:00.000Z")
    expect(result.user.placementLevel).toBe("B1")
    expect(mocks.consumeNativeAuthRefreshRateLimit).toHaveBeenCalledWith(
      expect.anything(),
      "user-id",
      "session-id",
      now
    )
    expect(fake.inserts).toHaveLength(1)
  })

  it("does not consume a refresh token when its durable limit is exhausted", async () => {
    const now = new Date("2026-08-02T12:00:00.000Z")
    const fake = fakeDatabase({
      selectResults: [
        [
          {
            tokenExpiresAt: new Date("2026-09-01T00:00:00.000Z"),
            consumedAt: null,
            sessionId: "session-id",
            userId: "user-id",
            absoluteExpiresAt: new Date("2027-08-02T12:00:00.000Z"),
            revokedAt: null,
          },
        ],
      ],
    })
    mocks.getDb.mockReturnValue(fake.database)
    mocks.consumeNativeAuthRefreshRateLimit.mockRejectedValueOnce(
      new AppError(
        "Too many refreshes",
        429,
        "NATIVE_AUTH_REFRESH_RATE_LIMITED"
      )
    )

    await expect(
      refreshUserSession(`ce_rt_${"r".repeat(43)}`, now)
    ).rejects.toMatchObject({ code: "NATIVE_AUTH_REFRESH_RATE_LIMITED" })
    expect(fake.updates).toHaveLength(0)
    expect(fake.inserts).toHaveLength(0)
  })

  it("revokes the session when a consumed refresh token is reused", async () => {
    const fake = fakeDatabase({
      selectResults: [
        [
          {
            tokenExpiresAt: new Date("2026-09-01T00:00:00.000Z"),
            consumedAt: new Date("2026-08-02T11:59:00.000Z"),
            sessionId: "session-id",
            userId: "user-id",
            absoluteExpiresAt: new Date("2027-08-02T12:00:00.000Z"),
            revokedAt: null,
          },
        ],
      ],
    })
    mocks.getDb.mockReturnValue(fake.database)

    await expect(
      refreshUserSession(
        `ce_rt_${"r".repeat(43)}`,
        new Date("2026-08-02T12:00:00.000Z")
      )
    ).rejects.toMatchObject({ code: "REFRESH_TOKEN_REUSED" })
    expect(mocks.consumeNativeAuthRefreshRateLimit).not.toHaveBeenCalled()
    expect(fake.updates).toHaveLength(1)
    expect(fake.inserts).toHaveLength(0)
  })
})
