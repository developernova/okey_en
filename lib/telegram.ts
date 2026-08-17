type BackButton = {
  show(): BackButton
  hide(): BackButton
  onClick(callback: () => void): BackButton
  offClick(callback: () => void): BackButton
}

type CloudStorage = {
  getItem(
    key: string,
    callback: (error: string | null, value?: string) => void
  ): CloudStorage
  setItem(
    key: string,
    value: string,
    callback?: (error: string | null, stored?: boolean) => void
  ): CloudStorage
  removeItem(
    key: string,
    callback?: (error: string | null, removed?: boolean) => void
  ): CloudStorage
}

export type TelegramWebApp = {
  initData: string
  initDataUnsafe?: {
    user?: {
      first_name?: string
      username?: string
    }
  }
  version: string
  colorScheme?: "light" | "dark"
  themeParams?: {
    bg_color?: string
    secondary_bg_color?: string
    header_bg_color?: string
    bottom_bar_bg_color?: string
  }
  ready(): void
  expand(): void
  isVersionAtLeast(version: string): boolean
  disableVerticalSwipes?(): void
  enableVerticalSwipes?(): void
  requestFullscreen?(): void
  exitFullscreen?(): void
  setHeaderColor?(color: string): void
  setBackgroundColor?(color: string): void
  setBottomBarColor?(color: string): void
  openLink?(url: string, options?: { try_instant_view?: boolean }): void
  addToHomeScreen?(): void
  showScanQrPopup?(
    params: { text?: string },
    callback?: (text: string) => boolean | void
  ): void
  closeScanQrPopup?(): void
  onEvent?(
    eventType: string,
    callback: (event?: { data?: string }) => void
  ): void
  offEvent?(
    eventType: string,
    callback: (event?: { data?: string }) => void
  ): void
  BackButton?: BackButton
  CloudStorage?: CloudStorage
  HapticFeedback?: {
    impactOccurred(style: "light" | "medium" | "heavy" | "rigid" | "soft"): void
    notificationOccurred(type: "error" | "success" | "warning"): void
  }
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp }
  }
}

export function getTelegramWebApp() {
  if (typeof window === "undefined") return undefined
  return window.Telegram?.WebApp
}

let webRefreshTask: Promise<boolean> | null = null

function requestPath(input: RequestInfo | URL) {
  if (typeof input === "string") return input
  if (input instanceof URL) return input.pathname
  return new URL(input.url).pathname
}

async function refreshWebSession() {
  if (webRefreshTask) return webRefreshTask
  webRefreshTask = fetch("/api/auth/web/refresh", {
    method: "POST",
    cache: "no-store",
  })
    .then((response) => response.ok)
    .catch(() => false)
    .finally(() => {
      webRefreshTask = null
    })
  return webRefreshTask
}

export async function telegramFetch(
  input: RequestInfo | URL,
  init?: RequestInit
) {
  const headers = new Headers(init?.headers)
  const initData = getTelegramWebApp()?.initData
  if (initData) headers.set("x-telegram-init-data", initData)
  if (typeof window !== "undefined") {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (timezone) headers.set("x-user-timezone", timezone)
  }

  const response = await fetch(input, { ...init, headers })
  const path = requestPath(input)
  if (
    response.status !== 401 ||
    initData ||
    path.startsWith("/api/auth/web/refresh") ||
    path.startsWith("/api/auth/telegram")
  ) {
    return response
  }

  if (!(await refreshWebSession())) return response
  return fetch(input, { ...init, headers })
}

export function setTelegramCloudFlag(key: string, value: string) {
  const webApp = getTelegramWebApp()
  if (!webApp?.isVersionAtLeast("6.9")) return
  try {
    webApp.CloudStorage?.setItem(key, value)
  } catch {
    // Local storage remains the fallback outside Telegram and on older clients.
  }
}

export function getTelegramCloudFlag(
  key: string,
  callback: (value: string | undefined) => void
) {
  const webApp = getTelegramWebApp()
  if (!webApp?.isVersionAtLeast("6.9")) return false
  try {
    webApp.CloudStorage?.getItem(key, (error, value) => {
      callback(error ? undefined : value)
    })
    return true
  } catch {
    return false
  }
}

export function removeTelegramCloudFlag(key: string) {
  const webApp = getTelegramWebApp()
  if (!webApp?.isVersionAtLeast("6.9")) return
  try {
    webApp.CloudStorage?.removeItem(key)
  } catch {
    // The server profile remains authoritative if Telegram storage is absent.
  }
}
