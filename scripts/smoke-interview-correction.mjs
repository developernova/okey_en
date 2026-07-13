import { createHmac } from "node:crypto"

import postgres from "postgres"

const baseUrl = process.env.APP_URL ?? "http://localhost:3002"
const sql = postgres(process.env.DATABASE_URL)
let userId

function dateInMoscow(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  )
  return `${values.year}-${values.month}-${values.day}`
}

function signState(state) {
  const payload = Buffer.from(JSON.stringify(state)).toString("base64url")
  const signature = createHmac(
    "sha256",
    `okey-english-interview:${process.env.ADMIN_API_SECRET}`
  )
    .update(payload)
    .digest("base64url")
  return `${payload}.${signature}`
}

try {
  const [user] = await sql`
    insert into users (timezone)
    values ('Europe/Moscow')
    returning id
  `
  userId = user.id

  const todayResponse = await fetch(`${baseUrl}/api/today`, {
    headers: { "x-user-id": userId },
  })
  const today = await todayResponse.json()
  if (!todayResponse.ok) throw new Error(JSON.stringify(today))
  const episodeId = today.data.episode.id
  const now = new Date()
  async function getCorrection(question, answer) {
    const sessionToken = signState({
      version: 1,
      userId,
      episodeId,
      requestDate: dateInMoscow(now),
      answersCompleted: 0,
      questions: [
        question,
        "What do they have for breakfast?",
        "What happens at dinner?",
      ],
      conversation: [{ role: "assistant", content: question }],
      issuedAt: now.getTime(),
    })
    const response = await fetch(`${baseUrl}/api/interview`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": userId,
      },
      body: JSON.stringify({
        action: "reply",
        episodeId,
        sessionToken,
        answer,
      }),
    })
    const payload = await response.json()
    if (!response.ok) throw new Error(JSON.stringify(payload))
    return payload.data
  }

  const turn = await getCorrection(
    "What is the weather like in the morning?",
    "weather is may be sunny or rain"
  )

  if (!turn.correction || !/(\bmay\b|после is|maybe)/i.test(turn.correction)) {
    throw new Error("The major language error was not explained")
  }
  if (/(в видео|в диалоге) сказано|облачн/i.test(turn.correction)) {
    throw new Error(
      "A factual mismatch was incorrectly presented as a correction"
    )
  }
  if (/\n\s*(?:[-*]|\d+[.)])\s+/.test(turn.correction)) {
    throw new Error("The model returned a list of corrections")
  }
  if (turn.correction.length > 220) {
    throw new Error("The correction is too long")
  }

  const bananaTurn = await getCorrection(
    "What ingredients do they need to make the smoothie?",
    "they need to use milk and banana"
  )
  console.log(
    JSON.stringify({
      weatherCorrection: turn.correction,
      bananaCorrection: bananaTurn.correction,
      bananaReaction: bananaTurn.reaction,
    })
  )
  if (
    !bananaTurn.correction ||
    !/(артикл|исчисляем|a banana|bananas)/i.test(bananaTurn.correction)
  ) {
    throw new Error("The countability error was not explained")
  }
  if (
    /(не было банан|do not use banana|в видео)/i.test(bananaTurn.correction)
  ) {
    throw new Error("A banana fact was presented as a language correction")
  }
} finally {
  if (userId) await sql`delete from users where id = ${userId}`
  await sql.end()
}
