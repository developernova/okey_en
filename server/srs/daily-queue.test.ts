import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, it } from "vitest"

import { newCardEligibilityCondition } from "./daily-queue"

describe("new card eligibility", () => {
  it("keeps target-level new cards eligible when the queue is capped", () => {
    const query = new PgDialect().sqlToQuery(
      newCardEligibilityCondition(["A2", "B1"], new Date(1))
    )

    expect(query.sql).toContain('"phrases"."cefr" in ($1, $2)')
    expect(query.params.slice(0, 2)).toEqual(["A2", "B1"])
  })
})
