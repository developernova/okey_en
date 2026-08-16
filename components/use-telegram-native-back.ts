"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { getTelegramWebApp } from "@/lib/telegram"

const subscribeToTelegramEnvironment = () => () => undefined
const getServerSnapshot = () => false

function getNativeBackSnapshot() {
  const webApp = getTelegramWebApp()
  return Boolean(
    webApp?.initData && webApp.isVersionAtLeast("6.1") && webApp.BackButton
  )
}

export function useTelegramNativeBack(href: string, onBack?: () => void) {
  const router = useRouter()
  const available = React.useSyncExternalStore(
    subscribeToTelegramEnvironment,
    getNativeBackSnapshot,
    getServerSnapshot
  )
  const goBack = React.useCallback(() => {
    if (onBack) onBack()
    else router.push(href)
  }, [href, onBack, router])

  React.useEffect(() => {
    if (!available) return
    const backButton = getTelegramWebApp()?.BackButton
    if (!backButton) return
    backButton.show().onClick(goBack)
    return () => {
      backButton.offClick(goBack).hide()
    }
  }, [available, goBack])

  return available
}
