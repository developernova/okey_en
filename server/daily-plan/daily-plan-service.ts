import { and, asc, eq, gt, inArray, isNull, lt, ne, or } from "drizzle-orm"

import { getDb } from "@/db"
import {
  dailyPlanItems,
  dailyPlans,
  episodes,
  interviewSessions,
  pendingProgramSwitches,
  phrases,
  programs,
  reviewLogs,
  userCards,
  userProgramProgress,
  users,
} from "@/db/schema"
import { dateInTimezone } from "@/server/interview/rate-limit"
import { AppError } from "@/server/shared/errors"
import { calendarDayGap } from "@/server/shared/timezone"
import {
  assignedCardIdsFromMetadata,
  hasReviewAssignment,
  noCardsReviewCompletionMetadata,
  userReviewCompletionMetadata,
} from "@/server/today/review-step"

export type DailyPlanItemType = "watch" | "review" | "retell"
const itemTypes: DailyPlanItemType[] = ["watch", "review", "retell"]

function metadataRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {}
}

type DailyPlanIdentity = {
  id: string
  planDate: string
  episodeId: string | null
}

export function assertCurrentDailyPlanIdentity<
  T extends DailyPlanIdentity,
>(input: {
  plan: T | undefined
  requestedPlanId: string
  requestedEpisodeId: string
  currentPlanDate: string
}): T {
  if (
    !input.plan ||
    input.plan.id !== input.requestedPlanId ||
    input.plan.planDate !== input.currentPlanDate
  ) {
    throw new AppError(
      "Daily plan is no longer current",
      409,
      "DAILY_PLAN_STALE"
    )
  }

  if (input.plan.episodeId !== input.requestedEpisodeId) {
    throw new AppError(
      "Episode does not belong to the requested daily plan",
      409,
      "DAILY_PLAN_EPISODE_MISMATCH"
    )
  }

  return input.plan
}

export function dailyReviewCompletionMetadata(input: {
  eligibleCardIds: string[]
  reviewedCardIds: string[]
}) {
  const reviewedIds = new Set(input.reviewedCardIds)
  const remainingIds = input.eligibleCardIds.filter(
    (cardId) => !reviewedIds.has(cardId)
  )
  if (remainingIds.length > 0) {
    throw new AppError(
      "Not all assigned review cards have been rated",
      409,
      "DAILY_REVIEW_INCOMPLETE",
      { remainingCount: remainingIds.length }
    )
  }
  return reviewedIds.size === 0
    ? noCardsReviewCompletionMetadata
    : userReviewCompletionMetadata(reviewedIds.size)
}

export async function snapshotDailyReturnGap(userId: string, now = new Date()) {
  const db = getDb()

  return db.transaction(async (tx) => {
    const [user] = await tx
      .select({
        timezone: users.timezone,
        lastActiveAt: users.lastActiveAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .for("update")
      .limit(1)
    if (!user) throw new AppError("User not found", 404, "USER_NOT_FOUND")

    const planDate = dateInTimezone(now, user.timezone)
    const [existing] = await tx
      .select({ returnGapDays: dailyPlans.returnGapDays })
      .from(dailyPlans)
      .where(
        and(eq(dailyPlans.userId, userId), eq(dailyPlans.planDate, planDate))
      )
      .limit(1)
    if (existing) return existing.returnGapDays

    const returnGapDays = calendarDayGap(user.lastActiveAt, now, user.timezone)
    const [plan] = await tx
      .insert(dailyPlans)
      .values({
        userId,
        planDate,
        returnGapDays,
      })
      .returning({ id: dailyPlans.id })
    await tx
      .delete(interviewSessions)
      .where(
        and(
          eq(interviewSessions.userId, userId),
          ne(interviewSessions.dailyPlanId, plan.id)
        )
      )
    return returnGapDays
  })
}

export async function getOrCreateDailyPlan(userId: string, now = new Date()) {
  const db = getDb()

  return db.transaction(async (tx) => {
    const [user] = await tx
      .select({
        timezone: users.timezone,
        lastActiveAt: users.lastActiveAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .for("update")
      .limit(1)
    if (!user) throw new AppError("User not found", 404, "USER_NOT_FOUND")

    const planDate = dateInTimezone(now, user.timezone)
    const [storedPlan] = await tx
      .select({
        planId: dailyPlans.id,
        status: dailyPlans.status,
        completedAt: dailyPlans.completedAt,
        returnGapDays: dailyPlans.returnGapDays,
        episodeId: dailyPlans.episodeId,
      })
      .from(dailyPlans)
      .where(
        and(eq(dailyPlans.userId, userId), eq(dailyPlans.planDate, planDate))
      )
      .limit(1)

    const [storedEpisode] = storedPlan?.episodeId
      ? await tx
          .select({
            episodeId: episodes.id,
            youtubeId: episodes.youtubeId,
            episodeTitle: episodes.title,
            durationSeconds: episodes.durationSeconds,
            sequenceNumber: episodes.sequenceNumber,
            programId: programs.id,
            programTitle: programs.title,
          })
          .from(episodes)
          .innerJoin(programs, eq(programs.id, episodes.programId))
          .where(eq(episodes.id, storedPlan.episodeId))
          .limit(1)
      : []
    const existing =
      storedPlan && storedEpisode
        ? {
            planId: storedPlan.planId,
            status: storedPlan.status,
            completedAt: storedPlan.completedAt,
            returnGapDays: storedPlan.returnGapDays,
            ...storedEpisode,
          }
        : null

    if (storedPlan?.episodeId && !existing) {
      throw new AppError(
        "Daily plan episode not found",
        409,
        "DAILY_PLAN_EPISODE_NOT_FOUND"
      )
    }

    if (existing) {
      await tx
        .delete(interviewSessions)
        .where(
          and(
            eq(interviewSessions.userId, userId),
            ne(interviewSessions.dailyPlanId, existing.planId)
          )
        )
      await tx
        .insert(dailyPlanItems)
        .values(
          itemTypes.map((type) => ({ dailyPlanId: existing.planId, type }))
        )
        .onConflictDoNothing({
          target: [dailyPlanItems.dailyPlanId, dailyPlanItems.type],
        })
      const items = await tx
        .select({
          type: dailyPlanItems.type,
          completedAt: dailyPlanItems.completedAt,
        })
        .from(dailyPlanItems)
        .where(eq(dailyPlanItems.dailyPlanId, existing.planId))
      return {
        ...existing,
        planDate,
        timezone: user.timezone,
        completedItems: items
          .filter((item) => item.completedAt !== null)
          .map((item) => item.type),
      }
    }

    /* A review replay can create a plan shell before content is available.
       From this point on we attach today's episode to that frozen snapshot. */

    const [pendingSwitch] = await tx
      .select({ programId: pendingProgramSwitches.programId })
      .from(pendingProgramSwitches)
      .where(eq(pendingProgramSwitches.userId, userId))
      .limit(1)

    if (pendingSwitch) {
      let [targetEpisode] = await tx
        .select({ episodeId: episodes.id })
        .from(userProgramProgress)
        .innerJoin(
          episodes,
          eq(episodes.id, userProgramProgress.currentEpisodeId)
        )
        .where(
          and(
            eq(userProgramProgress.userId, userId),
            eq(userProgramProgress.programId, pendingSwitch.programId),
            eq(episodes.ingestionStatus, "ready"),
            eq(episodes.isActive, true)
          )
        )
        .limit(1)

      if (!targetEpisode) {
        ;[targetEpisode] = await tx
          .select({ episodeId: episodes.id })
          .from(episodes)
          .where(
            and(
              eq(episodes.programId, pendingSwitch.programId),
              eq(episodes.ingestionStatus, "ready"),
              eq(episodes.isActive, true)
            )
          )
          .orderBy(asc(episodes.sequenceNumber))
          .limit(1)
      }

      if (targetEpisode) {
        await tx
          .update(userProgramProgress)
          .set({ isActive: false, updatedAt: now })
          .where(eq(userProgramProgress.userId, userId))
        await tx
          .insert(userProgramProgress)
          .values({
            userId,
            programId: pendingSwitch.programId,
            currentEpisodeId: targetEpisode.episodeId,
            isActive: true,
          })
          .onConflictDoUpdate({
            target: [userProgramProgress.userId, userProgramProgress.programId],
            set: {
              currentEpisodeId: targetEpisode.episodeId,
              isActive: true,
              updatedAt: now,
            },
          })
        await tx
          .delete(pendingProgramSwitches)
          .where(eq(pendingProgramSwitches.userId, userId))
      }
    }

    let [current] = await tx
      .select({
        episodeId: episodes.id,
        youtubeId: episodes.youtubeId,
        episodeTitle: episodes.title,
        durationSeconds: episodes.durationSeconds,
        sequenceNumber: episodes.sequenceNumber,
        programId: programs.id,
        programTitle: programs.title,
      })
      .from(userProgramProgress)
      .innerJoin(programs, eq(programs.id, userProgramProgress.programId))
      .innerJoin(
        episodes,
        eq(episodes.id, userProgramProgress.currentEpisodeId)
      )
      .where(
        and(
          eq(userProgramProgress.userId, userId),
          eq(userProgramProgress.isActive, true),
          eq(episodes.ingestionStatus, "ready"),
          eq(episodes.isActive, true)
        )
      )
      .limit(1)

    if (!current) {
      ;[current] = await tx
        .select({
          episodeId: episodes.id,
          youtubeId: episodes.youtubeId,
          episodeTitle: episodes.title,
          durationSeconds: episodes.durationSeconds,
          sequenceNumber: episodes.sequenceNumber,
          programId: programs.id,
          programTitle: programs.title,
        })
        .from(episodes)
        .innerJoin(programs, eq(programs.id, episodes.programId))
        .where(
          and(
            eq(episodes.ingestionStatus, "ready"),
            eq(episodes.isActive, true),
            eq(programs.isActive, true)
          )
        )
        .orderBy(asc(episodes.sequenceNumber))
        .limit(1)
      if (!current) {
        throw new AppError("No ready episodes", 404, "NO_READY_EPISODES")
      }
      await tx
        .update(userProgramProgress)
        .set({ isActive: false, updatedAt: now })
        .where(eq(userProgramProgress.userId, userId))
      await tx
        .insert(userProgramProgress)
        .values({
          userId,
          programId: current.programId,
          currentEpisodeId: current.episodeId,
          isActive: true,
        })
        .onConflictDoUpdate({
          target: [userProgramProgress.userId, userProgramProgress.programId],
          set: {
            currentEpisodeId: current.episodeId,
            isActive: true,
            updatedAt: now,
          },
        })
    }

    const [previousCompletion] = await tx
      .select({ id: dailyPlans.id })
      .from(dailyPlans)
      .where(
        and(
          eq(dailyPlans.userId, userId),
          eq(dailyPlans.episodeId, current.episodeId),
          eq(dailyPlans.status, "complete"),
          lt(dailyPlans.planDate, planDate)
        )
      )
      .limit(1)

    if (previousCompletion) {
      const [next] = await tx
        .select({
          episodeId: episodes.id,
          youtubeId: episodes.youtubeId,
          episodeTitle: episodes.title,
          durationSeconds: episodes.durationSeconds,
          sequenceNumber: episodes.sequenceNumber,
          programId: programs.id,
          programTitle: programs.title,
        })
        .from(episodes)
        .innerJoin(programs, eq(programs.id, episodes.programId))
        .where(
          and(
            eq(episodes.programId, current.programId),
            eq(episodes.ingestionStatus, "ready"),
            eq(episodes.isActive, true),
            gt(episodes.sequenceNumber, current.sequenceNumber)
          )
        )
        .orderBy(asc(episodes.sequenceNumber))
        .limit(1)
      if (next) {
        current = next
        await tx
          .update(userProgramProgress)
          .set({ currentEpisodeId: next.episodeId, updatedAt: now })
          .where(
            and(
              eq(userProgramProgress.userId, userId),
              eq(userProgramProgress.programId, next.programId)
            )
          )
      }
    }

    const returnGapDays =
      storedPlan?.returnGapDays ??
      calendarDayGap(user.lastActiveAt, now, user.timezone)
    const [plan] = storedPlan
      ? await tx
          .update(dailyPlans)
          .set({ episodeId: current.episodeId })
          .where(eq(dailyPlans.id, storedPlan.planId))
          .returning({ id: dailyPlans.id })
      : await tx
          .insert(dailyPlans)
          .values({
            userId,
            planDate,
            episodeId: current.episodeId,
            returnGapDays,
          })
          .returning({ id: dailyPlans.id })
    await tx
      .delete(interviewSessions)
      .where(
        and(
          eq(interviewSessions.userId, userId),
          ne(interviewSessions.dailyPlanId, plan.id)
        )
      )
    await tx
      .insert(dailyPlanItems)
      .values(
        itemTypes.map((type) => ({
          dailyPlanId: plan.id,
          type,
        }))
      )
      .onConflictDoNothing({
        target: [dailyPlanItems.dailyPlanId, dailyPlanItems.type],
      })

    return {
      planId: plan.id,
      planDate,
      status: storedPlan?.status ?? ("not_started" as const),
      completedAt: storedPlan?.completedAt ?? null,
      completedItems: [],
      returnGapDays,
      timezone: user.timezone,
      ...current,
    }
  })
}

export async function completeDailyPlanItem(input: {
  userId: string
  planId: string
  type: DailyPlanItemType
  episodeId: string
  completionMetadata?: Record<string, unknown>
  now?: Date
}) {
  const now = input.now ?? new Date()
  const db = getDb()
  return db.transaction(async (tx) => {
    const [user] = await tx
      .select({ timezone: users.timezone })
      .from(users)
      .where(eq(users.id, input.userId))
      .for("update")
      .limit(1)
    if (!user) throw new AppError("User not found", 404, "USER_NOT_FOUND")

    const currentPlanDate = dateInTimezone(now, user.timezone)
    const [storedPlan] = await tx
      .select({
        id: dailyPlans.id,
        planDate: dailyPlans.planDate,
        status: dailyPlans.status,
        episodeId: dailyPlans.episodeId,
      })
      .from(dailyPlans)
      .where(
        and(
          eq(dailyPlans.id, input.planId),
          eq(dailyPlans.userId, input.userId)
        )
      )
      .for("update")
      .limit(1)

    const currentPlan = assertCurrentDailyPlanIdentity({
      plan: storedPlan,
      requestedPlanId: input.planId,
      requestedEpisodeId: input.episodeId,
      currentPlanDate,
    })

    const [planEpisode] = await tx
      .select({
        id: episodes.id,
        programId: episodes.programId,
        sequenceNumber: episodes.sequenceNumber,
      })
      .from(episodes)
      .where(eq(episodes.id, input.episodeId))
      .limit(1)
    if (!planEpisode) {
      throw new AppError(
        "Daily plan episode not found",
        409,
        "DAILY_PLAN_EPISODE_NOT_FOUND"
      )
    }

    await tx
      .insert(dailyPlanItems)
      .values(itemTypes.map((type) => ({ dailyPlanId: currentPlan.id, type })))
      .onConflictDoNothing({
        target: [dailyPlanItems.dailyPlanId, dailyPlanItems.type],
      })

    const [targetItem] = await tx
      .select({
        completedAt: dailyPlanItems.completedAt,
        metadata: dailyPlanItems.metadata,
      })
      .from(dailyPlanItems)
      .where(
        and(
          eq(dailyPlanItems.dailyPlanId, currentPlan.id),
          eq(dailyPlanItems.type, input.type)
        )
      )
      .for("update")
      .limit(1)
    if (!targetItem) {
      throw new AppError(
        "Daily plan item not found",
        409,
        "DAILY_PLAN_ITEM_NOT_FOUND"
      )
    }

    const storedMetadata = metadataRecord(targetItem.metadata)
    let itemMetadata = storedMetadata
    let completionMetadata = input.completionMetadata
    if (
      input.type === "review" &&
      !targetItem.completedAt &&
      !completionMetadata
    ) {
      if (!hasReviewAssignment(itemMetadata)) {
        const reviewedForPlan = await tx
          .select({ id: reviewLogs.userCardId })
          .from(reviewLogs)
          .where(eq(reviewLogs.dailyPlanId, currentPlan.id))
        const recoveredCardIds = [
          ...new Set(reviewedForPlan.map((card) => card.id)),
        ]
        if (recoveredCardIds.length === 0) {
          throw new AppError(
            "Review queue has not been assigned to this plan",
            409,
            "DAILY_REVIEW_NOT_ASSIGNED"
          )
        }
        itemMetadata = {
          ...itemMetadata,
          assignedCardIds: recoveredCardIds,
          assignedCount: recoveredCardIds.length,
          assignmentSource: "review_logs_recovery",
        }
      }

      const assignedCardIds = assignedCardIdsFromMetadata(itemMetadata)
      const [eligibleCards, reviewedCards] =
        assignedCardIds.length === 0
          ? [[], []]
          : await Promise.all([
              tx
                .select({ id: userCards.id })
                .from(userCards)
                .innerJoin(phrases, eq(phrases.id, userCards.phraseId))
                .where(
                  and(
                    eq(userCards.userId, input.userId),
                    inArray(userCards.id, assignedCardIds),
                    eq(userCards.isSuspended, false),
                    or(
                      eq(phrases.isActive, true),
                      eq(userCards.isPersonal, true)
                    )
                  )
                ),
              tx
                .select({ id: reviewLogs.userCardId })
                .from(reviewLogs)
                .where(
                  and(
                    eq(reviewLogs.dailyPlanId, currentPlan.id),
                    inArray(reviewLogs.userCardId, assignedCardIds)
                  )
                ),
            ])
      completionMetadata = dailyReviewCompletionMetadata({
        eligibleCardIds: eligibleCards.map((card) => card.id),
        reviewedCardIds: reviewedCards.map((card) => card.id),
      })
    }

    await tx
      .update(dailyPlanItems)
      .set({
        completedAt: now,
        ...(completionMetadata
          ? { metadata: { ...itemMetadata, ...completionMetadata } }
          : {}),
      })
      .where(
        and(
          eq(dailyPlanItems.dailyPlanId, currentPlan.id),
          eq(dailyPlanItems.type, input.type),
          isNull(dailyPlanItems.completedAt)
        )
      )

    const items = await tx
      .select({
        type: dailyPlanItems.type,
        completedAt: dailyPlanItems.completedAt,
      })
      .from(dailyPlanItems)
      .where(eq(dailyPlanItems.dailyPlanId, currentPlan.id))
    const completedItems = items
      .filter((item) => item.completedAt !== null)
      .map((item) => item.type)
    const completed = itemTypes.every((type) => completedItems.includes(type))
    const status: "complete" | "supporting" = completed
      ? "complete"
      : "supporting"

    await tx
      .update(dailyPlans)
      .set({ status, completedAt: completed ? now : null })
      .where(eq(dailyPlans.id, currentPlan.id))
    await tx
      .update(users)
      .set({ lastActiveAt: now, updatedAt: now })
      .where(eq(users.id, input.userId))

    let nextEpisodeId: string | null = null
    if (completed && currentPlan.status !== "complete") {
      const [next] = await tx
        .select({ id: episodes.id })
        .from(episodes)
        .where(
          and(
            eq(episodes.programId, planEpisode.programId),
            eq(episodes.ingestionStatus, "ready"),
            eq(episodes.isActive, true),
            gt(episodes.sequenceNumber, planEpisode.sequenceNumber)
          )
        )
        .orderBy(asc(episodes.sequenceNumber))
        .limit(1)
      if (next) {
        nextEpisodeId = next.id
        await tx
          .update(userProgramProgress)
          .set({ currentEpisodeId: next.id, updatedAt: now })
          .where(
            and(
              eq(userProgramProgress.userId, input.userId),
              eq(userProgramProgress.programId, planEpisode.programId)
            )
          )
      }
    }

    return { status, completedItems, nextEpisodeId }
  })
}
