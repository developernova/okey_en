import { readFile } from "node:fs/promises"

import postgres from "postgres"

const [, , csvPath] = process.argv
if (!csvPath) {
  throw new Error("Usage: npm run lexicon:import -- path/to/oxford-3000.csv")
}
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required")
}

const content = await readFile(csvPath, "utf8")
const rows = content
  .trim()
  .split(/\r?\n/)
  .slice(1)
  .map((line) => {
    const separator = line.lastIndexOf(",")
    return {
      lemma: line.slice(0, separator).replace(/^"|"$/g, "").trim(),
      cefr: line.slice(separator + 1).trim(),
      is_oxford_3000: true,
    }
  })
  .filter((row) => row.lemma && /^(A1|A2|B1|B2)$/.test(row.cefr))

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false })
try {
  await sql.begin(async (transaction) => {
    for (let index = 0; index < rows.length; index += 500) {
      const batch = rows.slice(index, index + 500)
      await transaction`
        insert into lexemes ${transaction(batch, "lemma", "cefr", "is_oxford_3000")}
        on conflict (lemma) do update set
          cefr = excluded.cefr,
          is_oxford_3000 = true
      `
    }
  })
  console.log(`Imported ${rows.length} Oxford 3000 headwords`)
} finally {
  await sql.end()
}
