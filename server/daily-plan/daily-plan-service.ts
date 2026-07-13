import { and, asc, eq, gt, isNull, lt } from "drizzle-orm"

import { getDb } from "@/db"
import {
  dailyPlanItems,
  dailyPlans,
  episodes,
  pendingProgramSwitches,
  programs,
  userProgramProgress,
  users,
} from "@/db/schema"
import { dateInTimezone } from "@/server/interview/rate-limit"
import { AppError } from "@/server/shared/errors"

export type DailyPlanItemType = "watch" | "review" | "retell"
const itemTypes: DailyPlanItemType[] = ["watch", "review", "retell"]

export async function getOrCreateDailyPlan(userId: string, now = new Date()) {
  const db = getDb()

  return db.transaction(async (tx) => {
    const [user] = await tx
      .select({ timezone: users.timezone })
      .from(users)
      .where(eq(users.id, userId))
      .for("update")
      .limit(1)
    if (!user) throw new AppError("User not found", 404, "USER_NOT_FOUND")

    const planDate = dateInTimezone(now, user.timezone)
    const [existing] = await tx
      .select({
        planId: dailyPlans.id,
        status: dailyPlans.status,
        completedAt: dailyPlans.completedAt,
        episodeId: episodes.id,
        youtubeId: episodes.youtubeId,
        episodeTitle: episodes.title,
        durationSeconds: episodes.durationSeconds,
        sequenceNumber: episodes.sequenceNumber,
        programId: programs.id,
        programTitle: programs.title,
      })
      .from(dailyPlans)
      .innerJoin(episodes, eq(episodes.id, dailyPlans.episodeId))
      .innerJoin(programs, eq(programs.id, episodes.programId))
      .where(
        and(eq(dailyPlans.userId, userId), eq(dailyPlans.planDate, planDate))
      )
      .limit(1)

    if (existing) {
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

    const [plan] = await tx
      .insert(dailyPlans)
      .values({ userId, planDate, episodeId: current.episodeId })
      .returning({ id: dailyPlans.id })
    await tx.insert(dailyPlanItems).values(
      itemTypes.map((type) => ({
        dailyPlanId: plan.id,
        type,
      }))
    )

    return {
      planId: plan.id,
      planDate,
      status: "not_started" as const,
      completedAt: null,
      completedItems: [],
      timezone: user.timezone,
      ...current,
    }
  })
}

export async function completeDailyPlanItem(input: {
  userId: string
  type: DailyPlanItemType
  episodeId: string
  now?: Date
}) {
  const now = input.now ?? new Date()
  const plan = await getOrCreateDailyPlan(input.userId, now)
  if (plan.episodeId !== input.episodeId) {
    throw new AppError(
      "Episode does not belong to today's plan",
      409,
      "DAILY_PLAN_EPISODE_MISMATCH"
    )
  }

  const db = getDb()
  return db.transaction(async (tx) => {
    const [storedPlan] = await tx
      .select({ status: dailyPlans.status })
      .from(dailyPlans)
      .where(eq(dailyPlans.id, plan.planId))
      .for("update")
      .limit(1)
    if (!storedPlan) {
      throw new AppError("Daily plan not found", 404, "DAILY_PLAN_NOT_FOUND")
    }

    await tx
      .update(dailyPlanItems)
      .set({ completedAt: now })
      .where(
        and(
          eq(dailyPlanItems.dailyPlanId, plan.planId),
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
      .where(eq(dailyPlanItems.dailyPlanId, plan.planId))
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
      .where(eq(dailyPlans.id, plan.planId))
    await tx
      .update(users)
      .set({ lastActiveAt: now, updatedAt: now })
      .where(eq(users.id, input.userId))

    let nextEpisodeId: string | null = null
    if (completed && storedPlan.status !== "complete") {
      const [next] = await tx
        .select({ id: episodes.id })
        .from(episodes)
        .where(
          and(
            eq(episodes.programId, plan.programId),
            eq(episodes.ingestionStatus, "ready"),
            eq(episodes.isActive, true),
            gt(episodes.sequenceNumber, plan.sequenceNumber)
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
              eq(userProgramProgress.programId, plan.programId)
            )
          )
      }
    }

    return { status, completedItems, nextEpisodeId }
  })
}
