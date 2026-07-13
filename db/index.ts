import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"

import * as schema from "@/db/schema"
import { env } from "@/server/config/env"

let client: ReturnType<typeof postgres> | undefined
let database: ReturnType<typeof drizzle<typeof schema>> | undefined

export function getDb() {
  if (!database) {
    client = postgres(env().DATABASE_URL, {
      max: process.env.NODE_ENV === "production" ? 10 : 1,
      prepare: false,
    })
    database = drizzle(client, { schema })
  }

  return database
}

export type Database = ReturnType<typeof getDb>
