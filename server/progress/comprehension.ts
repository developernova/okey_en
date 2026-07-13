import { eq } from "drizzle-orm"

import { getDb } from "@/db"
import { episodeLexemes, phrases, userCards, userLexemes } from "@/db/schema"
import { lemmaCandidates } from "@/server/content/lemmatize"
import { retrievability } from "@/server/srs/fsrs"

export async function calculateComprehension(input: {
  userId: string
  episodeId: string
  now?: Date
}) {
  const db = getDb()
  const now = input.now ?? new Date()
  const [episodeWords, explicitKnown, reviewedCards] = await Promise.all([
    db
      .select({
        lemma: episodeLexemes.lemma,
        frequency: episodeLexemes.frequency,
      })
      .from(episodeLexemes)
      .where(eq(episodeLexemes.episodeId, input.episodeId)),
    db
      .select({ lemma: userLexemes.lemma, confidence: userLexemes.confidence })
      .from(userLexemes)
      .where(eq(userLexemes.userId, input.userId)),
    db
      .select({
        lemma: phrases.lemma,
        due: userCards.due,
        stability: userCards.stability,
        difficulty: userCards.difficulty,
        scheduledDays: userCards.scheduledDays,
        learningSteps: userCards.learningSteps,
        reps: userCards.reps,
        lapses: userCards.lapses,
        state: userCards.state,
        lastReview: userCards.lastReview,
      })
      .from(userCards)
      .innerJoin(phrases, eq(phrases.id, userCards.phraseId))
      .where(eq(userCards.userId, input.userId)),
  ])

  const known = new Set(
    explicitKnown
      .filter((item) => item.confidence >= 0.8)
      .map((item) => item.lemma.toLocaleLowerCase("en"))
  )

  for (const card of reviewedCards) {
    if (card.reps > 0 && retrievability(card, now) >= 0.8) {
      known.add(card.lemma.toLocaleLowerCase("en"))
    }
  }

  let totalOccurrences = 0
  let knownOccurrences = 0

  for (const word of episodeWords) {
    totalOccurrences += word.frequency
    if (lemmaCandidates(word.lemma).some((candidate) => known.has(candidate))) {
      knownOccurrences += word.frequency
    }
  }

  const percentage =
    totalOccurrences === 0
      ? 0
      : Math.round((knownOccurrences / totalOccurrences) * 100)

  return {
    episodeId: input.episodeId,
    percentage,
    knownOccurrences,
    totalOccurrences,
    knownLexemeCount: known.size,
    threshold: 0.8,
  }
}
