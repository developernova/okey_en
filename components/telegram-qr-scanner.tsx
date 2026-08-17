"use client"

import {
  ComputerPhoneSyncIcon,
  QrCode01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import * as React from "react"

import { getTelegramWebApp } from "@/lib/telegram"
import { cn } from "@/lib/utils"

const subscribeToTelegramScanner = () => () => undefined

function getTelegramScannerSnapshot() {
  const webApp = getTelegramWebApp()
  return Boolean(
    webApp?.initData && webApp.isVersionAtLeast("6.4") && webApp.showScanQrPopup
  )
}

function getServerTelegramScannerSnapshot() {
  return false
}

export function qrApprovalPath(value: string, currentOrigin: string) {
  try {
    const url = new URL(value, currentOrigin)
    const match = url.pathname.match(/^\/login\/qr\/([A-Za-z\d_-]{43})$/)
    return match ? `/login/qr/${match[1]}` : null
  } catch {
    return null
  }
}

export function TelegramQrScanner({
  variant = "card",
}: {
  variant?: "card" | "compact"
}) {
  const available = React.useSyncExternalStore(
    subscribeToTelegramScanner,
    getTelegramScannerSnapshot,
    getServerTelegramScannerSnapshot
  )
  const [scanError, setScanError] = React.useState<string | null>(null)

  if (!available) return null

  function scan() {
    const webApp = getTelegramWebApp()
    if (!webApp?.showScanQrPopup) return
    setScanError(null)
    webApp.showScanQrPopup(
      { text: "Наведи камеру на QR-код Catch English на компьютере" },
      (value) => {
        const path = qrApprovalPath(value, window.location.origin)
        if (!path) {
          setScanError("Это не QR-код входа в Catch English")
          return false
        }
        webApp.HapticFeedback?.impactOccurred("light")
        window.location.assign(path)
        return true
      }
    )
  }

  if (variant === "compact") {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={scan}
          aria-label="Войти на компьютере по QR-коду"
          className="flex h-10 items-center gap-2 rounded-2xl border bg-card px-3 text-xs font-semibold shadow-sm transition-colors hover:bg-muted active:scale-[0.98]"
        >
          <HugeiconsIcon icon={QrCode01Icon} size={18} strokeWidth={1.8} />
          <span>На ноутбуке</span>
        </button>
        {scanError && (
          <p
            className={cn(
              "absolute top-12 right-0 z-10 w-56 rounded-xl border border-destructive/15",
              "bg-card p-3 text-xs leading-5 text-destructive shadow-lg"
            )}
            aria-live="polite"
          >
            {scanError}
          </p>
        )}
      </div>
    )
  }

  return (
    <section className="rounded-[24px] border bg-card p-5">
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-muted">
          <HugeiconsIcon
            icon={ComputerPhoneSyncIcon}
            size={20}
            strokeWidth={1.8}
          />
        </span>
        <div>
          <h2 className="text-sm font-semibold">Вход на компьютере</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Подтверди свой аккаунт через телефон
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={scan}
        className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-foreground text-sm font-semibold text-background"
      >
        <HugeiconsIcon icon={QrCode01Icon} size={20} strokeWidth={1.8} />
        Сканировать QR-код
      </button>
      {scanError && (
        <p className="mt-3 text-xs text-destructive" aria-live="polite">
          {scanError}
        </p>
      )}
    </section>
  )
}
