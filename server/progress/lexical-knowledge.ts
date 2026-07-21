import { CEFR_LEVELS, type CefrLevel } from "@/server/content/cefr"

const probabilityByDistance = new Map<number, number>([
  [-5, 0.01],
  [-4, 0.02],
  [-3, 0.04],
  [-2, 0.08],
  [-1, 0.25],
  [0, 0.72],
  [1, 0.9],
  [2, 0.97],
  [3, 0.99],
  [4, 0.99],
  [5, 0.99],
])

export function estimatedLexemeKnowledge(
  learnerLevel: string | null | undefined,
  lexemeLevel: string | null | undefined
) {
  const learnerIndex = CEFR_LEVELS.indexOf(learnerLevel as CefrLevel)
  const lexemeIndex = CEFR_LEVELS.indexOf(lexemeLevel as CefrLevel)
  if (learnerIndex < 0 || lexemeIndex < 0) return 0
  return probabilityByDistance.get(learnerIndex - lexemeIndex) ?? 0
}

export function frequencyWeightedEstimatedCoverage(
  items: Array<{ frequency: number; cefr: string | null }>,
  learnerLevel: string | null | undefined
) {
  const total = items.reduce((sum, item) => sum + item.frequency, 0)
  if (total === 0) return 0

  const estimatedKnown = items.reduce(
    (sum, item) =>
      sum + item.frequency * estimatedLexemeKnowledge(learnerLevel, item.cefr),
    0
  )
  return Math.round((estimatedKnown / total) * 100)
}
