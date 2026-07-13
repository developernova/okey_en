import { and, asc, eq } from "drizzle-orm"

import { getDb } from "@/db"
import { episodes, programs, userProgramProgress } from "@/db/schema"
import { calculateComprehension } from "@/server/progress/comprehension"
import { AppError } from "@/server/shared/errors"

const unlockCoverage = 70
const catalog = [
  {
    slug: "easy-english",
    title: "Easy English",
    description: "Живые диалоги на улицах",
    level: "A2–B1",
  },
  {
    slug: "ted-ed",
    title: "TED-Ed",
    description: "Короткие истории и идеи",
    level: "B1–B2",
  },
  {
    slug: "vox",
    title: "Vox",
    description: "Мир, культура и технологии",
    level: "B2",
  },
] as const

async function getAvailablePrograms() {
  const db = getDb()
  const rows = await db
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
    .innerJoin(episodes, eq(episodes.programId, programs.id))
    .where(
      and(
        eq(programs.isActive, true),
        eq(episodes.ingestionStatus, "ready"),
        eq(episodes.isActive, true)
      )
    )
    .orderBy(asc(episodes.sequenceNumber))

  return [...new Map(rows.map((row) => [row.id, row])).values()]
}

export async function listProgramSettings(userId: string) {
  const db = getDb()
  const [available, activeRows] = await Promise.all([
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
  ])
  const activeProgramId = activeRows[0]?.programId

  const measured = await Promise.all(
    available.map(async (program) => {
      const comprehension = await calculateComprehension({
        userId,
        episodeId: program.episodeId,
      })
      return {
        ...program,
        coverage: comprehension.percentage,
      }
    })
  )

  const measuredBySlug = new Map(measured.map((item) => [item.slug, item]))
  const defaults = catalog.map((entry) => {
    const program = measuredBySlug.get(entry.slug)
    const isActive = program?.id === activeProgramId
    const isUnlocked = Boolean(
      program && (isActive || program.coverage >= unlockCoverage)
    )
    return {
      id: program?.id ?? null,
      slug: entry.slug,
      title: program?.title ?? entry.title,
      description: program?.description ?? entry.description,
      level: entry.level,
      coverage: program?.coverage ?? null,
      isActive,
      isUnlocked,
      unlockCoverage,
      hasContent: Boolean(program),
    }
  })

  const defaultSlugs = new Set(catalog.map((entry) => entry.slug))
  const custom = measured
    .filter(
      (program) =>
        !defaultSlugs.has(program.slug as (typeof catalog)[number]["slug"])
    )
    .map((program) => {
      const isActive = program.id === activeProgramId
      return {
        id: program.id,
        slug: program.slug,
        title: program.title,
        description: program.description ?? "",
        level:
          program.levelMin === program.levelMax
            ? program.levelMin
            : `${program.levelMin}–${program.levelMax}`,
        coverage: program.coverage,
        isActive,
        isUnlocked: isActive || program.coverage >= unlockCoverage,
        unlockCoverage,
        hasContent: true,
      }
    })

  return [...defaults, ...custom]
}

export async function selectProgram(userId: string, programId: string) {
  const db = getDb()
  const available = await getAvailablePrograms()
  const target = available.find((program) => program.id === programId)
  if (!target) {
    throw new AppError("Program is not available", 404, "PROGRAM_NOT_AVAILABLE")
  }

  const comprehension = await calculateComprehension({
    userId,
    episodeId: target.episodeId,
  })
  if (comprehension.percentage < unlockCoverage) {
    throw new AppError(
      `Program unlocks at ${unlockCoverage}% coverage`,
      409,
      "PROGRAM_LOCKED"
    )
  }

  await db.transaction(async (tx) => {
    await tx
      .update(userProgramProgress)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(userProgramProgress.userId, userId))
    await tx
      .insert(userProgramProgress)
      .values({
        userId,
        programId: target.id,
        currentEpisodeId: target.episodeId,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: [userProgramProgress.userId, userProgramProgress.programId],
        set: {
          currentEpisodeId: target.episodeId,
          isActive: true,
          updatedAt: new Date(),
        },
      })
  })

  return { programId: target.id, coverage: comprehension.percentage }
}
