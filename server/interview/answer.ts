const nonAnswerPatterns = [
  /^yes$/,
  /^no$/,
  /^maybe$/,
  /^idk$/,
  /^no idea$/,
  /^i (?:do not|don't) (?:know|remember)(?: it| this| that)?$/,
]

export function isSubstantiveInterviewAnswer(value: string) {
  const normalized = value
    .trim()
    .toLocaleLowerCase("en")
    .replace(/[’]/g, "'")
    .replace(/[^a-z'\s-]/g, " ")
    .replace(/\s+/g, " ")

  if (nonAnswerPatterns.some((pattern) => pattern.test(normalized))) {
    return false
  }

  return (normalized.match(/[a-z]+(?:'[a-z]+)?/g) ?? []).length >= 2
}
