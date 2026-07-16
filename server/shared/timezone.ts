const MAX_TIMEZONE_LENGTH = 100
const MILLISECONDS_PER_DAY = 86_400_000

export function canonicalizeIanaTimezone(value: string | null | undefined) {
  const timezone = value?.trim()
  if (!timezone || timezone.length > MAX_TIMEZONE_LENGTH) return null

  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
    }).resolvedOptions().timeZone
  } catch {
    return null
  }
}

function calendarDateInTimezone(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  )

  return Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day)
  )
}

export function calendarDayGap(
  previousActivity: Date | null,
  now: Date,
  timezone: string
) {
  if (!previousActivity) return 0

  const previousDate = calendarDateInTimezone(previousActivity, timezone)
  const currentDate = calendarDateInTimezone(now, timezone)
  return Math.max(
    0,
    Math.round((currentDate - previousDate) / MILLISECONDS_PER_DAY)
  )
}
