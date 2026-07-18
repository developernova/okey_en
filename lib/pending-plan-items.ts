import { telegramFetch } from "@/lib/telegram"

export type PendingPlanItem = {
  planId: string
  episodeId: string
  type: "review"
}

export type PendingPlanItemResult = {
  status: "not_started" | "supporting" | "complete" | "skipped"
  completedItems: Array<"watch" | "review" | "retell">
}

const storageKey = "okey-english:pending-plan-items:v1"
const discardableStatuses = new Set([400, 404, 410, 422])
const MAX_REQUEST_MS = 3_000

function storage() {
  if (typeof window === "undefined") return undefined
  return window.localStorage
}

export function getPendingPlanItems(): PendingPlanItem[] {
  const target = storage()
  if (!target) return []
  try {
    const value: unknown = JSON.parse(target.getItem(storageKey) ?? "[]")
    if (!Array.isArray(value)) return []
    return value.filter(
      (item): item is PendingPlanItem =>
        typeof item === "object" &&
        item !== null &&
        typeof item.planId === "string" &&
        typeof item.episodeId === "string" &&
        item.type === "review"
    )
  } catch {
    return []
  }
}

export function enqueuePendingPlanItem(item: PendingPlanItem) {
  const pending = getPendingPlanItems().filter(
    (stored) => !(stored.planId === item.planId && stored.type === item.type)
  )
  storage()?.setItem(storageKey, JSON.stringify([...pending, item]))
}

function removePendingPlanItem(item: PendingPlanItem) {
  storage()?.setItem(
    storageKey,
    JSON.stringify(
      getPendingPlanItems().filter(
        (stored) =>
          !(stored.planId === item.planId && stored.type === item.type)
      )
    )
  )
}

export async function flushPendingPlanItems() {
  const saved: Array<{
    item: PendingPlanItem
    result: PendingPlanItemResult
  }> = []
  const stale: PendingPlanItem[] = []
  let discarded = 0

  for (const item of getPendingPlanItems()) {
    let response: Response
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), MAX_REQUEST_MS)
    try {
      response = await telegramFetch("/api/daily-plan/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item),
        signal: controller.signal,
      })
    } catch {
      break
    } finally {
      clearTimeout(timeout)
    }

    const payload = (await response.json().catch(() => null)) as {
      data?: PendingPlanItemResult
    } | null

    if (response.ok && payload?.data) {
      removePendingPlanItem(item)
      saved.push({ item, result: payload.data })
      continue
    }

    if (response.status === 409) {
      removePendingPlanItem(item)
      stale.push(item)
      continue
    }

    if (discardableStatuses.has(response.status)) {
      removePendingPlanItem(item)
      discarded += 1
      continue
    }

    break
  }

  return {
    saved,
    stale,
    discarded,
    remaining: getPendingPlanItems().length,
  }
}
