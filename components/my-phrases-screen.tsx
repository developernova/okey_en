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

type PracticeMessage = {
  role: "assistant" | "user"
  content: string
  correction?: string | null
}

export function MyPhrasesScreen() {
  const [items, setItems] = React.useState<PhraseItem[]>([])
  const [query, setQuery] = React.useState("")
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [practicePhrase, setPracticePhrase] = React.useState<PhraseItem | null>(
    null
  )
  const [practiceMessages, setPracticeMessages] = React.useState<
    PracticeMessage[]
  >([])
  const [practiceDraft, setPracticeDraft] = React.useState("")
  const [practiceLoading, setPracticeLoading] = React.useState(false)
  const [practiceError, setPracticeError] = React.useState<string | null>(null)

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

  async function openPractice(item: PhraseItem) {
    setPracticePhrase(item)
    setPracticeMessages([])
    setPracticeDraft("")
    setPracticeError(null)
    setPracticeLoading(true)
    try {
      const response = await telegramFetch("/api/phrases/practice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", cardId: item.id }),
      })
      const payload = (await response.json()) as {
        data?: { message: string; correction: string | null }
        error?: { message?: string }
      }
      if (!response.ok || !payload.data) {
        throw new Error(payload.error?.message ?? "Не удалось начать разговор")
      }
      setPracticeMessages([
        {
          role: "assistant",
          content: payload.data.message,
          correction: payload.data.correction,
        },
      ])
    } catch (requestError) {
      setPracticeError(
        requestError instanceof Error
          ? requestError.message
          : "Не удалось начать разговор"
      )
    } finally {
      setPracticeLoading(false)
    }
  }

  async function sendPracticeMessage(event: React.FormEvent) {
    event.preventDefault()
    if (!practicePhrase || !practiceDraft.trim() || practiceLoading) return
    const userMessage: PracticeMessage = {
      role: "user",
      content: practiceDraft.trim(),
    }
    const nextMessages = [...practiceMessages, userMessage]
    setPracticeMessages(nextMessages)
    setPracticeDraft("")
    setPracticeError(null)
    setPracticeLoading(true)
    try {
      const response = await telegramFetch("/api/phrases/practice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reply",
          cardId: practicePhrase.id,
          messages: nextMessages.map(({ role, content }) => ({
            role,
            content,
          })),
        }),
      })
      const payload = (await response.json()) as {
        data?: { message: string; correction: string | null }
        error?: { message?: string }
      }
      if (!response.ok || !payload.data) {
        throw new Error(
          payload.error?.message ?? "Не удалось продолжить разговор"
        )
      }
      setPracticeMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: payload.data!.message,
          correction: payload.data!.correction,
        },
      ])
    } catch (requestError) {
      setPracticeError(
        requestError instanceof Error
          ? requestError.message
          : "Не удалось продолжить разговор"
      )
    } finally {
      setPracticeLoading(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1280px] px-5 pt-[calc(28px+var(--app-safe-top))] pb-10 sm:px-8 lg:px-10 lg:pt-[calc(44px+var(--app-safe-top))]">
      <header className="flex items-center gap-4">
        <Link
          href="/my"
          aria-label="На экран Сегодня"
          className="grid size-10 shrink-0 place-items-center rounded-2xl border bg-card transition-colors hover:bg-muted"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={20} strokeWidth={1.9} />
        </Link>
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
                <button
                  type="button"
                  onClick={() => void openPractice(item)}
                  className="inline-flex h-9 shrink-0 items-center gap-2 rounded-xl bg-muted px-3 text-xs font-semibold transition-colors hover:bg-accent"
                >
                  <HugeiconsIcon icon={SentIcon} size={18} strokeWidth={1.8} />
                  Поговорить
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {practicePhrase && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/20 p-0 backdrop-blur-[3px] sm:items-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label={`Разговор с фразой ${practicePhrase.phrase}`}
        >
          <section className="flex max-h-[88dvh] w-full max-w-[680px] flex-col overflow-hidden rounded-t-[28px] border bg-background shadow-2xl sm:rounded-[28px]">
            <header className="flex items-center gap-3 border-b px-4 py-4 sm:px-5">
              <button
                type="button"
                onClick={() => setPracticePhrase(null)}
                className="grid size-9 shrink-0 place-items-center rounded-xl hover:bg-muted"
                aria-label="Закрыть разговор"
              >
                <HugeiconsIcon
                  icon={ArrowLeft01Icon}
                  size={19}
                  strokeWidth={1.9}
                />
              </button>
              <p className="truncate text-sm font-semibold" lang="en">
                {practicePhrase.phrase}
              </p>
            </header>

            <div className="min-h-64 flex-1 space-y-3 overflow-y-auto px-4 py-5 sm:px-6">
              {practiceMessages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={
                    message.role === "user"
                      ? "ml-auto max-w-[82%] rounded-[18px] rounded-br-md bg-foreground px-4 py-3 text-sm leading-6 text-background"
                      : "max-w-[88%] rounded-[18px] rounded-bl-md bg-card px-4 py-3 text-sm leading-6 shadow-sm"
                  }
                >
                  <p lang="en">{message.content}</p>
                  {message.correction && (
                    <p className="mt-2 border-t pt-2 text-xs text-muted-foreground">
                      {message.correction}
                    </p>
                  )}
                </div>
              ))}
              {practiceLoading && (
                <div className="w-fit rounded-[18px] rounded-bl-md bg-card px-4 py-3 text-sm text-muted-foreground shadow-sm">
                  Думает
                </div>
              )}
              {practiceError && (
                <p className="rounded-2xl bg-destructive/5 px-4 py-3 text-xs text-destructive">
                  {practiceError}
                </p>
              )}
            </div>

            <form
              onSubmit={(event) => void sendPracticeMessage(event)}
              className="flex gap-2 border-t bg-card/60 p-3 sm:p-4"
            >
              <input
                value={practiceDraft}
                onChange={(event) => setPracticeDraft(event.target.value)}
                placeholder="Ответь по-английски"
                maxLength={600}
                className="h-12 min-w-0 flex-1 rounded-2xl border bg-background px-4 text-sm outline-none focus:ring-2 focus:ring-ring/30"
              />
              <button
                type="submit"
                disabled={!practiceDraft.trim() || practiceLoading}
                className="grid size-12 shrink-0 place-items-center rounded-2xl bg-foreground text-background disabled:opacity-35"
                aria-label="Отправить"
              >
                <HugeiconsIcon icon={SentIcon} size={20} strokeWidth={1.9} />
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}
