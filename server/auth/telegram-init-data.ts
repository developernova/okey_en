import { createHmac, timingSafeEqual } from "node:crypto"

import { z } from "zod"

import { AppError } from "@/server/shared/errors"

const MAX_INIT_DATA_LENGTH = 16_384
export const DEFAULT_INIT_DATA_MAX_AGE_SECONDS = 24 * 60 * 60

const telegramUserSchema = z.object({
  id: z.number().int().positive().max(2 ** 52 - 1),
  first_name: z.string().min(1),
  last_name: z.string().optional(),
  username: z.string().optional(),
  language_code: z.string().optional(),
  is_premium: z.boolean().optional(),
  allows_write_to_pm: z.boolean().optional(),
})

export type TelegramIdentity = {
  telegramUserId: string
  firstName: string
  lastName?: string
  username?: string
  languageCode?: string
  isPremium: boolean
}

type ValidationOptions = {
  now?: Date
  maxAgeSeconds?: number
}

function invalidInitData(): never {
  throw new AppError(
    "Invalid Telegram initData",
    401,
    "TELEGRAM_INIT_DATA_INVALID"
  )
}

function dataCheckString(params: URLSearchParams) {
  const entries: Array<[string, string]> = []
  const seen = new Set<string>()

  for (const [key, value] of params.entries()) {
    if (seen.has(key)) invalidInitData()
    seen.add(key)
    if (key !== "hash") entries.push([key, value])
  }

  entries.sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
  return entries.map(([key, value]) => `${key}=${value}`).join("\n")
}

export function validateTelegramInitData(
  rawInitData: string,
  botToken: string,
  options: ValidationOptions = {}
): TelegramIdentity {
  if (!rawInitData || rawInitData.length > MAX_INIT_DATA_LENGTH || !botToken) {
    invalidInitData()
  }

  const params = new URLSearchParams(rawInitData)
  const hash = params.get("hash")
  if (!hash || !/^[a-f\d]{64}$/i.test(hash)) invalidInitData()

  const secretKey = createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest()
  const expectedHash = createHmac("sha256", secretKey)
    .update(dataCheckString(params))
    .digest()
  const receivedHash = Buffer.from(hash, "hex")

  if (
    receivedHash.length !== expectedHash.length ||
    !timingSafeEqual(receivedHash, expectedHash)
  ) {
    invalidInitData()
  }

  const authDateValue = params.get("auth_date")
  const authDateSeconds = Number(authDateValue)
  if (
    !authDateValue ||
    !Number.isSafeInteger(authDateSeconds) ||
    authDateSeconds <= 0
  ) {
    invalidInitData()
  }

  const nowSeconds = Math.floor((options.now ?? new Date()).getTime() / 1000)
  const maxAgeSeconds =
    options.maxAgeSeconds ?? DEFAULT_INIT_DATA_MAX_AGE_SECONDS
  const ageSeconds = nowSeconds - authDateSeconds

  if (ageSeconds < -60 || ageSeconds > maxAgeSeconds) {
    throw new AppError(
      "Telegram initData has expired",
      401,
      "TELEGRAM_INIT_DATA_EXPIRED"
    )
  }

  const rawUser = params.get("user")
  if (!rawUser) invalidInitData()

  let parsedUser: unknown
  try {
    parsedUser = JSON.parse(rawUser)
  } catch {
    invalidInitData()
  }

  const result = telegramUserSchema.safeParse(parsedUser)
  if (!result.success) invalidInitData()

  return {
    telegramUserId: String(result.data.id),
    firstName: result.data.first_name,
    lastName: result.data.last_name,
    username: result.data.username,
    languageCode: result.data.language_code,
    isPremium: result.data.is_premium ?? false,
  }
}
