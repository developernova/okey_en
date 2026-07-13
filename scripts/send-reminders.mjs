const baseUrl = process.env.APP_URL ?? "http://localhost:3000"
const secret = process.env.REMINDER_CRON_SECRET
if (!secret) throw new Error("REMINDER_CRON_SECRET is required")

const response = await fetch(`${baseUrl}/api/admin/reminders/send`, {
  method: "POST",
  headers: { "x-cron-secret": secret },
})
const payload = await response.json()
if (!response.ok) throw new Error(JSON.stringify(payload))
console.log(JSON.stringify(payload.data))
