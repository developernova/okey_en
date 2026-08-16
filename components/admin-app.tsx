"use client"

import * as React from "react"
import Link from "next/link"

import { EpisodeDetailPanel } from "@/components/admin/episode-detail-panel"
import {
  PlaylistImporter,
  type PlaylistProgram,
} from "@/components/admin/playlist-importer"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"

type Status = "pending" | "processing" | "ready" | "failed"

type Episode = {
  id: string
  programId: string
  youtubeId: string
  title: string
  sequenceNumber: number
  durationSeconds: number
  transcriptLanguage: string
  ingestionStatus: Status
  isActive: boolean
  phraseCount: number
  segmentCount: number
  updatedAt: string
}

type Program = {
  id: string
  slug: string
  title: string
  description: string | null
  levelMin: string
  levelMax: string
  isActive: boolean
  createdAt: string
  episodes: Episode[]
}

type IngestionJob = {
  id: string
  episodeId: string | null
  source: string
  status: Status
  error: string | null
  model: string | null
  attemptCount: number
  nextAttemptAt: string | null
  promptTokens: number
  completionTokens: number
  totalTokens: number
  costUsd: number
  startedAt: string | null
  finishedAt: string | null
  createdAt: string
}

type Catalog = {
  stats: {
    users: number
    programs: number
    activePrograms: number
    episodes: number
    publishedEpisodes: number
    failedImports: number
  }
  programs: Program[]
  jobs: IngestionJob[]
}

type AdminSection = "content" | "courses" | "import" | "jobs"

type ProgramDraft = {
  slug: string
  title: string
  description: string
  isActive: boolean
}

const blankProgram: ProgramDraft = {
  slug: "",
  title: "",
  description: "",
  isActive: true,
}

function formatDate(value: string | null) {
  if (!value) return "—"
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value))
}

function durationLabel(seconds: number) {
  const hours = Math.floor(seconds / 3_600)
  const minutes = Math.floor((seconds % 3_600) / 60)
  const rest = seconds % 60
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`
    : `${minutes}:${String(rest).padStart(2, "0")}`
}

function llmUsageLabel(job: IngestionJob) {
  if (job.totalTokens === 0 && job.costUsd === 0) return "Нет данных"
  const tokens = new Intl.NumberFormat("ru-RU").format(job.totalTokens)
  const cost = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 4,
    maximumFractionDigits: 6,
  }).format(job.costUsd)
  return `${tokens} токенов · ≈${cost}`
}

function statusLabel(status: Status) {
  if (status === "ready") return "Готово"
  if (status === "processing") return "Обработка"
  if (status === "failed") return "Ошибка"
  return "В очереди"
}

function statusVariant(status: Status) {
  if (status === "failed") return "destructive" as const
  if (status === "ready") return "secondary" as const
  return "outline" as const
}

async function apiRequest<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...init })
  const payload = (await response.json()) as {
    data?: T
    error?: { message?: string }
  }
  if (!response.ok || payload.data === undefined) {
    const error = new Error(
      payload.error?.message ?? "Ошибка запроса"
    ) as Error & { status?: number }
    error.status = response.status
    throw error
  }
  return payload.data
}

export function AdminApp() {
  const [authenticated, setAuthenticated] = React.useState<boolean | null>(null)
  const [secret, setSecret] = React.useState("")
  const [loginError, setLoginError] = React.useState<string | null>(null)
  const [catalog, setCatalog] = React.useState<Catalog | null>(null)
  const [section, setSection] = React.useState<AdminSection>("content")
  const [loading, setLoading] = React.useState(false)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [query, setQuery] = React.useState("")
  const [programFilter, setProgramFilter] = React.useState("all")
  const [programDraft, setProgramDraft] = React.useState(blankProgram)
  const [showCreateProgram, setShowCreateProgram] = React.useState(false)
  const [editingProgram, setEditingProgram] = React.useState<string | null>(
    null
  )
  const [programEdit, setProgramEdit] = React.useState(blankProgram)
  const [editingEpisode, setEditingEpisode] = React.useState<string | null>(
    null
  )
  const [deleteConfirmEpisode, setDeleteConfirmEpisode] = React.useState<
    string | null
  >(null)
  const [episodeEdit, setEpisodeEdit] = React.useState({
    title: "",
    sequenceNumber: 1,
  })
  const [detailEpisodeId, setDetailEpisodeId] = React.useState<string | null>(
    null
  )
  const [importing, setImporting] = React.useState(false)
  const [importDraft, setImportDraft] = React.useState({
    programId: "",
    youtubeUrl: "",
    title: "",
    sequenceNumber: 1,
    transcriptLanguage: "en",
    maxPhrases: 15,
  })

  const loadCatalog = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiRequest<Catalog>("/api/admin/catalog")
      setCatalog(data)
      setAuthenticated(true)
      setImportDraft((current) => {
        if (current.programId || data.programs.length === 0) return current
        const first = data.programs[0]
        return {
          ...current,
          programId: first.id,
          sequenceNumber:
            Math.max(0, ...first.episodes.map((item) => item.sequenceNumber)) +
            1,
        }
      })
    } catch (requestError) {
      if ((requestError as Error & { status?: number }).status === 401) {
        setAuthenticated(false)
        setCatalog(null)
      } else {
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Не удалось загрузить каталог"
        )
      }
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    let cancelled = false
    void apiRequest<{ authenticated: boolean }>("/api/admin/session")
      .then(async (session) => {
        if (cancelled) return
        if (session.authenticated) await loadCatalog()
        else setAuthenticated(false)
      })
      .catch(() => !cancelled && setAuthenticated(false))
    return () => {
      cancelled = true
    }
  }, [loadCatalog])

  async function login(event: React.FormEvent) {
    event.preventDefault()
    setLoginError(null)
    setLoading(true)
    try {
      await apiRequest("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret }),
      })
      setSecret("")
      await loadCatalog()
    } catch (requestError) {
      setLoginError(
        requestError instanceof Error
          ? requestError.message
          : "Не удалось войти"
      )
      setLoading(false)
    }
  }

  async function logout() {
    await fetch("/api/admin/session", { method: "DELETE" })
    setAuthenticated(false)
    setCatalog(null)
  }

  async function mutate(action: () => Promise<unknown>, message: string) {
    setLoading(true)
    setNotice(null)
    setError(null)
    try {
      await action()
      setNotice(message)
      await loadCatalog()
      return true
    } catch (requestError) {
      if ((requestError as Error & { status?: number }).status === 401) {
        setAuthenticated(false)
        setCatalog(null)
      }
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Не удалось сохранить"
      )
      return false
    } finally {
      setLoading(false)
    }
  }

  async function createProgram(event: React.FormEvent) {
    event.preventDefault()
    const saved = await mutate(
      () =>
        apiRequest("/api/admin/programs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...programDraft,
            description: programDraft.description.trim() || null,
          }),
        }),
      "Курс создан"
    )
    if (saved) {
      setProgramDraft(blankProgram)
      setShowCreateProgram(false)
    }
  }

  function beginProgramEdit(program: Program) {
    setEditingProgram(program.id)
    setProgramEdit({
      slug: program.slug,
      title: program.title,
      description: program.description ?? "",
      isActive: program.isActive,
    })
  }

  async function saveProgram(event: React.FormEvent, id: string) {
    event.preventDefault()
    const saved = await mutate(
      () =>
        apiRequest(`/api/admin/programs/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...programEdit,
            description: programEdit.description.trim() || null,
          }),
        }),
      "Курс обновлён"
    )
    if (saved) setEditingProgram(null)
  }

  async function toggleProgram(program: Program) {
    await mutate(
      () =>
        apiRequest(`/api/admin/programs/${program.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: !program.isActive }),
        }),
      program.isActive ? "Курс скрыт" : "Курс опубликован"
    )
  }

  function beginEpisodeEdit(episode: Episode) {
    setDeleteConfirmEpisode(null)
    setEditingEpisode(episode.id)
    setEpisodeEdit({
      title: episode.title,
      sequenceNumber: episode.sequenceNumber,
    })
  }

  async function saveEpisode(event: React.FormEvent, id: string) {
    event.preventDefault()
    const saved = await mutate(
      () =>
        apiRequest(`/api/admin/episodes/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(episodeEdit),
        }),
      "Видео обновлено"
    )
    if (saved) setEditingEpisode(null)
  }

  async function toggleEpisode(episode: Episode) {
    await mutate(
      () =>
        apiRequest(`/api/admin/episodes/${episode.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: !episode.isActive }),
        }),
      episode.isActive ? "Видео скрыто" : "Видео опубликовано"
    )
  }

  async function deleteEpisode(episode: Episode) {
    const deleted = await mutate(
      () =>
        apiRequest(`/api/admin/episodes/${episode.id}`, {
          method: "DELETE",
        }),
      `Видео «${episode.title}» удалено полностью`
    )
    if (deleted) {
      setDeleteConfirmEpisode(null)
      setEditingEpisode(null)
      if (detailEpisodeId === episode.id) setDetailEpisodeId(null)
    }
  }

  function selectImportProgram(programId: string) {
    const program = catalog?.programs.find((item) => item.id === programId)
    setImportDraft((current) => ({
      ...current,
      programId,
      sequenceNumber: program
        ? Math.max(0, ...program.episodes.map((item) => item.sequenceNumber)) +
          1
        : 1,
    }))
  }

  async function importEpisode(event: React.FormEvent) {
    event.preventDefault()
    const program = catalog?.programs.find(
      (item) => item.id === importDraft.programId
    )
    if (!program) return setError("Сначала выбери или создай курс")
    setImporting(true)
    const saved = await mutate(
      () =>
        apiRequest("/api/admin/episodes/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            youtubeUrl: importDraft.youtubeUrl,
            title: importDraft.title,
            program: {
              slug: program.slug,
              title: program.title,
              description: program.description ?? undefined,
            },
            sequenceNumber: importDraft.sequenceNumber,
            transcriptLanguage: importDraft.transcriptLanguage,
            maxPhrases: importDraft.maxPhrases,
          }),
        }),
      "Видео импортировано"
    )
    setImporting(false)
    if (saved) {
      setImportDraft((current) => ({
        ...current,
        youtubeUrl: "",
        title: "",
        sequenceNumber: current.sequenceNumber + 1,
      }))
      setSection("content")
    }
  }

  if (authenticated === null) {
    return <CenteredMessage>Проверяем доступ…</CenteredMessage>
  }

  if (!authenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-5 text-zinc-100">
        <form
          onSubmit={login}
          className="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-900 p-6"
        >
          <div className="mb-6">
            <div className="text-lg font-semibold">Catch English Admin</div>
            <p className="mt-1 text-sm text-zinc-400">
              Рабочий доступ к каталогу и импортам
            </p>
          </div>
          <input
            name="username"
            value="admin"
            autoComplete="username"
            readOnly
            className="sr-only"
            tabIndex={-1}
          />
          <Field label="ADMIN_API_SECRET">
            <Input
              type="password"
              autoComplete="current-password"
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              className="bg-zinc-950"
              required
              autoFocus
            />
          </Field>
          {loginError && (
            <Alert variant="destructive" className="mt-4">
              <AlertDescription>{loginError}</AlertDescription>
            </Alert>
          )}
          <Button
            type="submit"
            disabled={loading}
            className="mt-5 w-full bg-lime-300 text-zinc-950 hover:bg-lime-200"
          >
            {loading ? "Входим…" : "Войти"}
          </Button>
        </form>
      </main>
    )
  }

  const allEpisodes =
    catalog?.programs.flatMap((program) =>
      program.episodes.map((episode) => ({
        ...episode,
        programTitle: program.title,
      }))
    ) ?? []
  const normalizedQuery = query.trim().toLocaleLowerCase("ru")
  const visibleEpisodes = allEpisodes.filter(
    (episode) =>
      (programFilter === "all" || episode.programId === programFilter) &&
      (!normalizedQuery ||
        episode.title.toLocaleLowerCase("ru").includes(normalizedQuery) ||
        episode.youtubeId.toLocaleLowerCase("ru").includes(normalizedQuery))
  )
  const nav: Array<{ id: AdminSection; label: string }> = [
    { id: "content", label: "Видео" },
    { id: "courses", label: "Курсы" },
    { id: "import", label: "Импорт" },
    { id: "jobs", label: "Запуски" },
  ]

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-950">
      <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={() => {
              setDetailEpisodeId(null)
              setSection("content")
            }}
            className="mr-auto text-left"
          >
            <div className="text-sm font-semibold">Catch English</div>
            <div className="text-xs text-zinc-500">Управление контентом</div>
          </button>
          <nav className="order-3 flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto">
            {nav.map((item) => (
              <Button
                key={item.id}
                variant={
                  !detailEpisodeId && section === item.id
                    ? "secondary"
                    : "ghost"
                }
                size="sm"
                className="shrink-0 rounded-md"
                onClick={() => {
                  setDetailEpisodeId(null)
                  setSection(item.id)
                }}
              >
                {item.label}
              </Button>
            ))}
          </nav>
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            render={<Link href="/" />}
          >
            Приложение
          </Button>
          <Button variant="outline" size="sm" onClick={() => void logout()}>
            Выйти
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6">
        {(notice || error) && (
          <Alert
            variant={error ? "destructive" : "default"}
            className="mb-4 rounded-lg bg-white"
          >
            <AlertDescription>{error ?? notice}</AlertDescription>
          </Alert>
        )}

        {detailEpisodeId ? (
          <EpisodeDetailPanel
            key={detailEpisodeId}
            episodeId={detailEpisodeId}
            onBack={() => setDetailEpisodeId(null)}
          />
        ) : (
          <>
            {section === "content" && catalog && (
              <section>
                <PageHeading
                  title="Видео"
                  description={`${catalog.stats.publishedEpisodes} опубликовано из ${catalog.stats.episodes}`}
                  action={
                    <Button onClick={() => setSection("import")}>
                      Добавить видео
                    </Button>
                  }
                />
                <div className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-zinc-200 sm:grid-cols-4">
                  <Stat label="Курсы" value={catalog.stats.programs} />
                  <Stat label="Видео" value={catalog.stats.episodes} />
                  <Stat label="Пользователи" value={catalog.stats.users} />
                  <Stat
                    label="Ошибки"
                    value={catalog.stats.failedImports}
                    danger={catalog.stats.failedImports > 0}
                  />
                </div>
                <div className="mb-3 flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Поиск по названию или YouTube ID"
                    className="max-w-xl bg-white"
                  />
                  <Select
                    value={programFilter}
                    onValueChange={(value) => value && setProgramFilter(value)}
                  >
                    <SelectTrigger className="w-full bg-white sm:w-64">
                      <SelectValue>
                        {programFilter === "all"
                          ? "Все курсы"
                          : catalog.programs.find(
                              (program) => program.id === programFilter
                            )?.title}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Все курсы</SelectItem>
                      {catalog.programs.map((program) => (
                        <SelectItem key={program.id} value={program.id}>
                          {program.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    onClick={() => void loadCatalog()}
                    disabled={loading}
                  >
                    Обновить
                  </Button>
                </div>
                <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">№</TableHead>
                        <TableHead>Видео</TableHead>
                        <TableHead>Курс</TableHead>
                        <TableHead>Контент</TableHead>
                        <TableHead>Статус</TableHead>
                        <TableHead className="w-32">Публикация</TableHead>
                        <TableHead className="w-52 text-right">
                          Действия
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleEpisodes.map((episode) => (
                        <React.Fragment key={episode.id}>
                          <TableRow>
                            <TableCell className="font-mono text-xs">
                              {episode.sequenceNumber}
                            </TableCell>
                            <TableCell className="min-w-72 whitespace-normal">
                              <button
                                type="button"
                                onClick={() => setDetailEpisodeId(episode.id)}
                                className="text-left font-medium hover:underline"
                              >
                                {episode.title}
                              </button>
                              <div className="mt-1 text-xs text-zinc-500">
                                {durationLabel(episode.durationSeconds)} ·{" "}
                                {episode.youtubeId}
                              </div>
                            </TableCell>
                            <TableCell className="whitespace-normal">
                              {episode.programTitle}
                            </TableCell>
                            <TableCell className="text-xs text-zinc-600">
                              {episode.segmentCount} субтитров
                              <br />
                              {episode.phraseCount} фраз
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={statusVariant(episode.ingestionStatus)}
                              >
                                {statusLabel(episode.ingestionStatus)}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Switch
                                checked={episode.isActive}
                                onCheckedChange={() =>
                                  void toggleEpisode(episode)
                                }
                                disabled={loading}
                                aria-label={`Публикация ${episode.title}`}
                              />
                            </TableCell>
                            <TableCell>
                              <div className="flex justify-end gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setDetailEpisodeId(episode.id)}
                                >
                                  Открыть
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => beginEpisodeEdit(episode)}
                                >
                                  Изменить
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => {
                                    setEditingEpisode(null)
                                    setDeleteConfirmEpisode(episode.id)
                                  }}
                                >
                                  Удалить
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                          {editingEpisode === episode.id && (
                            <TableRow className="bg-zinc-50">
                              <TableCell colSpan={7}>
                                <form
                                  onSubmit={(event) =>
                                    void saveEpisode(event, episode.id)
                                  }
                                  className="flex flex-col gap-3 sm:flex-row sm:items-end"
                                >
                                  <Field label="Название" className="flex-1">
                                    <Input
                                      value={episodeEdit.title}
                                      onChange={(event) =>
                                        setEpisodeEdit((current) => ({
                                          ...current,
                                          title: event.target.value,
                                        }))
                                      }
                                      required
                                    />
                                  </Field>
                                  <Field label="Номер" className="sm:w-28">
                                    <Input
                                      type="number"
                                      min={1}
                                      value={episodeEdit.sequenceNumber}
                                      onChange={(event) =>
                                        setEpisodeEdit((current) => ({
                                          ...current,
                                          sequenceNumber: Number(
                                            event.target.value
                                          ),
                                        }))
                                      }
                                      required
                                    />
                                  </Field>
                                  <Button type="submit" disabled={loading}>
                                    Сохранить
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() => setEditingEpisode(null)}
                                  >
                                    Отмена
                                  </Button>
                                </form>
                              </TableCell>
                            </TableRow>
                          )}
                          {deleteConfirmEpisode === episode.id && (
                            <TableRow className="bg-red-50">
                              <TableCell colSpan={7}>
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                  <div>
                                    <div className="font-medium text-red-900">
                                      Удалить видео полностью?
                                    </div>
                                    <p className="mt-1 text-xs leading-5 text-red-700">
                                      Будут удалены субтитры, фразы, карточки,
                                      история повторений, интервью, дневные
                                      планы и история импорта. Отменить это
                                      действие нельзя.
                                    </p>
                                  </div>
                                  <div className="flex shrink-0 gap-2">
                                    <Button
                                      variant="destructive"
                                      disabled={loading}
                                      onClick={() =>
                                        void deleteEpisode(episode)
                                      }
                                    >
                                      Да, удалить все данные
                                    </Button>
                                    <Button
                                      variant="outline"
                                      onClick={() =>
                                        setDeleteConfirmEpisode(null)
                                      }
                                    >
                                      Отмена
                                    </Button>
                                  </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      ))}
                      {visibleEpisodes.length === 0 && (
                        <TableRow>
                          <TableCell
                            colSpan={7}
                            className="h-32 text-center text-zinc-500"
                          >
                            Видео не найдены
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </section>
            )}

            {section === "courses" && catalog && (
              <section>
                <PageHeading
                  title="Курсы"
                  description="Структура каталога; диапазон уровней ИИ пересчитывает по фразам"
                  action={
                    <Button
                      onClick={() => setShowCreateProgram((value) => !value)}
                    >
                      {showCreateProgram ? "Закрыть форму" : "Новый курс"}
                    </Button>
                  }
                />
                {showCreateProgram && (
                  <div className="mb-4 rounded-lg border border-zinc-200 bg-white p-4">
                    <ProgramForm
                      draft={programDraft}
                      onChange={setProgramDraft}
                      onSubmit={(event) => void createProgram(event)}
                      submitLabel="Создать курс"
                      disabled={loading}
                      onCancel={() => setShowCreateProgram(false)}
                    />
                  </div>
                )}
                <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Название</TableHead>
                        <TableHead>Slug</TableHead>
                        <TableHead>Уровни</TableHead>
                        <TableHead>Видео</TableHead>
                        <TableHead>Публикация</TableHead>
                        <TableHead className="text-right">Действия</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {catalog.programs.map((program) => (
                        <React.Fragment key={program.id}>
                          <TableRow>
                            <TableCell className="min-w-64 whitespace-normal">
                              <div className="font-medium">{program.title}</div>
                              {program.description && (
                                <div className="mt-1 line-clamp-2 text-xs text-zinc-500">
                                  {program.description}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {program.slug}
                            </TableCell>
                            <TableCell>
                              {program.episodes.length > 0
                                ? program.levelMin === program.levelMax
                                  ? program.levelMin
                                  : `${program.levelMin}–${program.levelMax}`
                                : "После первого импорта"}
                            </TableCell>
                            <TableCell>{program.episodes.length}</TableCell>
                            <TableCell>
                              <Switch
                                checked={program.isActive}
                                onCheckedChange={() =>
                                  void toggleProgram(program)
                                }
                                disabled={loading}
                                aria-label={`Публикация ${program.title}`}
                              />
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => beginProgramEdit(program)}
                              >
                                Изменить
                              </Button>
                            </TableCell>
                          </TableRow>
                          {editingProgram === program.id && (
                            <TableRow className="bg-zinc-50">
                              <TableCell colSpan={6}>
                                <ProgramForm
                                  draft={programEdit}
                                  onChange={setProgramEdit}
                                  onSubmit={(event) =>
                                    void saveProgram(event, program.id)
                                  }
                                  submitLabel="Сохранить"
                                  disabled={loading}
                                  onCancel={() => setEditingProgram(null)}
                                />
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      ))}
                      {catalog.programs.length === 0 && (
                        <TableRow>
                          <TableCell
                            colSpan={6}
                            className="h-32 text-center text-zinc-500"
                          >
                            Создай первый курс
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </section>
            )}

            {section === "import" && catalog && (
              <section>
                <PageHeading
                  title="Импорт"
                  description="Одно видео или выбор из публичного YouTube-плейлиста"
                />
                <Tabs defaultValue="single">
                  <TabsList className="mb-4 rounded-md">
                    <TabsTrigger value="single">Одно видео</TabsTrigger>
                    <TabsTrigger value="playlist">Плейлист</TabsTrigger>
                  </TabsList>
                  <TabsContent value="single">
                    <form
                      onSubmit={(event) => void importEpisode(event)}
                      className="max-w-4xl rounded-lg border border-zinc-200 bg-white p-5"
                    >
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Курс">
                          <Select
                            value={importDraft.programId}
                            onValueChange={(value) =>
                              value && selectImportProgram(value)
                            }
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Выбрать курс" />
                            </SelectTrigger>
                            <SelectContent>
                              {catalog.programs.map((program) => (
                                <SelectItem key={program.id} value={program.id}>
                                  {program.title}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>
                        <Field label="Порядковый номер">
                          <Input
                            type="number"
                            min={1}
                            value={importDraft.sequenceNumber}
                            onChange={(event) =>
                              setImportDraft((current) => ({
                                ...current,
                                sequenceNumber: Number(event.target.value),
                              }))
                            }
                            required
                          />
                        </Field>
                        <Field
                          label="Ссылка на YouTube"
                          className="sm:col-span-2"
                        >
                          <Input
                            type="url"
                            value={importDraft.youtubeUrl}
                            onChange={(event) =>
                              setImportDraft((current) => ({
                                ...current,
                                youtubeUrl: event.target.value,
                              }))
                            }
                            placeholder="https://youtube.com/watch?v=…"
                            required
                          />
                        </Field>
                        <Field label="Название" className="sm:col-span-2">
                          <Input
                            value={importDraft.title}
                            onChange={(event) =>
                              setImportDraft((current) => ({
                                ...current,
                                title: event.target.value,
                              }))
                            }
                            required
                          />
                        </Field>
                        <Field label="Язык субтитров">
                          <Input
                            value={importDraft.transcriptLanguage}
                            onChange={(event) =>
                              setImportDraft((current) => ({
                                ...current,
                                transcriptLanguage: event.target.value,
                              }))
                            }
                            required
                          />
                        </Field>
                        <Field label="Максимум фраз">
                          <Input
                            type="number"
                            min={5}
                            max={30}
                            value={importDraft.maxPhrases}
                            onChange={(event) =>
                              setImportDraft((current) => ({
                                ...current,
                                maxPhrases: Number(event.target.value),
                              }))
                            }
                            required
                          />
                        </Field>
                      </div>
                      <p className="mt-4 rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
                        Уровень каждой фразы и диапазон курса определит ИИ во
                        время импорта.
                      </p>
                      <p className="mt-4 text-sm text-amber-800">
                        Не закрывай страницу во время импорта: субтитры и фразы
                        обрабатываются синхронно.
                      </p>
                      <Button
                        type="submit"
                        disabled={
                          loading || importing || catalog.programs.length === 0
                        }
                        className="mt-4"
                      >
                        {importing ? "Обрабатываем…" : "Импортировать"}
                      </Button>
                    </form>
                  </TabsContent>
                  <TabsContent value="playlist">
                    <PlaylistImporter
                      programs={catalog.programs as PlaylistProgram[]}
                      onComplete={loadCatalog}
                    />
                  </TabsContent>
                </Tabs>
              </section>
            )}

            {section === "jobs" && catalog && (
              <section>
                <PageHeading
                  title="Запуски импорта"
                  description="Последние 20 попыток"
                  action={
                    <Button
                      variant="outline"
                      onClick={() => void loadCatalog()}
                      disabled={loading}
                    >
                      Обновить
                    </Button>
                  }
                />
                <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Время</TableHead>
                        <TableHead>Источник</TableHead>
                        <TableHead>Статус</TableHead>
                        <TableHead>Модель</TableHead>
                        <TableHead>Попытки</TableHead>
                        <TableHead>LLM</TableHead>
                        <TableHead>Результат</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {catalog.jobs.map((job) => (
                        <TableRow key={job.id}>
                          <TableCell className="text-xs whitespace-nowrap">
                            {formatDate(job.createdAt)}
                          </TableCell>
                          <TableCell
                            className="max-w-56 truncate font-mono text-xs"
                            title={job.source}
                          >
                            {job.source}
                          </TableCell>
                          <TableCell>
                            <Badge variant={statusVariant(job.status)}>
                              {statusLabel(job.status)}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {job.model ?? "—"}
                          </TableCell>
                          <TableCell className="text-xs">
                            <div>{job.attemptCount}</div>
                            {job.nextAttemptAt && (
                              <div className="mt-1 whitespace-nowrap text-zinc-500">
                                повтор {formatDate(job.nextAttemptAt)}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="text-xs whitespace-nowrap">
                            {llmUsageLabel(job)}
                          </TableCell>
                          <TableCell
                            className={
                              job.error
                                ? "max-w-xl text-xs whitespace-normal text-red-700"
                                : "text-xs text-zinc-500"
                            }
                          >
                            {job.error ?? "Без ошибок"}
                          </TableCell>
                        </TableRow>
                      ))}
                      {catalog.jobs.length === 0 && (
                        <TableRow>
                          <TableCell
                            colSpan={7}
                            className="h-32 text-center text-zinc-500"
                          >
                            Импортов пока не было
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  )
}

function ProgramForm({
  draft,
  onChange,
  onSubmit,
  onCancel,
  submitLabel,
  disabled,
}: {
  draft: ProgramDraft
  onChange: React.Dispatch<React.SetStateAction<ProgramDraft>>
  onSubmit: (event: React.FormEvent) => void
  onCancel?: () => void
  submitLabel: string
  disabled: boolean
}) {
  return (
    <form onSubmit={onSubmit}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <Field label="Название" className="lg:col-span-2">
          <Input
            value={draft.title}
            onChange={(event) =>
              onChange((current) => ({ ...current, title: event.target.value }))
            }
            required
          />
        </Field>
        <Field label="Slug" className="lg:col-span-2">
          <Input
            value={draft.slug}
            onChange={(event) =>
              onChange((current) => ({
                ...current,
                slug: event.target.value.toLowerCase(),
              }))
            }
            pattern="[a-z0-9-]+"
            required
          />
        </Field>
        <div className="flex items-center rounded-md bg-zinc-50 px-3 text-xs leading-5 text-zinc-500 lg:col-span-2">
          Уровень определится автоматически после импорта видео.
        </div>
        <Field label="Описание" className="sm:col-span-2 lg:col-span-5">
          <Textarea
            rows={2}
            value={draft.description}
            onChange={(event) =>
              onChange((current) => ({
                ...current,
                description: event.target.value,
              }))
            }
          />
        </Field>
        <div className="flex items-end gap-2 pb-2 text-sm">
          <Switch
            checked={draft.isActive}
            onCheckedChange={(isActive) =>
              onChange((current) => ({ ...current, isActive }))
            }
          />{" "}
          Публикация
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Button type="submit" disabled={disabled}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Отмена
          </Button>
        )}
      </div>
    </form>
  )
}

function PageHeading({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-0.5 text-sm text-zinc-500">{description}</p>
      </div>
      {action}
    </div>
  )
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <Label className="text-xs text-zinc-600">{label}</Label>
      {children}
    </div>
  )
}

function Stat({
  label,
  value,
  danger = false,
}: {
  label: string
  value: number
  danger?: boolean
}) {
  return (
    <div className="bg-white px-4 py-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div
        className={`mt-1 text-xl font-semibold ${danger ? "text-red-600" : ""}`}
      >
        {value}
      </div>
    </div>
  )
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 text-sm text-zinc-400">
      {children}
    </main>
  )
}
