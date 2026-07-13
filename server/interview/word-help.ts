import { and, asc, eq, ilike, sql } from "drizzle-orm"

import { getDb } from "@/db"
import {
  lexemes,
  phrases,
  transcriptSegments,
  userCards,
  userLexemes,
  users,
} from "@/db/schema"
import {
  findQuestionGloss,
  type InterviewQuestion,
} from "@/server/interview/question"
import { INTERVIEW_WORD_RATIONALE } from "@/server/interview/constants"
import { normalizePhrase } from "@/server/content/text"
import { AppError } from "@/server/shared/errors"
import { newFsrsCard } from "@/server/srs/fsrs"

export async function prioritizeInterviewWord(input: {
  userId: string
  episodeId: string
  question: InterviewQuestion
  word: string
  now?: Date
}) {
  const gloss = findQuestionGloss(input.question, input.word)
  if (!gloss) {
    throw new AppError(
      "Word is not part of this interview question",
      400,
      "INTERVIEW_WORD_NOT_FOUND"
    )
  }

  const normalizedWord = normalizePhrase(gloss.word)
  const normalizedLemma = normalizePhrase(gloss.lemma)
  if (!normalizedWord || !normalizedLemma) {
    throw new AppError("Invalid interview word", 400, "INVALID_INTERVIEW_WORD")
  }

  const db = getDb()
  const now = input.now ?? new Date()
  const priorityDue = new Date(0)

  return db.transaction(async (tx) => {
    const [[user], [lexeme], matchingSegments, firstSegments] =
      await Promise.all([
        tx
          .select({ levelEstimate: users.levelEstimate })
          .from(users)
          .where(eq(users.id, input.userId))
          .limit(1),
        tx
          .select({ cefr: lexemes.cefr })
          .from(lexemes)
          .where(eq(lexemes.lemma, normalizedLemma))
          .limit(1),
        tx
          .select({
            segmentIndex: transcriptSegments.segmentIndex,
            offsetMs: transcriptSegments.offsetMs,
          })
          .from(transcriptSegments)
          .where(
            and(
              eq(transcriptSegments.episodeId, input.episodeId),
              ilike(transcriptSegments.normalizedText, `%${normalizedWord}%`)
            )
          )
          .orderBy(asc(transcriptSegments.segmentIndex))
          .limit(1),
        tx
          .select({
            segmentIndex: transcriptSegments.segmentIndex,
            offsetMs: transcriptSegments.offsetMs,
          })
          .from(transcriptSegments)
          .where(eq(transcriptSegments.episodeId, input.episodeId))
          .orderBy(asc(transcriptSegments.segmentIndex))
          .limit(1),
      ])

    const source = matchingSegments[0] ?? firstSegments[0]
    if (!user || !source) {
      throw new AppError(
        "Interview context not found",
        404,
        "INTERVIEW_CONTEXT_NOT_FOUND"
      )
    }

    let [phrase] = await tx
      .select({ id: phrases.id })
      .from(phrases)
      .where(
        and(
          eq(phrases.episodeId, input.episodeId),
          eq(phrases.normalizedPhrase, normalizedWord)
        )
      )
      .limit(1)

    if (!phrase) {
      ;[phrase] = await tx
        .insert(phrases)
        .values({
          episodeId: input.episodeId,
          phrase: gloss.word,
          normalizedPhrase: normalizedWord,
          lemma: normalizedLemma,
          translationRu: gloss.translationRu,
          contextSentence: input.question.text,
          cefr: lexeme?.cefr ?? user.levelEstimate ?? "A2",
          segmentIndex: source.segmentIndex,
          offsetMs: source.offsetMs,
          confidence: 1,
          rationale: INTERVIEW_WORD_RATIONALE,
          isActive: false,
        })
        .onConflictDoNothing({
          target: [phrases.episodeId, phrases.normalizedPhrase],
        })
        .returning({ id: phrases.id })
    }

    if (!phrase) {
      ;[phrase] = await tx
        .select({ id: phrases.id })
        .from(phrases)
        .where(
          and(
            eq(phrases.episodeId, input.episodeId),
            eq(phrases.normalizedPhrase, normalizedWord)
          )
        )
        .limit(1)
    }
    if (!phrase) {
      throw new AppError(
        "Unable to create an interview card",
        500,
        "INTERVIEW_CARD_NOT_CREATED"
      )
    }

    await tx
      .insert(userLexemes)
      .values({
        userId: input.userId,
        lemma: normalizedLemma,
        source: "manual",
        confidence: 0.1,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [userLexemes.userId, userLexemes.lemma],
        set: {
          source: "manual",
          confidence: sql`least(${userLexemes.confidence}, 0.1)`,
          learnedAt: null,
          updatedAt: now,
        },
      })

    const empty = newFsrsCard(now)
    await tx
      .insert(userCards)
      .values({
        userId: input.userId,
        phraseId: phrase.id,
        due: priorityDue,
        stability: empty.stability,
        difficulty: empty.difficulty,
        scheduledDays: empty.scheduled_days,
        learningSteps: empty.learning_steps,
        reps: empty.reps,
        lapses: empty.lapses,
        state: empty.state,
        isPersonal: true,
      })
      .onConflictDoUpdate({
        target: [userCards.userId, userCards.phraseId],
        set: {
          due: priorityDue,
          isSuspended: false,
          isPersonal: true,
          updatedAt: now,
        },
      })

    return {
      word: gloss.word,
      lemma: normalizedLemma,
      translationRu: gloss.translationRu,
      queued: true as const,
    }
  })
}
