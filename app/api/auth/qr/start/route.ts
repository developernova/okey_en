import { randomUUID } from "node:crypto"
import { networkInterfaces } from "node:os"

import { authJsonError, privateNoStore } from "@/server/auth/auth-http"
import { createQrAuthChallenge } from "@/server/auth/qr-auth"
import { publicAppOrigin } from "@/server/config/public-app-url"
import {
  appendWebDeviceCookie,
  appendWebQrChallengeCookie,
  webDeviceId,
} from "@/server/auth/web-session"

function publicOrigin(request: Request) {
  const requestUrl = new URL(publicAppOrigin(request))
  if (
    process.env.NODE_ENV !== "production" &&
    (requestUrl.hostname === "localhost" || requestUrl.hostname === "127.0.0.1")
  ) {
    const localAddress = Object.values(networkInterfaces())
      .flatMap((entries) => entries ?? [])
      .find(
        (entry) =>
          entry.family === "IPv4" &&
          !entry.internal &&
          (/^10\./.test(entry.address) ||
            /^192\.168\./.test(entry.address) ||
            /^172\.(1[6-9]|2\d|3[01])\./.test(entry.address))
      )?.address
    if (localAddress) {
      return `${requestUrl.protocol}//${localAddress}${requestUrl.port ? `:${requestUrl.port}` : ""}`
    }
  }

  return requestUrl.origin
}

export async function POST(request: Request) {
  try {
    const deviceId = webDeviceId(request) ?? randomUUID()
    const challenge = await createQrAuthChallenge(deviceId)
    const qrUrl = new URL(
      `/login/qr/${challenge.publicToken}`,
      publicOrigin(request)
    ).toString()
    const headers = new Headers()
    appendWebDeviceCookie(headers, deviceId)
    appendWebQrChallengeCookie(headers, {
      id: challenge.id,
      verifier: challenge.desktopVerifier,
    })

    return privateNoStore(
      Response.json(
        {
          data: {
            qrUrl,
            expiresAt: challenge.expiresAt.toISOString(),
          },
        },
        { status: 201, headers }
      )
    )
  } catch (error) {
    return privateNoStore(authJsonError(error))
  }
}
