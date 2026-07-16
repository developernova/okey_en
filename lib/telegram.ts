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
}

export type TelegramWebApp = {
  initData: string
  version: string
  ready(): void
  expand(): void
  isVersionAtLeast(version: string): boolean
  disableVerticalSwipes?(): void
  enableVerticalSwipes?(): void
  requestFullscreen?(): void
  exitFullscreen?(): void
  openLink?(url: string, options?: { try_instant_view?: boolean }): void
  addToHomeScreen?(): void
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

export function telegramFetch(input: RequestInfo | URL, init?: RequestInit) {
  const headers = new Headers(init?.headers)
  const initData = getTelegramWebApp()?.initData
  if (initData) headers.set("x-telegram-init-data", initData)
  if (typeof window !== "undefined") {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (timezone) headers.set("x-user-timezone", timezone)
  }

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
