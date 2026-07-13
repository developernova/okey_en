import { and, asc, eq } from "drizzle-orm"

import { getDb } from "@/db"
import {
  episodes,
  pendingProgramSwitches,
  programs,
  userProgramProgress,
  users,
} from "@/db/schema"
import { CEFR_LEVELS, type CefrLevel } from "@/server/content/cefr"
import { calculateComprehension } from "@/server/progress/comprehension"
import { AppError } from "@/server/shared/errors"

const unlockCoverage = 70

function includesLevel(level: string | null, min: string, max: string) {
  if (!level) return true
  const value = CEFR_LEVELS.indexOf(level as CefrLevel)
  const minimum = CEFR_LEVELS.indexOf(min as CefrLevel)
  const maximum = CEFR_LEVELS.indexOf(max as CefrLevel)
  if (value < 0 || minimum < 0 || maximum < 0) return true
  return value >= minimum && value <= maximum
}

async function getAvailablePrograms() {
  const rows = await getDb()
    .select({
      id: programs.id,
      slug: programs.slug,
      title: programs.title,
      description: programs.description,
      levelMin: programs.levelMin,
      levelMax: programs.levelMax,
      episodeId: episodes.id,
      sequenceNumber: episodes.sequenceNumber,
    })
    .from(programs)
    .leftJoin(
      episodes,
      and(
        eq(episodes.programId, programs.id),
        eq(episodes.ingestionStatus, "ready"),
        eq(episodes.isActive, true)
      )
    )
    .where(eq(programs.isActive, true))
    .orderBy(asc(programs.title), asc(episodes.sequenceNumber))

  return [...new Map(rows.map((row) => [row.id, row])).values()]
}

export async function listProgramSettings(userId: string) {
  const db = getDb()
  const [available, activeRows, pendingRows, userRows] = await Promise.all([
    getAvailablePrograms(),
    db
      .select({ programId: userProgramProgress.programId })
      .from(userProgramProgress)
      .where(
        and(
          eq(userProgramProgress.userId, userId),
          eq(userProgramProgress.isActive, true)
        )
      ),
    db
      .select({ programId: pendingProgramSwitches.programId })
      .from(pendingProgramSwitches)
      .where(eq(pendingProgramSwitches.userId, userId))
      .limit(1),
    db
      .select({ levelEstimate: users.levelEstimate })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
  ])
  const activeProgramId = activeRows[0]?.programId
  const pendingProgramId = pendingRows[0]?.programId
  const learnerLevel = userRows[0]?.levelEstimate ?? null
  const visible = available.filter(
    (program) =>
      program.id === activeProgramId ||
      program.id === pendingProgramId ||
      includesLevel(learnerLevel, program.levelMin, program.levelMax)
  )

  return Promise.all(
    visible.map(async (program) => {
      const coverage = program.episodeId
        ? (
            await calculateComprehension({
              userId,
              episodeId: program.episodeId,
            })
          ).percentage
        : null
      const isActive = program.id === activeProgramId
      const isPending = program.id === pendingProgramId
      const hasContent = Boolean(program.episodeId)
      return {
        id: program.id,
        slug: program.slug,
        title: program.title,
        description: program.description ?? "",
        level:
          program.levelMin === program.levelMax
            ? program.levelMin
            : `${program.levelMin}–${program.levelMax}`,
        coverage,
        isActive,
        isPending,
        isUnlocked:
          hasContent &&
          (isActive || isPending || (coverage ?? 0) >= unlockCoverage),
        unlockCoverage,
        hasContent,
      }
    })
  )
}

export async function selectProgram(userId: string, programId: string) {
  const db = getDb()
  const [available, activeRows, userRows] = await Promise.all([
    getAvailablePrograms(),
    db
      .select({ programId: userProgramProgress.programId })
      .from(userProgramProgress)
      .where(
        and(
          eq(userProgramProgress.userId, userId),
          eq(userProgramProgress.isActive, true)
        )
      )
      .limit(1),
    db
      .select({ levelEstimate: users.levelEstimate })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
  ])
  const target = available.find((program) => program.id === programId)
  if (!target?.episodeId) {
    throw new AppError("Program is not available", 404, "PROGRAM_NOT_AVAILABLE")
  }
  if (
    !includesLevel(
      userRows[0]?.levelEstimate ?? null,
      target.levelMin,
      target.levelMax
    )
  ) {
    throw new AppError(
      "Program does not match the learner level",
      409,
      "PROGRAM_LEVEL_MISMATCH"
    )
  }

  const comprehension = await calculateComprehension({
    userId,
    episodeId: target.episodeId,
  })
  if (
    activeRows[0]?.programId !== target.id &&
    comprehension.percentage < unlockCoverage
  ) {
    throw new AppError(
      `Program unlocks at ${unlockCoverage}% coverage`,
      409,
      "PROGRAM_LOCKED"
    )
  }

  if (activeRows[0]?.programId === target.id) {
    await db
      .delete(pendingProgramSwitches)
      .where(eq(pendingProgramSwitches.userId, userId))
    return {
      programId: target.id,
      coverage: comprehension.percentage,
      effective: "current" as const,
    }
  }

  await db
    .insert(pendingProgramSwitches)
    .values({ userId, programId: target.id, requestedAt: new Date() })
    .onConflictDoUpdate({
      target: pendingProgramSwitches.userId,
      set: { programId: target.id, requestedAt: new Date() },
    })

  return {
    programId: target.id,
    coverage: comprehension.percentage,
    effective: "next_day" as const,
  }
}
