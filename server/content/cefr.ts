export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const

export type CefrLevel = (typeof CEFR_LEVELS)[number]

export function cefrRange(levels: readonly string[]) {
  const indexes = levels
    .map((level) => CEFR_LEVELS.indexOf(level as CefrLevel))
    .filter((index) => index >= 0)

  if (indexes.length === 0) return null

  return {
    min: CEFR_LEVELS[Math.min(...indexes)],
    max: CEFR_LEVELS[Math.max(...indexes)],
  }
}
