import { z } from "zod"

import {
  adminSessionCookieHeader,
  adminSessionLifetimeSeconds,
  configuredAdminSecret,
  createAdminSessionToken,
  hasValidAdminSession,
  secureStringEqual,
} from "@/server/auth/admin-session"
import { AppError } from "@/server/shared/errors"
import { jsonError } from "@/server/shared/http"

const loginSchema = z.object({ secret: z.string().min(1).max(500) })

export async function GET(request: Request) {
  try {
    return Response.json({
      data: { authenticated: hasValidAdminSession(request) },
    })
  } catch (error) {
    return jsonError(error)
  }
}

export async function POST(request: Request) {
  try {
    const { secret } = loginSchema.parse(await request.json())
    const adminSecret = configuredAdminSecret()
    if (!secureStringEqual(secret, adminSecret)) {
      throw new AppError("Invalid admin secret", 401, "ADMIN_REQUIRED")
    }
    const token = createAdminSessionToken(adminSecret)
    return Response.json(
      { data: { authenticated: true } },
      {
        headers: {
          "Set-Cookie": adminSessionCookieHeader(
            token,
            adminSessionLifetimeSeconds
          ),
        },
      }
    )
  } catch (error) {
    return jsonError(error)
  }
}

export async function DELETE() {
  return Response.json(
    { data: { authenticated: false } },
    { headers: { "Set-Cookie": adminSessionCookieHeader("", 0) } }
  )
}
