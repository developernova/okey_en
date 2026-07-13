import { randomUUID } from "node:crypto"

import { and, asc, eq, lt, sql } from "drizzle-orm"

import { getDb } from "@/db"
import { ingestionJobs } from "@/db/schema"
import { env } from "@/server/config/env"
import {
  IMPORT_PROMPT_VERSION,
  importEpisode,
} from "@/server/content/import-episode"
import {
  importEpisodeSchema,
  type ImportEpisodeInput,
} from "@/server/content/types"
import { extractYoutubeId } from "@/server/content/youtube-transcript"

type QueueMetadata = {
  batchId: string
  position: number
  videoId: string
  importInput: ImportEpisodeInput
}

const workerGlobal = globalThis as typeof globalThis & {
  okeyEnglishImportWorker?: Promise<void>
}

function queueMetadata(value: Record<string, unknown>): QueueMetadata | null {
  const parsedInput = importEpisodeSchema.safeParse(value.importInput)
  if (
    typeof value.batchId !== "string" ||
    typeof value.position !== "number" ||
    typeof value.videoId !== "string" ||
    !parsedInput.success
  ) {
    return null
  }
  return {
    batchId: value.batchId,
    position: value.position,
    videoId: value.videoId,
    importInput: parsedInput.data,
  }
}

export async function enqueueImportBatch(inputs: ImportEpisodeInput[]) {
  const db = getDb()
  const batchId = randomUUID()
  const rows = await db
    .insert(ingestionJobs)
    .values(
      inputs.map((input, position) => {
        const videoId = extractYoutubeId(input.youtubeUrl)
        return {
          youtubeId: videoId || input.youtubeUrl.slice(0, 200),
          status: "pending" as const,
          model: env().OPENROUTER_MODEL,
          promptVersion: IMPORT_PROMPT_VERSION,
          metadata: {
            batchId,
            position,
            videoId,
            importInput: input,
          } satisfies QueueMetadata,
        }
      })
    )
    .returning({ id: ingestionJobs.id })

  return { batchId, queued: rows.length }
}

async function claimNextImport() {
  const db = getDb()

  while (true) {
    const [candidate] = await db
      .select({ id: ingestionJobs.id, metadata: ingestionJobs.metadata })
      .from(ingestionJobs)
      .where(
        and(
          eq(ingestionJobs.status, "pending"),
          sql`${ingestionJobs.metadata} ? 'importInput'`
        )
      )
      .orderBy(asc(ingestionJobs.createdAt))
      .limit(1)
    if (!candidate) return null

    const metadata = queueMetadata(candidate.metadata)
    if (!metadata) {
      await db
        .update(ingestionJobs)
        .set({
          status: "failed",
          error: "Invalid queued import payload",
          finishedAt: new Date(),
        })
        .where(eq(ingestionJobs.id, candidate.id))
      continue
    }

    const [claimed] = await db
      .update(ingestionJobs)
      .set({ status: "processing", startedAt: new Date(), error: null })
      .where(
        and(
          eq(ingestionJobs.id, candidate.id),
          eq(ingestionJobs.status, "pending")
        )
      )
      .returning({ id: ingestionJobs.id })
    if (claimed) return { id: claimed.id, input: metadata.importInput }
  }
}

async function drainImportQueue() {
  while (true) {
    const job = await claimNextImport()
    if (!job) return
    try {
      await importEpisode(job.input, { existingJobId: job.id })
    } catch (error) {
      console.error("Background episode import failed", error)
    }

    // Keep YouTube transcript requests strictly sequential and gentle.
    await new Promise((resolve) => setTimeout(resolve, 1_500))
  }
}

async function recoverStaleImports() {
  const staleBefore = new Date(Date.now() - 60 * 60 * 1_000)
  await getDb()
    .update(ingestionJobs)
    .set({ status: "pending", startedAt: null, error: null })
    .where(
      and(
        eq(ingestionJobs.status, "processing"),
        lt(ingestionJobs.startedAt, staleBefore),
        sql`${ingestionJobs.metadata} ? 'importInput'`
      )
    )
}

export function startImportWorker() {
  if (workerGlobal.okeyEnglishImportWorker) {
    return workerGlobal.okeyEnglishImportWorker
  }

  const work = recoverStaleImports()
    .then(() => drainImportQueue())
    .catch((error) => {
      console.error("Background import worker stopped", error)
    })
  workerGlobal.okeyEnglishImportWorker = work
  void work.finally(() => {
    if (workerGlobal.okeyEnglishImportWorker === work) {
      workerGlobal.okeyEnglishImportWorker = undefined
    }
  })
  return work
}

export async function getImportBatch(batchId: string) {
  const rows = await getDb()
    .select({
      id: ingestionJobs.id,
      status: ingestionJobs.status,
      error: ingestionJobs.error,
      metadata: ingestionJobs.metadata,
    })
    .from(ingestionJobs)
    .where(sql`${ingestionJobs.metadata}->>'batchId' = ${batchId}`)
    .orderBy(asc(ingestionJobs.createdAt))

  const jobs = rows
    .map((row) => {
      const metadata = queueMetadata(row.metadata)
      if (!metadata) return null
      return {
        id: row.id,
        videoId: metadata.videoId,
        position: metadata.position,
        status: row.status,
        error: row.error,
      }
    })
    .filter((job): job is NonNullable<typeof job> => job !== null)
    .sort((left, right) => left.position - right.position)

  const pending = jobs.filter((job) => job.status === "pending").length
  const processing = jobs.filter((job) => job.status === "processing").length
  const ready = jobs.filter((job) => job.status === "ready").length
  const failed = jobs.filter((job) => job.status === "failed").length

  return {
    batchId,
    total: jobs.length,
    completed: ready + failed,
    pending,
    processing,
    ready,
    failed,
    jobs,
  }
}
