import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, it, vi } from "vitest"

import {
  consumeNativeAuthRefreshRateLimit,
  consumeNativeAuthStartRateLimit,
  nativeAuthFixedWindowSqlValues,
  NATIVE_AUTH_DEVICE_START_LIMIT,
  NATIVE_AUTH_DEVICE_WINDOW_MS,
  NATIVE_AUTH_GLOBAL_START_LIMIT,
  NATIVE_AUTH_REFRESH_WINDOW_MS,
  NATIVE_AUTH_SESSION_REFRESH_LIMIT,
  NATIVE_AUTH_USER_REFRESH_LIMIT,
} from "./native-auth-rate-limit"

describe("native auth fixed-window SQL", () => {
  it("serializes every raw timestamp parameter as an ISO string", () => {
    const now = new Date("2026-08-02T19:15:08.806Z")
    const expiresAt = new Date("2026-08-02T19:16:08.806Z")
    const values = nativeAuthFixedWindowSqlValues(now, expiresAt)
    const dialect = new PgDialect()
    const params = Object.values(values).flatMap(
      (fragment) => dialect.sqlToQuery(fragment).params
    )

    expect(params).toContain(now.toISOString())
    expect(params).toContain(expiresAt.toISOString())
    expect(params.every((parameter) => !(parameter instanceof Date))).toBe(true)
  })
})

type BucketRow = {
  requestCount: number
  windowExpiresAt: Date
}

function fakeAtomicBucketTransaction() {
  const rows = new Map<string, BucketRow>()
  const tx = {
    insert: vi.fn(() => ({
      values: (values: {
        key: string
        requestCount: number
        windowExpiresAt: Date
      }) => ({
        onConflictDoUpdate: () => ({
          returning: async () => {
            const current = rows.get(values.key)
            const policy = values.key.endsWith(":global")
              ? {
                  limit: NATIVE_AUTH_GLOBAL_START_LIMIT,
                  windowMs: 60 * 1_000,
                }
              : values.key.includes("-start:device:")
                ? {
                    limit: NATIVE_AUTH_DEVICE_START_LIMIT,
                    windowMs: NATIVE_AUTH_DEVICE_WINDOW_MS,
                  }
                : values.key.includes("-refresh:user:")
                  ? {
                      limit: NATIVE_AUTH_USER_REFRESH_LIMIT,
                      windowMs: NATIVE_AUTH_REFRESH_WINDOW_MS,
                    }
                  : {
                      limit: NATIVE_AUTH_SESSION_REFRESH_LIMIT,
                      windowMs: NATIVE_AUTH_REFRESH_WINDOW_MS,
                    }
            const now = new Date(
              values.windowExpiresAt.getTime() - policy.windowMs
            )

            if (!current || current.windowExpiresAt <= now) {
              rows.set(values.key, {
                requestCount: 1,
                windowExpiresAt: values.windowExpiresAt,
              })
              return [{ requestCount: 1 }]
            }
            if (current.requestCount >= policy.limit) return []

            current.requestCount += 1
            return [{ requestCount: current.requestCount }]
          },
        }),
      }),
    })),
  }

  return { tx: tx as never, rows }
}

describe("durable native auth start limits", () => {
  it("atomically admits only the per-device limit under concurrency", async () => {
    const { tx, rows } = fakeAtomicBucketTransaction()
    const now = new Date("2026-08-02T12:00:00.000Z")
    const results = await Promise.allSettled(
      Array.from({ length: NATIVE_AUTH_DEVICE_START_LIMIT + 10 }, () =>
        consumeNativeAuthStartRateLimit(tx, "same-device", now)
      )
    )

    expect(
      results.filter((result) => result.status === "fulfilled")
    ).toHaveLength(NATIVE_AUTH_DEVICE_START_LIMIT)
    const rejected = results.filter((result) => result.status === "rejected")
    expect(rejected).toHaveLength(10)
    expect(
      rejected.every(
        (result) => result.reason?.code === "NATIVE_AUTH_RATE_LIMITED"
      )
    ).toBe(true)

    const deviceRows = [...rows.entries()].filter(([key]) =>
      key.includes(":device:")
    )
    expect(deviceRows).toHaveLength(1)
    expect(deviceRows[0]?.[1].requestCount).toBe(NATIVE_AUTH_DEVICE_START_LIMIT)
    expect(deviceRows[0]?.[0]).not.toContain("same-device")
  })

  it("enforces the global safety cap across spoofed device identifiers", async () => {
    const { tx } = fakeAtomicBucketTransaction()
    const now = new Date("2026-08-02T12:00:00.000Z")
    const results = await Promise.allSettled(
      Array.from({ length: NATIVE_AUTH_GLOBAL_START_LIMIT + 7 }, (_, index) =>
        consumeNativeAuthStartRateLimit(tx, `device-${index}`, now)
      )
    )

    expect(
      results.filter((result) => result.status === "fulfilled")
    ).toHaveLength(NATIVE_AUTH_GLOBAL_START_LIMIT)
    expect(
      results.filter((result) => result.status === "rejected")
    ).toHaveLength(7)
  })

  it("resets an expired fixed window", async () => {
    const { tx } = fakeAtomicBucketTransaction()
    const now = new Date("2026-08-02T12:00:00.000Z")

    for (let index = 0; index < NATIVE_AUTH_DEVICE_START_LIMIT; index += 1) {
      await consumeNativeAuthStartRateLimit(tx, "same-device", now)
    }
    await expect(
      consumeNativeAuthStartRateLimit(tx, "same-device", now)
    ).rejects.toMatchObject({ code: "NATIVE_AUTH_RATE_LIMITED" })

    await expect(
      consumeNativeAuthStartRateLimit(
        tx,
        "same-device",
        new Date(now.getTime() + NATIVE_AUTH_DEVICE_WINDOW_MS + 1)
      )
    ).resolves.toBeUndefined()
  })
})

describe("durable native auth refresh limits", () => {
  it("atomically enforces the per-session daily limit", async () => {
    const { tx, rows } = fakeAtomicBucketTransaction()
    const now = new Date("2026-08-02T12:00:00.000Z")
    const results = await Promise.allSettled(
      Array.from({ length: NATIVE_AUTH_SESSION_REFRESH_LIMIT + 5 }, () =>
        consumeNativeAuthRefreshRateLimit(tx, "user-id", "session-id", now)
      )
    )

    expect(
      results.filter((result) => result.status === "fulfilled")
    ).toHaveLength(NATIVE_AUTH_SESSION_REFRESH_LIMIT)
    expect(
      results.filter((result) => result.status === "rejected")
    ).toHaveLength(5)
    expect(
      results
        .filter((result) => result.status === "rejected")
        .every(
          (result) => result.reason?.code === "NATIVE_AUTH_REFRESH_RATE_LIMITED"
        )
    ).toBe(true)

    const sessionKey = [...rows.keys()].find((key) =>
      key.includes("-refresh:session:")
    )
    expect(sessionKey).not.toContain("session-id")
  })

  it("caps refreshes across all sessions belonging to one user", async () => {
    const { tx, rows } = fakeAtomicBucketTransaction()
    const now = new Date("2026-08-02T12:00:00.000Z")
    const results = await Promise.allSettled(
      Array.from({ length: NATIVE_AUTH_USER_REFRESH_LIMIT + 7 }, (_, index) =>
        consumeNativeAuthRefreshRateLimit(
          tx,
          "same-user-id",
          `session-${index}`,
          now
        )
      )
    )

    expect(
      results.filter((result) => result.status === "fulfilled")
    ).toHaveLength(NATIVE_AUTH_USER_REFRESH_LIMIT)
    expect(
      results.filter((result) => result.status === "rejected")
    ).toHaveLength(7)
    const userKey = [...rows.keys()].find((key) =>
      key.includes("-refresh:user:")
    )
    expect(userKey).not.toContain("same-user-id")
  })
})
