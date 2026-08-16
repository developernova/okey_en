"use client"

import * as React from "react"
import {
  ArrowLeft01Icon,
  Cards01Icon,
  Search01Icon,
  SentIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import Link from "next/link"

import { telegramFetch } from "@/lib/telegram"
import { useTelegramNativeBack } from "@/components/use-telegram-native-back"

type PhraseItem = {
  id: string
  source: "review"
  phrase: string
  translationRu: string
  contextSentence: string | null
  due: string | null
  difficulty: number
  lapses: number
  reps: number
  episodeTitle: string | null
  programTitle: string | null
}

export function MyPhrasesScreen() {
  const nativeBackAvailable = useTelegramNativeBack("/my")
  const [items, setItems] = React.useState<PhraseItem[]>([])
  const [query, setQuery] = React.useState("")
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const response = await telegramFetch("/api/phrases", {
          cache: "no-store",
        })
        const payload = (await response.json()) as {
          data?: PhraseItem[]
          error?: { message?: string }
        }
        if (!response.ok || !payload.data) {
          throw new Error(payload.error?.message ?? "Не удалось открыть фразы")
        }
        if (!cancelled) setItems(payload.data)
      } catch (requestError) {
        if (!cancelled) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Не удалось открыть фразы"
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const normalizedQuery = query.trim().toLocaleLowerCase("ru")
  const filtered = items.filter((item) => {
    if (!normalizedQuery) return true
    return `${item.phrase} ${item.translationRu} ${item.contextSentence ?? ""}`
      .toLocaleLowerCase("ru")
      .includes(normalizedQuery)
  })

  return (
    <div className="mx-auto w-full max-w-[1280px] px-5 pt-[calc(var(--app-page-top)+var(--app-safe-top))] pb-10 sm:px-8 lg:px-10 lg:pt-[calc(44px+var(--app-safe-top))]">
      <header className="flex items-center gap-4">
        {!nativeBackAvailable && (
          <Link
            href="/my"
            aria-label="На экран Сегодня"
            className="grid size-10 shrink-0 place-items-center rounded-2xl border bg-card transition-colors hover:bg-muted"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} size={20} strokeWidth={1.9} />
          </Link>
        )}
        <h1 className="text-[34px] leading-none font-semibold tracking-[-0.045em] sm:text-[46px]">
          Мои фразы
        </h1>
      </header>

      <label className="mt-7 flex h-12 max-w-xl items-center gap-3 rounded-2xl border bg-card px-4 shadow-sm">
        <HugeiconsIcon
          icon={Search01Icon}
          size={19}
          strokeWidth={1.8}
          className="text-muted-foreground"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Найти фразу"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </label>

      {loading && (
        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((item) => (
            <div
              key={item}
              className="h-48 animate-pulse rounded-[24px] bg-muted"
            />
          ))}
        </div>
      )}

      {error && !loading && (
        <div className="mt-6 rounded-[24px] border border-destructive/20 bg-destructive/5 p-5 text-sm text-destructive">
          {error}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="mt-6 grid min-h-72 max-w-2xl place-items-center rounded-[28px] border bg-card p-8 text-center">
          <div>
            <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
              <HugeiconsIcon icon={Cards01Icon} size={23} strokeWidth={1.8} />
            </span>
            <h2 className="mt-4 text-lg font-semibold">
              {items.length === 0 ? "Фраз пока нет" : "Ничего не найдено"}
            </h2>
          </div>
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item) => (
            <article
              key={item.id}
              className="group flex min-h-48 flex-col rounded-[24px] border bg-card p-5 shadow-sm transition-transform duration-200 hover:-translate-y-0.5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p
                    className="text-[20px] font-semibold tracking-[-0.025em]"
                    lang="en"
                  >
                    {item.phrase}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {item.translationRu}
                  </p>
                </div>
              </div>

              {item.contextSentence && (
                <p
                  className="mt-5 border-l-2 pl-3 text-sm leading-6 text-muted-foreground"
                  lang="en"
                >
                  {item.contextSentence}
                </p>
              )}

              <div className="mt-auto flex items-end justify-between gap-3 pt-5">
                <p className="min-w-0 truncate text-[11px] text-muted-foreground">
                  {item.programTitle}
                </p>
                <Link
                  href={`/my/phrases/${item.id}/practice`}
                  className="inline-flex h-9 shrink-0 items-center gap-2 rounded-xl bg-control px-3 text-xs font-semibold transition-colors hover:bg-muted"
                >
                  <HugeiconsIcon icon={SentIcon} size={18} strokeWidth={1.8} />
                  Поговорить
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  )
}
