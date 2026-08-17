import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  resetAdminUser: vi.fn(),
}))

vi.mock("@/server/auth/user-context", () => ({
  requireAdmin: mocks.requireAdmin,
}))
vi.mock("@/server/admin/user-service", () => ({
  resetAdminUser: mocks.resetAdminUser,
}))

import { POST } from "./route"
import { AppError } from "@/server/shared/errors"

const userId = "774b9ccb-5bc8-4f87-9b8b-e44fbd7773fd"

function request(confirmation: string) {
  return new Request(`https://catch.example/api/admin/users/${userId}/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirmation }),
  })
}

describe("POST /api/admin/users/[id]/reset", () => {
  beforeEach(() => {
    mocks.requireAdmin.mockReset()
    mocks.resetAdminUser.mockReset()
    mocks.resetAdminUser.mockResolvedValue({ id: userId })
  })

  it("rejects the reset unless the exact confirmation is supplied", async () => {
    const response = await POST(request("сбросить"), {
      params: Promise.resolve({ id: userId }),
    })

    expect(response.status).toBe(400)
    expect(mocks.resetAdminUser).not.toHaveBeenCalled()
  })

  it("rejects unauthenticated administrators before touching user data", async () => {
    mocks.requireAdmin.mockImplementationOnce(() => {
      throw new AppError("Unauthorized", 401, "UNAUTHORIZED")
    })

    const response = await POST(request("СБРОСИТЬ"), {
      params: Promise.resolve({ id: userId }),
    })

    expect(response.status).toBe(401)
    expect(mocks.resetAdminUser).not.toHaveBeenCalled()
  })

  it("resets the selected user after exact confirmation", async () => {
    const response = await POST(request("СБРОСИТЬ"), {
      params: Promise.resolve({ id: userId }),
    })

    expect(response.status).toBe(200)
    expect(mocks.requireAdmin).toHaveBeenCalledOnce()
    expect(mocks.resetAdminUser).toHaveBeenCalledWith(userId)
  })
})
