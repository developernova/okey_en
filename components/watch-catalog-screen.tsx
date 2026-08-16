"use client"

import * as React from "react"
import {
  ArrowLeft01Icon,
  ArrowUpRight01Icon,
  Film01Icon,
  Search01Icon,
  StarIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import Link from "next/link"

import { telegramFetch } from "@/lib/telegram"
import { cn } from "@/lib/utils"

type CatalogItem = {
  id: string
  tmdbId: number
  mediaType: "movie" | "tv"
  section: "marvel" | "movies" | "series" | "search"
  title: string
  originalTitle: string
  overview: string
  releaseYear: string
  posterUrl: string
  backdropUrl: string | null
  rating: number
  tmdbUrl: string
  genreIds: number[]
  learningLevel: "A2" | "B1" | "B2"
  recommended: boolean
}

type Provider = {
  name: string
  url: string
  logoUrl: string | null
}

const categories = [
  { id: "all", label: "Все" },
  { id: "recommended", label: "Для вас" },
  { id: "movies", label: "Фильмы" },
  { id: "series", label: "Сериалы" },
  { id: "marvel", label: "Marvel" },
  { id: "comedy", label: "Комедии" },
  { id: "drama", label: "Драмы" },
  { id: "action", label: "Экшен" },
  { id: "scifi", label: "Фантастика" },
  { id: "animation", label: "Анимация" },
] as const

type Category = (typeof categories)[number]["id"]

function matchesCategory(item: CatalogItem, category: Category) {
  if (category === "all") return true
  if (category === "recommended") return item.recommended
  if (category === "movies" || category === "series" || category === "marvel") {
    return item.section === category
  }
  const genreByCategory: Record<
    Exclude<Category, "all" | "recommended" | "movies" | "series" | "marvel">,
    number
  > = {
    comedy: 35,
    drama: 18,
    action: 28,
    scifi: 878,
    animation: 16,
  }
  return item.genreIds.includes(genreByCategory[category])
}

function fitsLearnerLevel(
  itemLevel: CatalogItem["learningLevel"],
  learnerLevel: string
) {
  const rank: Record<string, number> = {
    A1: 0,
    A2: 0,
    B1: 1,
    B2: 2,
    C1: 2,
    C2: 2,
  }
  const distance = (rank[learnerLevel] ?? 1) - rank[itemLevel]
  return distance >= 0 && distance <= 1
}

function CatalogCard({
  item,
  onSelect,
}: {
  item: CatalogItem
  onSelect: (item: CatalogItem) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className="group min-w-0 text-left"
    >
      <div
        className="relative aspect-[2/3] overflow-hidden rounded-[22px] bg-muted bg-cover bg-center shadow-sm transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-xl"
        style={{ backgroundImage: `url(${item.posterUrl})` }}
      >
        <div className="absolute right-2.5 bottom-2.5 left-2.5 flex items-center justify-between gap-2">
          <span className="inline-flex h-7 items-center rounded-lg bg-black/72 px-2 text-[11px] font-semibold text-white backdrop-blur-md">
            {item.learningLevel}
          </span>
          <span className="inline-flex h-7 items-center gap-1 rounded-lg bg-black/72 px-2 text-[11px] font-semibold text-white backdrop-blur-md">
            <HugeiconsIcon icon={StarIcon} size={13} strokeWidth={1.8} />
            {item.rating.toFixed(1)}
          </span>
        </div>
      </div>
      <h3 className="mt-3 truncate text-[15px] font-semibold tracking-[-0.02em]">
        {item.originalTitle}
      </h3>
      <p className="mt-1 truncate text-xs text-muted-foreground">
        {item.title}
        {item.releaseYear ? `, ${item.releaseYear}` : ""}
      </p>
    </button>
  )
}

function CatalogGrid({
  items,
  onSelect,
}: {
  items: CatalogItem[]
  onSelect: (item: CatalogItem) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
      {items.map((item) => (
        <CatalogCard key={item.id} item={item} onSelect={onSelect} />
      ))}
    </div>
  )
}

export function WatchCatalogScreen() {
  const [items, setItems] = React.useState<CatalogItem[]>([])
  const [learnerLevel, setLearnerLevel] = React.useState("B1")
  const [selected, setSelected] = React.useState<CatalogItem | null>(null)
  const [query, setQuery] = React.useState("")
  const [category, setCategory] = React.useState<Category>("all")
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [providers, setProviders] = React.useState<Provider[]>([])
  const [providersLoading, setProvidersLoading] = React.useState(false)
  const [fallbackUrl, setFallbackUrl] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    const timeout = window.setTimeout(
      () => {
        const load = async () => {
          setLoading(true)
          setError(null)
          try {
            const params = new URLSearchParams()
            if (query.trim()) params.set("query", query.trim())
            const response = await telegramFetch(
              `/api/catalog${params.size > 0 ? `?${params}` : ""}`,
              { cache: "no-store" }
            )
            const payload = (await response.json()) as {
              data?: CatalogItem[]
              learnerLevel?: string
              error?: { message?: string }
            }
            if (!response.ok || !payload.data) {
              throw new Error(
                payload.error?.message ?? "Не удалось открыть каталог"
              )
            }
            if (!cancelled) {
              const level = payload.learnerLevel ?? "B1"
              setItems(
                payload.data.map((item) => ({
                  ...item,
                  recommended:
                    item.recommended ||
                    fitsLearnerLevel(item.learningLevel, level),
                }))
              )
              setLearnerLevel(level)
            }
          } catch (requestError) {
            if (!cancelled) {
              setError(
                requestError instanceof Error
                  ? requestError.message
                  : "Не удалось открыть каталог"
              )
            }
          } finally {
            if (!cancelled) setLoading(false)
          }
        }
        void load()
      },
      query.trim() ? 320 : 0
    )
    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [query])

  React.useEffect(() => {
    if (!selected) return
    let cancelled = false
    const loadProviders = async () => {
      setProviders([])
      setFallbackUrl(selected.tmdbUrl)
      setProvidersLoading(true)
      try {
        const params = new URLSearchParams({
          title: selected.originalTitle,
          tmdbId: String(selected.tmdbId),
          mediaType: selected.mediaType,
        })
        if (selected.releaseYear) params.set("year", selected.releaseYear)
        const response = await telegramFetch(
          `/api/catalog/providers?${params}`,
          {
            cache: "no-store",
          }
        )
        const payload = (await response.json()) as {
          data?: {
            providers: Provider[]
            fallbackUrl: string
          }
        }
        if (!cancelled && response.ok && payload.data) {
          setProviders(payload.data.providers)
          setFallbackUrl(payload.data.fallbackUrl)
        }
      } finally {
        if (!cancelled) setProvidersLoading(false)
      }
    }
    void loadProviders()
    return () => {
      cancelled = true
    }
  }, [selected])

  const recommended = items
    .filter((item) => fitsLearnerLevel(item.learningLevel, learnerLevel))
    .slice(0, 6)
  const filtered = query.trim()
    ? items
    : category === "recommended"
      ? items.filter((item) =>
          fitsLearnerLevel(item.learningLevel, learnerLevel)
        )
      : items.filter((item) => matchesCategory(item, category))
  const catalogItems =
    category === "all" && !query.trim()
      ? items.filter((item) => !recommended.some(({ id }) => id === item.id))
      : filtered

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
          Фильмы и сериалы
        </h1>
      </header>

      <div className="mt-7 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 flex-1 [scrollbar-width:none] gap-2 overflow-x-auto pb-1 xl:flex-wrap xl:overflow-visible xl:pb-0 [&::-webkit-scrollbar]:hidden">
          {categories.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setCategory(item.id)
                setQuery("")
              }}
              className={cn(
                "h-10 shrink-0 rounded-full px-4 text-sm font-semibold transition-colors",
                category === item.id && !query
                  ? "bg-foreground text-background"
                  : "border bg-card text-muted-foreground hover:text-foreground"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <label className="flex h-11 w-full items-center gap-3 rounded-2xl border bg-card px-4 shadow-sm xl:w-80 xl:shrink-0">
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
            placeholder="Найти фильм или сериал"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </label>
      </div>

      {loading && (
        <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {Array.from({ length: 12 }, (_, index) => (
            <div
              key={index}
              className="aspect-[2/3] animate-pulse rounded-[22px] bg-muted"
            />
          ))}
        </div>
      )}

      {error && !loading && (
        <div className="mt-7 rounded-[24px] border border-destructive/20 bg-destructive/5 p-5 text-sm text-destructive">
          {error}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="mt-7 grid min-h-72 max-w-2xl place-items-center rounded-[28px] border bg-card p-8 text-center">
          <div>
            <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground">
              <HugeiconsIcon icon={Film01Icon} size={23} strokeWidth={1.8} />
            </span>
            <h2 className="mt-4 text-lg font-semibold">Ничего не найдено</h2>
          </div>
        </div>
      )}

      {!loading &&
        !error &&
        !query.trim() &&
        category === "all" &&
        recommended.length > 0 && (
          <section className="mt-9">
            <div className="mb-4 flex items-baseline gap-3">
              <h2 className="text-xl font-semibold tracking-[-0.025em]">
                Рекомендуем вам
              </h2>
              <span className="text-xs font-semibold text-muted-foreground">
                {learnerLevel}
              </span>
            </div>
            <CatalogGrid items={recommended} onSelect={setSelected} />
          </section>
        )}

      {!loading && !error && catalogItems.length > 0 && (
        <section
          className={cn("mt-7", category === "all" && !query.trim() && "mt-12")}
        >
          {category === "all" && !query.trim() && (
            <h2 className="mb-4 text-xl font-semibold tracking-[-0.025em]">
              Каталог
            </h2>
          )}
          <CatalogGrid items={catalogItems} onSelect={setSelected} />
        </section>
      )}

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 backdrop-blur-sm sm:items-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label={selected.originalTitle}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelected(null)
          }}
        >
          <section className="relative max-h-[92dvh] w-full max-w-[900px] overflow-y-auto rounded-t-[30px] border bg-background shadow-2xl sm:rounded-[30px]">
            <div
              className="relative min-h-64 bg-muted bg-cover bg-center sm:min-h-80"
              style={{
                backgroundImage: selected.backdropUrl
                  ? `linear-gradient(180deg, rgba(0,0,0,.06), rgba(0,0,0,.76)), url(${selected.backdropUrl})`
                  : undefined,
              }}
            >
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="absolute top-4 left-4 grid size-10 place-items-center rounded-2xl bg-black/55 text-white backdrop-blur-md"
                aria-label="Закрыть"
              >
                <HugeiconsIcon
                  icon={ArrowLeft01Icon}
                  size={20}
                  strokeWidth={1.9}
                />
              </button>
              <div className="absolute right-5 bottom-5 left-5 text-white sm:right-8 sm:bottom-8 sm:left-8">
                <p className="text-sm font-medium text-white/70">
                  {selected.mediaType === "movie" ? "Фильм" : "Сериал"}
                  {selected.releaseYear ? `, ${selected.releaseYear}` : ""}
                  {` · ${selected.learningLevel}`}
                </p>
                <h2 className="mt-2 max-w-3xl text-[30px] leading-tight font-semibold tracking-[-0.04em] sm:text-[44px]">
                  {selected.originalTitle}
                </h2>
              </div>
            </div>
            <div className="grid gap-7 p-5 sm:p-8 lg:grid-cols-[minmax(0,1fr)_250px]">
              <div>
                <p className="text-sm font-semibold">{selected.title}</p>
                {selected.overview && (
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                    {selected.overview}
                  </p>
                )}
              </div>
              <div>
                <p className="mb-3 text-xs font-semibold text-muted-foreground">
                  Где посмотреть
                </p>
                <div className="space-y-2">
                  {providersLoading && (
                    <div className="h-12 animate-pulse rounded-2xl bg-muted" />
                  )}
                  {!providersLoading &&
                    providers.map((provider) => (
                      <a
                        key={`${provider.name}-${provider.url}`}
                        href={provider.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex h-12 items-center justify-between gap-3 rounded-2xl border bg-card px-4 text-sm font-semibold transition-colors hover:bg-muted"
                      >
                        <span className="truncate">{provider.name}</span>
                        <HugeiconsIcon
                          icon={ArrowUpRight01Icon}
                          size={18}
                          strokeWidth={1.9}
                        />
                      </a>
                    ))}
                  {!providersLoading &&
                    providers.length === 0 &&
                    fallbackUrl && (
                      <a
                        href={fallbackUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex h-12 items-center justify-between gap-3 rounded-2xl bg-foreground px-4 text-sm font-semibold text-background"
                      >
                        <span>Найти площадку</span>
                        <HugeiconsIcon
                          icon={ArrowUpRight01Icon}
                          size={18}
                          strokeWidth={1.9}
                        />
                      </a>
                    )}
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
