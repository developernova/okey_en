import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ getDb: vi.fn() }))

vi.mock("@/db", () => ({ getDb: mocks.getDb }))

import { resetAdminUser } from "@/server/admin/user-service"

const currentUser = {
  id: "774b9ccb-5bc8-4f87-9b8b-e44fbd7773fd",
  telegramUserId: "123456",
  telegramOidcSubject: "oidc-user",
  firstName: "Анна",
  lastName: "Петрова",
  username: "anna",
  languageCode: "ru",
  isPremium: true,
  addedToAttachmentMenu: true,
  allowsWriteToPm: true,
  photoUrl: "https://example.com/avatar.jpg",
  timezone: "Europe/Moscow",
  createdAt: new Date("2026-01-10T09:00:00.000Z"),
}

function fakeDatabase(selected: typeof currentUser | undefined) {
  const values = vi.fn().mockReturnValue({
    returning: vi.fn().mockResolvedValue([
      {
        id: currentUser.id,
        telegramUserId: currentUser.telegramUserId,
        username: currentUser.username,
        onboardingCompleted: false,
      },
    ]),
  })
  const tx = {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          for: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(selected ? [selected] : []),
          }),
        }),
      }),
    }),
    delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
    insert: vi.fn().mockReturnValue({ values }),
  }
  return {
    values,
    database: {
      transaction: vi.fn(
        async (callback: (transaction: typeof tx) => unknown) => callback(tx)
      ),
    },
  }
}

describe("resetAdminUser", () => {
  beforeEach(() => mocks.getDb.mockReset())

  it("preserves Telegram identity while clearing learning state", async () => {
    const fake = fakeDatabase(currentUser)
    mocks.getDb.mockReturnValue(fake.database)
    const now = new Date("2026-08-17T10:00:00.000Z")

    await expect(resetAdminUser(currentUser.id, now)).resolves.toMatchObject({
      id: currentUser.id,
      onboardingCompleted: false,
      resetAt: now.toISOString(),
    })
    expect(fake.values).toHaveBeenCalledWith({
      ...currentUser,
      reminderTime: null,
      levelEstimate: null,
      onboardingCompleted: false,
      lastActiveAt: null,
      updatedAt: now,
    })
  })

  it("does not delete anything when the user does not exist", async () => {
    const fake = fakeDatabase(undefined)
    mocks.getDb.mockReturnValue(fake.database)

    await expect(resetAdminUser(currentUser.id)).rejects.toMatchObject({
      status: 404,
      code: "USER_NOT_FOUND",
    })
  })
})
