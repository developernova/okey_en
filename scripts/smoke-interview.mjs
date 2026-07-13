import postgres from "postgres"

const baseUrl = process.env.APP_URL ?? "http://localhost:3002"
const sql = postgres(process.env.DATABASE_URL)
let userId

async function post(body) {
  const response = await fetch(`${baseUrl}/api/interview`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-user-id": userId,
    },
    body: JSON.stringify(body),
  })
  const payload = await response.json()
  if (!response.ok) throw new Error(JSON.stringify(payload))
  return payload.data
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
  const todayPayload = await todayResponse.json()
  if (!todayResponse.ok) throw new Error(JSON.stringify(todayPayload))
  const episodeId = todayPayload.data.episode.id

  let turn = await post({ action: "start", episodeId })
  console.log(JSON.stringify({ step: "question-1", message: turn.message }))

  function answerFor(question) {
    const text = question.toLowerCase()
    if (text.includes("weather")) return "The weather is cloudy and windy."
    if (text.includes("breakfast")) {
      return "They have a bagel with eggs, bacon and cream cheese, and a smoothie."
    }
    if (text.includes("dryer") || text.includes("moisture sensor")) {
      return "The dryer stopped working and needs a new moisture sensor."
    }
    if (text.includes("electric") || text.includes("save money")) {
      return "They can unplug unused devices, use cold water, run full loads and use LED bulbs."
    }
    if (text.includes("order") || text.includes("dinner")) {
      return "They order food because they do not want to cook."
    }
    if (text.includes("water") || text.includes("laundry")) {
      return "They use cold water and run full loads to save energy."
    }
    if (text.includes("school")) return "Nicholas gets ready for school."
    if (text.includes("pizza") || text.includes("spicy")) {
      return "They talk about pizza and spicy food."
    }
    return "They talk about their family life and things they do at home."
  }

  for (let index = 0; index < 3; index += 1) {
    const answer = answerFor(turn.message)
    turn = await post({
      action: "reply",
      episodeId,
      sessionToken: turn.sessionToken,
      answer,
    })
    console.log(
      JSON.stringify({
        step: `answer-${turn.answersCompleted}`,
        correction: turn.correction,
        reaction: turn.reaction,
        message: turn.message,
        completed: turn.completed,
      })
    )
    if (turn.correction) {
      throw new Error(
        `Unexpected correction for an understandable answer: ${turn.correction}`
      )
    }
  }

  if (!turn.completed || turn.answersCompleted !== 3) {
    throw new Error("Interview did not complete after three answers")
  }
} finally {
  if (userId) await sql`delete from users where id = ${userId}`
  await sql.end()
}
