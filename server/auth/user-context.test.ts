import { beforeEach, describe, expect, it, vi } from "vitest"

import { AppError } from "@/server/shared/errors"

const mocks = vi.hoisted(() => ({
  resolveBearerUserId: vi.fn(),
  validateTelegramInitData: vi.fn(),
  resolveMiniAppUserId: vi.fn(),
  updateUserTimezone: vi.fn(),
  env: vi.fn(),
}))

vi.mock("@/server/auth/user-session", () => ({
  resolveBearerUserId: mocks.resolveBearerUserId,
}))
vi.mock("@/server/auth/telegram-init-data", () => ({
  validateTelegramInitData: mocks.validateTelegramInitData,
}))
vi.mock("@/server/auth/telegram-user", () => ({
  resolveMiniAppUserId: mocks.resolveMiniAppUserId,
  updateUserTimezone: mocks.updateUserTimezone,
}))
vi.mock("@/server/config/env", () => ({ env: mocks.env }))

import { requireUserId } from "./user-context"

describe("requireUserId", () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    mocks.resolveBearerUserId.mockReset().mockResolvedValue("native-user")
    mocks.validateTelegramInitData.mockReset().mockReturnValue({
      telegramUserId: "123",
      firstName: "Mini",
      isPremium: false,
      addedToAttachmentMenu: false,
      allowsWriteToPm: false,
    })
    mocks.resolveMiniAppUserId.mockReset().mockResolvedValue("mini-user")
    mocks.updateUserTimezone.mockReset().mockResolvedValue(undefined)
    mocks.env.mockReset().mockReturnValue({
      TELEGRAM_BOT_TOKEN: "bot-token",
      DEV_USER_ID: "dev-user",
    })
  })

  it("uses bearer authentication before Mini App initData", async () => {
    const request = new Request("https://example.com/api/today", {
      headers: {
        Authorization: "Bearer ce_at_test",
        "x-telegram-init-data": "valid-init-data",
        "x-user-timezone": "Europe/Moscow",
      },
    })

    await expect(requireUserId(request)).resolves.toBe("native-user")
    expect(mocks.resolveBearerUserId).toHaveBeenCalledWith("Bearer ce_at_test")
    expect(mocks.validateTelegramInitData).not.toHaveBeenCalled()
    expect(mocks.updateUserTimezone).toHaveBeenCalledWith(
      "native-user",
      "Europe/Moscow"
    )
  })

  it("does not downgrade an invalid bearer credential to initData", async () => {
    mocks.resolveBearerUserId.mockRejectedValueOnce(
      new AppError("Invalid token", 401, "AUTH_TOKEN_INVALID")
    )
    const request = new Request("https://example.com/api/today", {
      headers: {
        Authorization: "Bearer invalid",
        "x-telegram-init-data": "valid-init-data",
      },
    })

    await expect(requireUserId(request)).rejects.toMatchObject({
      code: "AUTH_TOKEN_INVALID",
    })
    expect(mocks.validateTelegramInitData).not.toHaveBeenCalled()
  })

  it("preserves the existing Mini App authentication path", async () => {
    const request = new Request("https://example.com/api/today", {
      headers: { "x-telegram-init-data": "valid-init-data" },
    })
    await expect(requireUserId(request)).resolves.toBe("mini-user")
    expect(mocks.validateTelegramInitData).toHaveBeenCalledWith(
      "valid-init-data",
      "bot-token"
    )
  })

  it("fails closed without either production credential", async () => {
    vi.stubEnv("NODE_ENV", "production")
    await expect(
      requireUserId(new Request("https://example.com/api/today"))
    ).rejects.toMatchObject({ code: "AUTH_REQUIRED" })
  })
})
