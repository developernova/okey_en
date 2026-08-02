import { createHash, randomBytes, timingSafeEqual } from "node:crypto"

export function randomBase64Url(byteLength = 32) {
  return randomBytes(byteLength).toString("base64url")
}

export function sha256Base64Url(value: string) {
  return createHash("sha256").update(value).digest("base64url")
}

export function sha256Hex(value: string) {
  return createHash("sha256").update(value).digest("hex")
}

export function secureHashEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  )
}
