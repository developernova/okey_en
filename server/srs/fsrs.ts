import {
  createEmptyCard,
  fsrs,
  Rating,
  type Card,
  type CardInput,
} from "ts-fsrs"

type StoredCard = {
  due: Date
  stability: number
  difficulty: number
  scheduledDays: number
  learningSteps: number
  reps: number
  lapses: number
  state: number
  lastReview: Date | null
}

export type ReviewRating = "again" | "hard" | "good"

const scheduler = fsrs({
  request_retention: 0.9,
  maximum_interval: 36_500,
  enable_fuzz: true,
  enable_short_term: true,
})

function toFsrsCard(card: StoredCard): CardInput {
  return {
    due: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.lastReview
      ? Math.max(
          0,
          Math.floor((Date.now() - card.lastReview.getTime()) / 86_400_000)
        )
      : 0,
    scheduled_days: card.scheduledDays,
    learning_steps: card.learningSteps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.lastReview,
  }
}

function mapRating(rating: ReviewRating) {
  if (rating === "again") return Rating.Again
  if (rating === "hard") return Rating.Hard
  return Rating.Good
}

export function newFsrsCard(now = new Date()): Card {
  return createEmptyCard(now)
}

export function reviewFsrsCard(
  storedCard: StoredCard,
  rating: ReviewRating,
  now = new Date()
) {
  return scheduler.next(toFsrsCard(storedCard), now, mapRating(rating))
}

export function retrievability(storedCard: StoredCard, now = new Date()) {
  if (storedCard.reps === 0) return 0
  return scheduler.get_retrievability(toFsrsCard(storedCard), now, false)
}
