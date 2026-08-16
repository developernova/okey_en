"use client"

import * as React from "react"
import {
  ArrowLeft01Icon,
  Moon02Icon,
  Notification01Icon,
  Sun03Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import Link from "next/link"

import { useTheme } from "@/components/theme-provider"
import { telegramFetch } from "@/lib/telegram"
import { cn } from "@/lib/utils"

type ProgramSetting = {
  id: string | null
  slug: string
  title: string
  description: string
  level: string
  coverage: number | null
  isActive: boolean
  isPending: boolean
  isUnlocked: boolean
  unlockCoverage: number
  hasContent: boolean
}

export function SettingsScreen() {
  const [programs, setPrograms] = React.useState<ProgramSetting[] | null>(null)
  const [reminder, setReminder] = React.useState("19:00")
  const [reminderEnabled, setReminderEnabled] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const { resolvedTheme, setTheme } = useTheme()

  const load = React.useCallback(async () => {
    setError(null)
    try {
      const [programResponse, reminderResponse] = await Promise.all([
        telegramFetch("/api/programs", { cache: "no-store" }),
        telegramFetch("/api/reminders", { cache: "no-store" }),
      ])
      const programPayload = (await programResponse.json()) as {
        data?: ProgramSetting[]
        error?: { message?: string }
      }
      if (!programResponse.ok || !programPayload.data) {
        throw new Error(
          programPayload.error?.message ?? "Не удалось открыть настройки"
        )
      }
      setPrograms(programPayload.data)

      const reminderPayload = (await reminderResponse.json()) as {
        data?: { time: string | null }
      }
      if (reminderResponse.ok && reminderPayload.data) {
        setReminderEnabled(reminderPayload.data.time !== null)
        if (reminderPayload.data.time) setReminder(reminderPayload.data.time)
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Не удалось открыть настройки"
      )
    }
  }, [])

  React.useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0)
    return () => window.clearTimeout(timeout)
  }, [load])

  async function selectProgram(programId: string) {
    setSaving(true)
    setError(null)
    try {
      const response = await telegramFetch("/api/programs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programId }),
      })
      if (!response.ok) throw new Error("Не удалось сменить программу")
      await load()
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Не удалось сменить программу"
      )
    } finally {
      setSaving(false)
    }
  }

  async function saveReminder(time: string | null) {
    setSaving(true)
    setError(null)
    try {
      const response = await telegramFetch("/api/reminders", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ time }),
      })
      if (!response.ok) throw new Error("Не удалось сохранить напоминание")
      setReminderEnabled(time !== null)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Не удалось сохранить напоминание"
      )
    } finally {
      setSaving(false)
    }
  }

  async function logout() {
    await fetch("/api/auth/web/session", {
      method: "DELETE",
      cache: "no-store",
    }).catch(() => undefined)
    window.location.assign("/login")
  }

  const dark = resolvedTheme === "dark"

  return (
    <div className="mx-auto min-h-dvh w-full max-w-[1280px] px-5 pt-[calc(28px+var(--app-safe-top))] pb-[calc(100px+var(--app-safe-bottom))] sm:px-8 lg:px-10 lg:pt-[calc(44px+var(--app-safe-top))] lg:pb-12">
      <header className="flex items-center gap-4">
        <Link
          href="/my"
          aria-label="На экран Сегодня"
          className="grid size-10 shrink-0 place-items-center rounded-2xl border bg-card transition-colors hover:bg-muted"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={20} strokeWidth={1.9} />
        </Link>
        <h1 className="text-[34px] leading-none font-semibold tracking-[-0.045em] sm:text-[46px]">
          Настройки
        </h1>
      </header>

      <div className="mt-8 grid max-w-5xl gap-4 lg:grid-cols-2">
        <section className="rounded-[24px] border bg-card p-5">
          <h2 className="text-sm font-semibold">Оформление</h2>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setTheme("light")}
              className={cn(
                "flex h-12 items-center justify-center gap-2 rounded-2xl border text-sm font-semibold",
                !dark ? "border-foreground bg-muted" : "bg-background"
              )}
            >
              <HugeiconsIcon icon={Sun03Icon} size={19} strokeWidth={1.8} />
              Светлая
            </button>
            <button
              type="button"
              onClick={() => setTheme("dark")}
              className={cn(
                "flex h-12 items-center justify-center gap-2 rounded-2xl border text-sm font-semibold",
                dark ? "border-foreground bg-muted" : "bg-background"
              )}
            >
              <HugeiconsIcon icon={Moon02Icon} size={19} strokeWidth={1.8} />
              Тёмная
            </button>
          </div>
        </section>

        <section className="rounded-[24px] border bg-card p-5">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-muted">
              <HugeiconsIcon
                icon={Notification01Icon}
                size={19}
                strokeWidth={1.8}
              />
            </span>
            <h2 className="text-sm font-semibold">Напоминание</h2>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <input
              aria-label="Время напоминания"
              type="time"
              value={reminder}
              onChange={(event) => setReminder(event.target.value)}
              className="h-11 min-w-0 flex-1 rounded-xl bg-muted px-3 text-sm font-semibold tabular-nums outline-none"
            />
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveReminder(reminder)}
              className="h-11 rounded-xl bg-foreground px-4 text-sm font-semibold text-background disabled:opacity-40"
            >
              {reminderEnabled ? "Сохранить" : "Включить"}
            </button>
          </div>
          {reminderEnabled && (
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveReminder(null)}
              className="mt-3 text-xs font-semibold text-muted-foreground"
            >
              Выключить
            </button>
          )}
        </section>
      </div>

      <section className="mt-4 max-w-5xl rounded-[24px] border bg-card p-5">
        <h2 className="text-sm font-semibold">Программа</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {programs?.map((program, index) => {
            const canSelect =
              Boolean(program.id) &&
              program.isUnlocked &&
              !program.isActive &&
              !program.isPending
            return (
              <button
                key={program.slug}
                type="button"
                disabled={!canSelect || saving}
                onClick={() => {
                  if (program.id) void selectProgram(program.id)
                }}
                className={cn(
                  "flex w-full items-center gap-4 rounded-[20px] border bg-background p-3 text-left",
                  program.isActive &&
                    "border-foreground ring-1 ring-foreground",
                  program.isPending && "border-[#6f9474] ring-1 ring-[#6f9474]",
                  !program.isUnlocked && "opacity-55"
                )}
              >
                <span
                  className={cn(
                    "grid size-14 shrink-0 place-items-center rounded-2xl text-sm font-bold text-white",
                    index === 0
                      ? "bg-[#b58d59]"
                      : index === 1
                        ? "bg-[#80716a]"
                        : "bg-[#668164]"
                  )}
                >
                  {program.title
                    .split(" ")
                    .map((word) => word[0])
                    .join("")
                    .slice(0, 2)}
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold">
                      {program.title}
                    </span>
                    <span className="rounded-full bg-muted px-2 py-1 text-[10px] text-muted-foreground">
                      {program.level}
                    </span>
                  </span>
                  <span className="mt-1 line-clamp-2 block text-xs leading-5 text-muted-foreground">
                    {program.description}
                  </span>
                </span>
              </button>
            )
          })}
          {!programs && !error && (
            <div className="h-20 animate-pulse rounded-[20px] bg-muted" />
          )}
        </div>
      </section>

      {error && (
        <p className="mt-4 max-w-5xl rounded-2xl bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </p>
      )}

      <section className="mt-4 max-w-5xl rounded-[24px] border bg-card p-5 text-sm">
        <h2 className="font-semibold">Контакты и данные</h2>
        <a href="mailto:admin@dakhe.ru" className="mt-3 block font-semibold">
          admin@dakhe.ru
        </a>
        <p className="mt-3 max-w-2xl text-xs leading-5 text-muted-foreground">
          This product uses the TMDB API but is not endorsed or certified by
          TMDB.
        </p>
      </section>

      <button
        type="button"
        onClick={() => void logout()}
        className="mt-4 h-12 w-full max-w-5xl rounded-2xl border bg-card text-sm font-semibold text-muted-foreground"
      >
        Выйти из аккаунта
      </button>
    </div>
  )
}
