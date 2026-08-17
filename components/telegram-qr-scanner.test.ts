import { describe, expect, it } from "vitest"

import { qrApprovalPath } from "@/components/telegram-qr-scanner"

const token = "a".repeat(43)

describe("qrApprovalPath", () => {
  it("accepts a Catch English QR approval path", () => {
    expect(
      qrApprovalPath(
        `https://catch-english.example/login/qr/${token}`,
        "https://catch-english.example"
      )
    ).toBe(`/login/qr/${token}`)
  })

  it("accepts a relative QR approval path", () => {
    expect(
      qrApprovalPath(`/login/qr/${token}`, "https://catch-english.example")
    ).toBe(`/login/qr/${token}`)
  })

  it("rejects unrelated and malformed QR values", () => {
    expect(
      qrApprovalPath("https://example.com/not-login", "https://catch.test")
    ).toBeNull()
    expect(
      qrApprovalPath("/login/qr/too-short", "https://catch.test")
    ).toBeNull()
  })
})
