import { z } from "zod"

const courseLevels = ["A1", "A2", "B1", "B2", "C1"] as const
const levelSchema = z.enum(courseLevels)

function validLevelRange(value: { levelMin?: string; levelMax?: string }) {
  if (!value.levelMin || !value.levelMax) return true
  return (
    courseLevels.indexOf(value.levelMin as (typeof courseLevels)[number]) <=
    courseLevels.indexOf(value.levelMax as (typeof courseLevels)[number])
  )
}

const programFields = {
  slug: z
    .string()
    .regex(/^[a-z0-9-]+$/)
    .min(2)
    .max(80),
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).nullable(),
  levelMin: levelSchema,
  levelMax: levelSchema,
  isActive: z.boolean(),
}

export const createProgramSchema = z
  .object(programFields)
  .refine(validLevelRange, {
    message: "Minimum level must not exceed maximum level",
    path: ["levelMax"],
  })

export const updateProgramSchema = z
  .object({
    slug: programFields.slug.optional(),
    title: programFields.title.optional(),
    description: programFields.description.optional(),
    levelMin: programFields.levelMin.optional(),
    levelMax: programFields.levelMax.optional(),
    isActive: programFields.isActive.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "No changes provided")

export const updateEpisodeSchema = z
  .object({
    title: z.string().trim().min(2).max(200).optional(),
    sequenceNumber: z.number().int().positive().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "No changes provided")

export type CreateProgramInput = z.infer<typeof createProgramSchema>
export type UpdateProgramInput = z.infer<typeof updateProgramSchema>
export type UpdateEpisodeInput = z.infer<typeof updateEpisodeSchema>
