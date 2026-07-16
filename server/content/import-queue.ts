import { randomUUID } from "node:crypto"

import {
  and,
  asc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm"

import { getDb } from "@/db"
import { episodes, ingestionJobs } from "@/db/schema"
import { env } from "@/server/config/env"
import {
  IMPORT_PROMPT_VERSION,
  importEpisode,
  MAX_IMPORT_ATTEMPTS,
  retryableImportError,
} from "@/server/content/import-episode"
import {
  importEpisodeSchema,
  type ImportEpisodeInput,
} from "@/server/content/types"
import { extractYoutubeId } from "@/server/content/youtube-transcript"
import { AppError } from "@/server/shared/errors"

type QueueMetadata = {
  batchId: string
  position: number
  videoId: string
  importInput: ImportEpisodeInput
}

const workerGlobal = globalThis as typeof globalThis & {
  okeyEnglishImportWorker?: Promise<void>
  okeyEnglishImportWorkerTimer?: ReturnType<typeof setTimeout>
  okeyEnglishImportWorkerTimerAt?: number
}

export const MAX_IMPORT_BATCH_SIZE = 500

export function uniqueImportInputs(inputs: ImportEpisodeInput[]) {
  const uniqueInputs = new Map<
    string,
    { input: ImportEpisodeInput; position: number }
  >()

  for (const [position, input] of inputs.entries()) {
    const videoId = extractYoutubeId(input.youtubeUrl)
    if (!videoId) {
      throw new AppError(
        "Invalid YouTube URL or video id",
        400,
        "INVALID_YOUTUBE_URL"
      )
    }
    if (!uniqueInputs.has(videoId)) {
      uniqueInputs.set(videoId, { input, position })
    }
  }

  return uniqueInputs
}

export function availableImportInputs(
  inputs: ReturnType<typeof uniqueImportInputs>,
  unavailableIds: ReadonlySet<string>
) {
  return [...inputs.entries()].filter(
    ([videoId]) => !unavailableIds.has(videoId)
  )
}

export function shouldStopImportDrain(error: unknown) {
  return retryableImportError(error)?.queueBlocking === true
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
  const uniqueInputs = uniqueImportInputs(inputs)

  const videoIds = [...uniqueInputs.keys()]
  const [storedEpisodes, activeJobs] = await Promise.all([
    db
      .select({ youtubeId: episodes.youtubeId })
      .from(episodes)
      .where(inArray(episodes.youtubeId, videoIds)),
    db
      .select({ youtubeId: ingestionJobs.youtubeId })
      .from(ingestionJobs)
      .where(
        and(
          inArray(ingestionJobs.youtubeId, videoIds),
          inArray(ingestionJobs.status, ["pending", "processing"])
        )
      ),
  ])
  const unavailableIds = new Set([
    ...storedEpisodes.map((episode) => episode.youtubeId),
    ...activeJobs.map((job) => job.youtubeId),
  ])
  const queuedInputs = availableImportInputs(uniqueInputs, unavailableIds)

  if (queuedInputs.length === 0) {
    return {
      batchId,
      queued: 0,
      skipped: inputs.length,
      skippedVideoIds: [...uniqueInputs.keys()],
    }
  }

  const rows = await db
    .insert(ingestionJobs)
    .values(
      queuedInputs.map(([videoId, { input, position }]) => {
        return {
          youtubeId: videoId,
          status: "pending" as const,
          model: env().OPENAI_TEXT_MODEL,
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
    .onConflictDoNothing()
    .returning({ id: ingestionJobs.id, youtubeId: ingestionJobs.youtubeId })

  const queuedIds = new Set(rows.map((row) => row.youtubeId))

  return {
    batchId,
    queued: rows.length,
    skipped: inputs.length - rows.length,
    skippedVideoIds: videoIds.filter((videoId) => !queuedIds.has(videoId)),
  }
}

async function claimNextImport() {
  const db = getDb()

  while (true) {
    const [candidate] = await db
      .select({
        id: ingestionJobs.id,
        metadata: ingestionJobs.metadata,
        attemptCount: ingestionJobs.attemptCount,
      })
      .from(ingestionJobs)
      .where(
        and(
          eq(ingestionJobs.status, "pending"),
          sql`${ingestionJobs.metadata} ? 'importInput'`,
          or(
            isNull(ingestionJobs.nextAttemptAt),
            lte(ingestionJobs.nextAttemptAt, new Date())
          )
        )
      )
      .orderBy(asc(ingestionJobs.createdAt))
      .limit(1)
    if (!candidate) return null

    if (candidate.attemptCount >= MAX_IMPORT_ATTEMPTS) {
      await db
        .update(ingestionJobs)
        .set({
          status: "failed",
          error: "Import stopped after the maximum number of attempts",
          nextAttemptAt: null,
          finishedAt: new Date(),
        })
        .where(
          and(
            eq(ingestionJobs.id, candidate.id),
            eq(ingestionJobs.status, "pending")
          )
        )
      continue
    }

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
      .set({
        status: "processing",
        startedAt: new Date(),
        nextAttemptAt: null,
        error: null,
        attemptCount: sql`${ingestionJobs.attemptCount} + 1`,
      })
      .where(
        and(
          eq(ingestionJobs.id, candidate.id),
          eq(ingestionJobs.status, "pending"),
          lt(ingestionJobs.attemptCount, MAX_IMPORT_ATTEMPTS)
        )
      )
      .returning({ id: ingestionJobs.id })
    if (claimed) return { id: claimed.id, input: metadata.importInput }
  }
}

async function scheduleNextPendingImport() {
  const [next] = await getDb()
    .select({ nextAttemptAt: ingestionJobs.nextAttemptAt })
    .from(ingestionJobs)
    .where(
      and(
        eq(ingestionJobs.status, "pending"),
        isNotNull(ingestionJobs.nextAttemptAt),
        sql`${ingestionJobs.metadata} ? 'importInput'`
      )
    )
    .orderBy(asc(ingestionJobs.nextAttemptAt))
    .limit(1)
  if (!next?.nextAttemptAt) return

  const runAt = next.nextAttemptAt.getTime()
  if (
    workerGlobal.okeyEnglishImportWorkerTimer &&
    (workerGlobal.okeyEnglishImportWorkerTimerAt ?? Infinity) <= runAt
  ) {
    return
  }
  if (workerGlobal.okeyEnglishImportWorkerTimer) {
    clearTimeout(workerGlobal.okeyEnglishImportWorkerTimer)
  }

  const delay = Math.max(250, Math.min(runAt - Date.now(), 2_147_483_647))
  workerGlobal.okeyEnglishImportWorkerTimerAt = runAt
  workerGlobal.okeyEnglishImportWorkerTimer = setTimeout(() => {
    workerGlobal.okeyEnglishImportWorkerTimer = undefined
    workerGlobal.okeyEnglishImportWorkerTimerAt = undefined
    void startImportWorker()
  }, delay)
  workerGlobal.okeyEnglishImportWorkerTimer.unref?.()
}

async function pausePendingImportsAfterRateLimit() {
  const resumeAt = new Date(Date.now() + 10 * 60_000)
  await getDb()
    .update(ingestionJobs)
    .set({
      nextAttemptAt: sql`greatest(coalesce(${ingestionJobs.nextAttemptAt}, ${resumeAt}), ${resumeAt})`,
    })
    .where(
      and(
        eq(ingestionJobs.status, "pending"),
        sql`${ingestionJobs.metadata} ? 'importInput'`
      )
    )
}

async function drainImportQueue() {
  while (true) {
    const job = await claimNextImport()
    if (!job) {
      await scheduleNextPendingImport()
      return
    }
    try {
      await importEpisode(job.input, { existingJobId: job.id })
    } catch (error) {
      console.error("Background episode import failed", error)
      if (shouldStopImportDrain(error)) {
        await pausePendingImportsAfterRateLimit()
        await scheduleNextPendingImport()
        return
      }
    }

    // Keep YouTube transcript requests strictly sequential and gentle.
    await new Promise((resolve) => setTimeout(resolve, 1_500))
  }
}

async function recoverStaleImports() {
  const staleBefore = new Date(Date.now() - 60 * 60 * 1_000)
  const db = getDb()
  await db
    .update(ingestionJobs)
    .set({
      status: "failed",
      error: "Import worker stopped after the maximum number of attempts",
      nextAttemptAt: null,
      finishedAt: new Date(),
    })
    .where(
      and(
        eq(ingestionJobs.status, "processing"),
        lt(ingestionJobs.startedAt, staleBefore),
        sql`${ingestionJobs.attemptCount} >= ${MAX_IMPORT_ATTEMPTS}`,
        sql`${ingestionJobs.metadata} ? 'importInput'`
      )
    )
  await db
    .update(ingestionJobs)
    .set({ status: "pending", startedAt: null, error: null })
    .where(
      and(
        eq(ingestionJobs.status, "processing"),
        lt(ingestionJobs.startedAt, staleBefore),
        lt(ingestionJobs.attemptCount, MAX_IMPORT_ATTEMPTS),
        sql`${ingestionJobs.metadata} ? 'importInput'`
      )
    )
}

export function startImportWorker() {
  if (workerGlobal.okeyEnglishImportWorker) {
    return workerGlobal.okeyEnglishImportWorker
  }
  if (workerGlobal.okeyEnglishImportWorkerTimer) {
    clearTimeout(workerGlobal.okeyEnglishImportWorkerTimer)
    workerGlobal.okeyEnglishImportWorkerTimer = undefined
    workerGlobal.okeyEnglishImportWorkerTimerAt = undefined
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
      attemptCount: ingestionJobs.attemptCount,
      nextAttemptAt: ingestionJobs.nextAttemptAt,
      totalTokens: ingestionJobs.totalTokens,
      costUsd: ingestionJobs.costUsd,
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
        attemptCount: row.attemptCount,
        nextAttemptAt: row.nextAttemptAt,
        totalTokens: row.totalTokens,
        costUsd: row.costUsd,
      }
    })
    .filter((job): job is NonNullable<typeof job> => job !== null)
    .sort((left, right) => left.position - right.position)

  const pending = jobs.filter((job) => job.status === "pending").length
  const processing = jobs.filter((job) => job.status === "processing").length
  const ready = jobs.filter((job) => job.status === "ready").length
  const failed = jobs.filter((job) => job.status === "failed").length
  const totalTokens = jobs.reduce((sum, job) => sum + job.totalTokens, 0)
  const costUsd = jobs.reduce((sum, job) => sum + job.costUsd, 0)

  return {
    batchId,
    total: jobs.length,
    completed: ready + failed,
    pending,
    processing,
    ready,
    failed,
    totalTokens,
    costUsd,
    jobs,
  }
}
