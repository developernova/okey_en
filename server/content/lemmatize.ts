import lemmatizer from "wink-lemmatizer"

export function lemmaCandidates(token: string) {
  const normalized = token.toLocaleLowerCase("en")
  return [
    normalized,
    lemmatizer.verb(normalized),
    lemmatizer.noun(normalized),
    lemmatizer.adjective(normalized),
  ].filter((value, index, all) => value && all.indexOf(value) === index)
}
