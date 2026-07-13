import { z } from "zod"

import { requireUserId } from "@/server/auth/user-context"
import {
  listProgramSettings,
  selectProgram,
} from "@/server/programs/program-settings"
import { jsonError } from "@/server/shared/http"

const requestSchema = z.object({ programId: z.uuid() })

export async function GET(request: Request) {
  try {
    const userId = await requireUserId(request)
    return Response.json({ data: await listProgramSettings(userId) })
  } catch (error) {
    return jsonError(error)
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId(request)
    const input = requestSchema.parse(await request.json())
    return Response.json({ data: await selectProgram(userId, input.programId) })
  } catch (error) {
    return jsonError(error)
  }
}
