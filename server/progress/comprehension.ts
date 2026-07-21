import { and, eq, ne } from "drizzle-orm"

import { getDb } from "@/db"
import {
  episodeLexemes,
  lexemes,
  phrases,
  userCards,
  userLexemes,
  users,
} from "@/db/schema"
import { lemmaCandidates } from "@/server/content/lemmatize"
import { estimatedLexemeKnowledge } from "@/server/progress/lexical-knowledge"
import { retrievability } from "@/server/srs/fsrs"

export async function calculateComprehension(input: {
  userId: string
  episodeId: string
  now?: Date
}) {
  const db = getDb()
  const now = input.now ?? new Date()
  const [episodeWords, explicitKnowledge, reviewedCards, learner] =
    await Promise.all([
      db
        .select({
          lemma: episodeLexemes.lemma,
          frequency: episodeLexemes.frequency,
          cefr: lexemes.cefr,
        })
        .from(episodeLexemes)
        .leftJoin(lexemes, eq(lexemes.lemma, episodeLexemes.lemma))
        .where(eq(episodeLexemes.episodeId, input.episodeId)),
      db
        .select({
          lemma: userLexemes.lemma,
          confidence: userLexemes.confidence,
        })
        .from(userLexemes)
        .where(
          and(
            eq(userLexemes.userId, input.userId),
            ne(userLexemes.source, "placement_test")
          )
        ),
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
      db
        .select({ levelEstimate: users.levelEstimate })
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1),
    ])

  const explicit = new Map(
    explicitKnowledge.map((item) => [
      item.lemma.toLocaleLowerCase("en"),
      item.confidence,
    ])
  )
  const known = new Set(
    explicitKnowledge
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
  let estimatedOccurrences = 0
  const hasPlacementLevel = Boolean(learner[0]?.levelEstimate)

  for (const word of episodeWords) {
    totalOccurrences += word.frequency
    const candidates = lemmaCandidates(word.lemma)
    if (candidates.some((candidate) => known.has(candidate))) {
      knownOccurrences += word.frequency
      continue
    }

    const explicitConfidence = candidates
      .map((candidate) => explicit.get(candidate))
      .find((confidence) => confidence !== undefined)
    if (explicitConfidence !== undefined) {
      continue
    }

    const estimate = estimatedLexemeKnowledge(
      learner[0]?.levelEstimate,
      word.cefr
    )
    knownOccurrences += word.frequency * estimate
    if (hasPlacementLevel) estimatedOccurrences += word.frequency
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
    isEstimated: estimatedOccurrences > 0,
    isReady:
      totalOccurrences > 0 &&
      (estimatedOccurrences > 0 || knownOccurrences > 0),
    threshold: 0.8,
  }
}
