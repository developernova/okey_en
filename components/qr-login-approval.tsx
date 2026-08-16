"use client"

import {
  CheckmarkCircle02Icon,
  ComputerPhoneSyncIcon,
  Loading03Icon,
  TelegramIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { useEffect, useState } from "react"

import { useTelegramNativeBack } from "@/components/use-telegram-native-back"
import { getTelegramWebApp, telegramFetch } from "@/lib/telegram"

type Phase =
  | "checking"
  | "authentication_required"
  | "ready"
  | "submitting"
  | "done"
  | "expired"
  | "error"

type User = { firstName?: string | null; username?: string | null }

export function QrLoginApproval({
  token,
  authError,
}: {
  token: string
  authError?: string
}) {
  useTelegramNativeBack("/my/settings")
  const [phase, setPhase] = useState<Phase>("checking")
  const [user, setUser] = useState<User>()
  const returnPath = `/login/qr/${token}`
  const telegramUrl = `/api/auth/telegram/web/start?return_to=${encodeURIComponent(returnPath)}`

  useEffect(() => {
    let active = true
    const check = async () => {
      try {
        await Promise.resolve()
        const webApp = getTelegramWebApp()
        if (webApp?.initData) {
          if (!active) return
          setUser({
            firstName: webApp.initDataUnsafe?.user?.first_name,
            username: webApp.initDataUnsafe?.user?.username,
          })
          setPhase("ready")
          return
        }
        let response = await fetch("/api/auth/web/session", {
          cache: "no-store",
        })
        if (response.status === 401) {
          const refreshed = await fetch("/api/auth/web/refresh", {
            method: "POST",
            cache: "no-store",
          })
          if (refreshed.ok) {
            response = await fetch("/api/auth/web/session", {
              cache: "no-store",
            })
          }
        }
        if (!active) return
        if (response.status === 401) {
          setPhase("authentication_required")
          return
        }
        if (!response.ok) throw new Error("session_failed")
        const payload = (await response.json()) as { data: { user: User } }
        setUser(payload.data.user)
        setPhase("ready")
      } catch {
        if (active) setPhase("error")
      }
    }
    void check()
    return () => {
      active = false
    }
  }, [])

  const approve = async () => {
    setPhase("submitting")
    try {
      const response = await telegramFetch("/api/auth/qr/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      })
      if (response.status === 410 || response.status === 404) {
        setPhase("expired")
        return
      }
      if (response.status === 401) {
        setPhase("authentication_required")
        return
      }
      if (!response.ok) throw new Error("approve_failed")
      setPhase("done")
    } catch {
      setPhase("error")
    }
  }

  if (phase === "done") {
    return (
      <div className="text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-[20px] bg-muted text-foreground">
          <HugeiconsIcon
            icon={CheckmarkCircle02Icon}
            size={29}
            strokeWidth={1.8}
          />
        </div>
        <h1 className="mt-6 text-[30px] leading-tight font-semibold tracking-[-0.04em]">
          Вход подтверждён
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Catch English уже открывается на компьютере. Это окно можно закрыть.
        </p>
        <a
          href="/my"
          className="mt-7 flex h-13 w-full items-center justify-center rounded-2xl border bg-card text-sm font-semibold text-foreground"
        >
          Открыть на телефоне
        </a>
      </div>
    )
  }

  return (
    <div className="text-center">
      <div className="mx-auto grid size-14 place-items-center rounded-[20px] bg-muted text-foreground">
        <HugeiconsIcon
          icon={ComputerPhoneSyncIcon}
          size={28}
          strokeWidth={1.8}
        />
      </div>
      <h1 className="mt-6 text-[30px] leading-tight font-semibold tracking-[-0.04em]">
        Вход на компьютере
      </h1>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        Подтверди вход, только если QR-код сейчас открыт на твоём компьютере.
      </p>

      {authError && (
        <div
          role="alert"
          className="mt-5 rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm leading-6 text-destructive"
        >
          Не удалось подтвердить аккаунт через Telegram. Попробуй ещё раз.
        </div>
      )}

      {phase === "checking" && (
        <div className="mt-7 flex h-13 items-center justify-center gap-2 text-sm text-muted-foreground">
          <HugeiconsIcon
            icon={Loading03Icon}
            size={20}
            strokeWidth={1.8}
            className="animate-spin"
          />
          Проверяем аккаунт
        </div>
      )}

      {phase === "authentication_required" && (
        <>
          <p className="mt-6 text-xs leading-5 text-muted-foreground">
            Сначала подтверди свой аккаунт через Telegram.
          </p>
          <a
            href={telegramUrl}
            className="mt-4 flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-[#229ed9] text-[15px] font-semibold text-white"
          >
            <HugeiconsIcon icon={TelegramIcon} size={22} strokeWidth={1.8} />
            Продолжить через Telegram
          </a>
        </>
      )}

      {(phase === "ready" || phase === "submitting") && (
        <>
          <div className="mt-6 rounded-2xl border bg-muted px-4 py-3 text-left">
            <p className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
              Аккаунт
            </p>
            <p className="mt-1 text-sm font-semibold">
              {user?.firstName ||
                (user?.username ? `@${user.username}` : "Catch English")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void approve()}
            disabled={phase === "submitting"}
            className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-foreground text-[15px] font-semibold text-background disabled:opacity-60"
          >
            {phase === "submitting" && (
              <HugeiconsIcon
                icon={Loading03Icon}
                size={20}
                strokeWidth={1.8}
                className="animate-spin"
              />
            )}
            Подтвердить вход
          </button>
        </>
      )}

      {(phase === "expired" || phase === "error") && (
        <div className="mt-7 rounded-2xl border bg-muted p-4 text-sm leading-6 text-muted-foreground">
          {phase === "expired"
            ? "Время QR-кода закончилось. Создай новый код на компьютере."
            : "Не удалось подтвердить вход. Вернись к компьютеру и создай новый QR-код."}
        </div>
      )}
    </div>
  )
}
