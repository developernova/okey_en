import { describe, expect, it, vi } from "vitest"

import {
  authRateLimitBuckets,
  authSessions,
  authTokens,
  qrAuthChallenges,
  telegramAuthAttempts,
} from "@/db/schema"

const mocks = vi.hoisted(() => ({ getDb: vi.fn() }))

vi.mock("@/db", () => ({ getDb: mocks.getDb }))

import { cleanupExpiredAuthRecords } from "./auth-maintenance"

function fakeCleanupDatabase() {
  const remaining = new Map<unknown, string[]>([
    [telegramAuthAttempts, ["attempt-1", "attempt-2", "attempt-3"]],
    [authTokens, ["access-1", "access-2", "access-3"]],
    [qrAuthChallenges, ["qr-1", "qr-2"]],
    [authSessions, ["session-1", "session-2"]],
    [authRateLimitBuckets, ["bucket-1", "bucket-2", "bucket-3", "bucket-4"]],
  ])
  const deletedTables: unknown[] = []
  const tx = {
    delete: vi.fn((table: unknown) => ({
      where: vi.fn(() => ({
        returning: vi.fn(async () => {
          deletedTables.push(table)
          const rows = remaining.get(table) ?? []
          remaining.set(table, [])
          return rows.map((id) => ({ id, key: id }))
        }),
      })),
    })),
  }
  const database = {
    transaction: vi.fn(
      async (callback: (transaction: typeof tx) => Promise<unknown>) =>
        callback(tx)
    ),
  }
  return { database, deletedTables }
}

describe("native auth maintenance", () => {
  it("is idempotent and directly cleans only the access-token selection", async () => {
    const fake = fakeCleanupDatabase()
    mocks.getDb.mockReturnValue(fake.database)

    const results = await Promise.all([
      cleanupExpiredAuthRecords(new Date("2026-08-02T12:00:00.000Z")),
      cleanupExpiredAuthRecords(new Date("2026-08-02T12:00:00.000Z")),
    ])

    expect(results.reduce((sum, result) => sum + result.attempts, 0)).toBe(3)
    expect(results.reduce((sum, result) => sum + result.accessTokens, 0)).toBe(
      3
    )
    expect(results.reduce((sum, result) => sum + result.qrChallenges, 0)).toBe(
      2
    )
    expect(results.reduce((sum, result) => sum + result.sessions, 0)).toBe(2)
    expect(
      results.reduce((sum, result) => sum + result.rateLimitBuckets, 0)
    ).toBe(4)
    expect(fake.deletedTables).toContain(authTokens)
    expect(fake.deletedTables.indexOf(authTokens)).toBeLessThan(
      fake.deletedTables.indexOf(authSessions)
    )
  })
})
