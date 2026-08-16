export const PRODUCTION_APP_ORIGIN = "https://en.dakhe.ru"

function configuredOrigin() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (!configured) return undefined

  try {
    const url = new URL(configured)
    const internalHost =
      url.hostname === "0.0.0.0" ||
      url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "[::1]"
    if (process.env.NODE_ENV === "production" && internalHost) {
      return undefined
    }
    return url.origin
  } catch {
    return undefined
  }
}

export function publicAppOrigin(request?: Request) {
  const configured = configuredOrigin()
  if (configured) return configured
  if (process.env.NODE_ENV === "production") return PRODUCTION_APP_ORIGIN
  return request ? new URL(request.url).origin : "http://localhost:3000"
}

export function publicAppUrl(path: string, request?: Request) {
  return new URL(path, `${publicAppOrigin(request)}/`)
}
