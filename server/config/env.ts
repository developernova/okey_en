import { z } from "zod"

const emptyStringToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value

const optionalString = z.preprocess(
  emptyStringToUndefined,
  z.string().min(1).optional()
)
const optionalUrl = z.preprocess(emptyStringToUndefined, z.url().optional())
const optionalSecret = z.preprocess(
  emptyStringToUndefined,
  z.string().min(16).optional()
)

const serverEnvSchema = z.object({
  DATABASE_URL: z.url(),
  OPENROUTER_API_KEY: z.string().min(1),
  OPENROUTER_MODEL: z.string().min(1).default("google/gemini-2.5-flash"),
  OPENROUTER_INTERVIEW_MODEL: z
    .string()
    .min(1)
    .default("deepseek/deepseek-v4-flash"),
  OPENROUTER_APP_URL: z.url().default("http://localhost:3000"),
  OPENROUTER_APP_NAME: z.string().min(1).default("Okey English"),
  OPENROUTER_TRANSCRIPTION_MODEL: z
    .string()
    .min(1)
    .default("openai/whisper-large-v3"),
  YOUTUBE_API_KEY: optionalString,
  TELEGRAM_BOT_TOKEN: optionalString,
  TELEGRAM_WEB_APP_URL: optionalUrl,
  REMINDER_CRON_SECRET: optionalSecret,
  ADMIN_API_SECRET: z.string().min(16),
  DEV_USER_ID: z.uuid().optional(),
})

type ServerEnv = z.infer<typeof serverEnvSchema>

let cachedEnv: ServerEnv | undefined

export function env(): ServerEnv {
  if (!cachedEnv) {
    const result = serverEnvSchema.safeParse(process.env)

    if (!result.success) {
      const missing = result.error.issues
        .map((issue) => issue.path.join("."))
        .join(", ")
      throw new Error(`Invalid server environment: ${missing}`)
    }

    cachedEnv = result.data
  }

  return cachedEnv
}
