import { createHmac } from "node:crypto"

import { describe, expect, it } from "vitest"

import { AppError } from "@/server/shared/errors"

import { validateTelegramInitData } from "./telegram-init-data"

const botToken = "123456789:test-bot-token"
const now = new Date("2026-07-13T12:00:00.000Z")

function signInitData(values: Record<string, string>) {
  const params = new URLSearchParams(values)
  const checkString = [...params.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n")
  const secretKey = createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest()
  const hash = createHmac("sha256", secretKey)
    .update(checkString)
    .digest("hex")
  params.set("hash", hash)
  return params.toString()
}

function validInitData(overrides: Record<string, string> = {}) {
  return signInitData({
    auth_date: String(Math.floor(now.getTime() / 1000)),
    query_id: "AAHdF6IQAAAAAN0XohDhrOrc",
    user: JSON.stringify({
      id: 7_123_456_789,
      first_name: "Test",
      username: "test_user",
      language_code: "ru",
      is_premium: true,
    }),
    ...overrides,
  })
}

function expectAppError(action: () => unknown, code: string) {
  try {
    action()
    throw new Error("Expected validation to fail")
  } catch (error) {
    expect(error).toBeInstanceOf(AppError)
    expect((error as AppError).code).toBe(code)
  }
}

describe("Telegram Mini App initData", () => {
  it("returns the verified Telegram identity", () => {
    expect(validateTelegramInitData(validInitData(), botToken, { now })).toEqual(
      {
        telegramUserId: "7123456789",
        firstName: "Test",
        username: "test_user",
        languageCode: "ru",
        isPremium: true,
      }
    )
  })

  it("rejects data changed after Telegram signed it", () => {
    const params = new URLSearchParams(validInitData())
    params.set("user", JSON.stringify({ id: 99, first_name: "Attacker" }))

    expectAppError(
      () => validateTelegramInitData(params.toString(), botToken, { now }),
      "TELEGRAM_INIT_DATA_INVALID"
    )
  })

  it("rejects expired data", () => {
    const authDate = Math.floor(now.getTime() / 1000) - 24 * 60 * 60 - 1
    expectAppError(
      () =>
        validateTelegramInitData(
          validInitData({ auth_date: String(authDate) }),
          botToken,
          { now }
        ),
      "TELEGRAM_INIT_DATA_EXPIRED"
    )
  })

  it("includes the optional signature field in the HMAC input", () => {
    const initData = validInitData({ signature: "telegram-signature" })
    expect(validateTelegramInitData(initData, botToken, { now }).telegramUserId).toBe(
      "7123456789"
    )
  })

  it("rejects missing user data and duplicate fields", () => {
    const withoutUser = signInitData({
      auth_date: String(Math.floor(now.getTime() / 1000)),
      query_id: "query",
    })
    expectAppError(
      () => validateTelegramInitData(withoutUser, botToken, { now }),
      "TELEGRAM_INIT_DATA_INVALID"
    )

    const duplicate = `${validInitData()}&auth_date=1`
    expectAppError(
      () => validateTelegramInitData(duplicate, botToken, { now }),
      "TELEGRAM_INIT_DATA_INVALID"
    )
  })
})
