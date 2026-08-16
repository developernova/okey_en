"use client"

import * as React from "react"
import Image from "next/image"
import Link from "next/link"
import {
  Alert02Icon,
  BookOpen01Icon,
  Delete02Icon,
  Edit02Icon,
  Home01Icon,
  Logout01Icon,
  PlayIcon,
  PlayListIcon,
  PlusSignIcon,
  RefreshIcon,
  Search01Icon,
  Upload01Icon,
  User03Icon,
  Video01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { EpisodeDetailPanel } from "@/components/admin/episode-detail-panel"
import {
  PlaylistImporter,
  type PlaylistProgram,
} from "@/components/admin/playlist-importer"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
      <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f3f6f3] px-5 text-[#172019]">
        <div className="absolute -top-40 -left-32 size-[34rem] rounded-full bg-[#dfeae1]/70 blur-3xl" />
        <div className="absolute -right-40 -bottom-52 size-[38rem] rounded-full bg-white blur-3xl" />
        <form
          onSubmit={login}
          className="relative w-full max-w-[420px] rounded-3xl border border-white/80 bg-white/90 p-7 shadow-[0_24px_70px_rgba(35,57,40,0.12)] backdrop-blur sm:p-9"
        >
          <div className="mb-8 flex items-center gap-3">
            <ProjectLogo />
            <div>
              <div className="text-lg font-semibold tracking-[-0.02em]">
                Catch English
              </div>
              <p className="mt-0.5 text-sm text-[#7a857d]">
                Панель администратора
              </p>
            </div>
          </div>
          <div className="mb-6">
            <h1 className="text-2xl font-semibold tracking-[-0.035em]">
              Добро пожаловать
            </h1>
            <p className="mt-2 text-sm leading-6 text-[#758078]">
              Введите ключ доступа, чтобы управлять курсами и видео.
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
              className="h-11 rounded-xl border-[#dfe5df] bg-[#fafbfa] px-4 focus-visible:border-[#51745b]"
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
            className="mt-5 h-11 w-full rounded-xl bg-[#315b40] text-white shadow-[0_8px_20px_rgba(49,91,64,0.18)] hover:bg-[#274c35]"
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
  const editingEpisodeData = allEpisodes.find(
    (episode) => episode.id === editingEpisode
  )
  const deletingEpisodeData = allEpisodes.find(
    (episode) => episode.id === deleteConfirmEpisode
  )
  const editingProgramData = catalog?.programs.find(
    (program) => program.id === editingProgram
  )
  const nav: Array<{
    id: AdminSection
    label: string
    icon: typeof PlayIcon
  }> = [
    { id: "content", label: "Видео", icon: Video01Icon },
    { id: "courses", label: "Курсы", icon: BookOpen01Icon },
    { id: "import", label: "Импорт", icon: Upload01Icon },
    { id: "jobs", label: "Запуски", icon: PlayListIcon },
  ]

  return (
    <div className="admin-shell min-h-screen bg-[#f7f8f7] text-[#172019]">
      <Dialog
        open={Boolean(editingEpisodeData)}
        onOpenChange={(open) => !open && setEditingEpisode(null)}
      >
        <DialogContent className="rounded-3xl border border-[#e2e7e2] p-6 sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold tracking-[-0.025em]">
              Редактировать видео
            </DialogTitle>
            <DialogDescription>
              Измените название и позицию видео внутри курса.
            </DialogDescription>
          </DialogHeader>
          {editingEpisodeData && (
            <form
              onSubmit={(event) =>
                void saveEpisode(event, editingEpisodeData.id)
              }
              className="space-y-5"
            >
              <Field label="Название">
                <Input
                  value={episodeEdit.title}
                  onChange={(event) =>
                    setEpisodeEdit((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  className="h-11 rounded-xl border-[#e0e5e1] bg-white px-4"
                  required
                  autoFocus
                />
              </Field>
              <Field label="Порядковый номер">
                <Input
                  type="number"
                  min={1}
                  value={episodeEdit.sequenceNumber}
                  onChange={(event) =>
                    setEpisodeEdit((current) => ({
                      ...current,
                      sequenceNumber: Number(event.target.value),
                    }))
                  }
                  className="h-11 rounded-xl border-[#e0e5e1] bg-white px-4"
                  required
                />
              </Field>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingEpisode(null)}
                  className="rounded-xl"
                >
                  Отмена
                </Button>
                <Button
                  type="submit"
                  disabled={loading}
                  className="rounded-xl bg-[#315b40] text-white hover:bg-[#274c35]"
                >
                  {loading ? "Сохраняем…" : "Сохранить"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deletingEpisodeData)}
        onOpenChange={(open) => !open && setDeleteConfirmEpisode(null)}
      >
        <DialogContent className="rounded-3xl border border-red-100 p-6 sm:max-w-lg">
          <DialogHeader>
            <span className="mb-2 grid size-11 place-items-center rounded-2xl bg-red-50 text-red-600">
              <Icon icon={Delete02Icon} size={21} />
            </span>
            <DialogTitle className="text-xl font-semibold tracking-[-0.025em]">
              Удалить видео полностью?
            </DialogTitle>
            <DialogDescription className="leading-6">
              {deletingEpisodeData
                ? `«${deletingEpisodeData.title}» и все связанные данные будут удалены без возможности восстановления.`
                : "Видео и все связанные данные будут удалены без возможности восстановления."}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-2xl bg-red-50/70 p-4 text-xs leading-5 text-red-800">
            Будут удалены субтитры, фразы, карточки, история повторений,
            интервью, дневные планы и история импорта.
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteConfirmEpisode(null)}
              className="rounded-xl"
            >
              Отмена
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={loading || !deletingEpisodeData}
              onClick={() =>
                deletingEpisodeData && void deleteEpisode(deletingEpisodeData)
              }
              className="rounded-xl bg-red-600 text-white hover:bg-red-700"
            >
              {loading ? "Удаляем…" : "Удалить видео"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(editingProgramData)}
        onOpenChange={(open) => !open && setEditingProgram(null)}
      >
        <DialogContent className="rounded-3xl border border-[#e2e7e2] p-6 sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold tracking-[-0.025em]">
              Редактировать курс
            </DialogTitle>
            <DialogDescription>
              Обновите название, адрес и описание курса.
            </DialogDescription>
          </DialogHeader>
          {editingProgramData && (
            <ProgramForm
              draft={programEdit}
              onChange={setProgramEdit}
              onSubmit={(event) =>
                void saveProgram(event, editingProgramData.id)
              }
              submitLabel="Сохранить"
              disabled={loading}
              onCancel={() => setEditingProgram(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-[#e6e9e6] bg-white md:flex">
        <button
          type="button"
          onClick={() => {
            setDetailEpisodeId(null)
            setSection("content")
          }}
          className="flex h-[82px] items-center gap-3 border-b border-[#eef0ee] px-6 text-left"
        >
          <ProjectLogo />
          <span>
            <span className="block text-[15px] font-semibold tracking-[-0.02em]">
              Catch English
            </span>
            <span className="mt-0.5 block text-[11px] text-[#879087]">
              Управление контентом
            </span>
          </span>
        </button>

        <nav className="space-y-1 px-4 py-8" aria-label="Разделы админки">
          {nav.map((item) => {
            const active = !detailEpisodeId && section === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setDetailEpisodeId(null)
                  setSection(item.id)
                }}
                className={`flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors ${
                  active
                    ? "bg-[#edf3ee] text-[#315b40]"
                    : "text-[#667069] hover:bg-[#f5f7f5] hover:text-[#26372a]"
                }`}
              >
                <span
                  className={`grid size-7 place-items-center rounded-lg ${
                    active ? "bg-[#dce9de]" : ""
                  }`}
                >
                  <Icon icon={item.icon} size={18} />
                </span>
                {item.label}
              </button>
            )
          })}
        </nav>

        <div className="mt-auto p-4">
          <Button
            variant="ghost"
            nativeButton={false}
            render={<Link href="/" />}
            className="mb-1 h-10 w-full justify-start gap-3 rounded-xl px-3 text-[#667069]"
          >
            <Icon icon={Home01Icon} size={18} />
            Приложение
          </Button>
          <Button
            variant="ghost"
            onClick={() => void logout()}
            className="h-10 w-full justify-start gap-3 rounded-xl px-3 text-[#667069] hover:text-red-700"
          >
            <Icon icon={Logout01Icon} size={18} />
            Выйти
          </Button>
        </div>
      </aside>

      <div className="md:pl-64">
        <main className="mx-auto max-w-[1540px] px-4 py-6 pb-28 sm:px-7 lg:px-9 lg:py-8">
          {(notice || error) && (
            <Alert
              variant={error ? "destructive" : "default"}
              className="mb-5 rounded-xl border-[#dfe5df] bg-white shadow-[0_10px_30px_rgba(31,48,35,0.04)]"
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
                      <Button
                        onClick={() => setSection("import")}
                        className="h-10 gap-2 rounded-xl bg-[#315b40] px-4 text-white shadow-[0_8px_18px_rgba(49,91,64,0.16)] hover:bg-[#274c35]"
                      >
                        <Icon icon={PlusSignIcon} size={17} />
                        Добавить видео
                      </Button>
                    }
                  />
                  <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <Stat
                      label="Курсы"
                      value={catalog.stats.programs}
                      icon={BookOpen01Icon}
                    />
                    <Stat
                      label="Видео"
                      value={catalog.stats.episodes}
                      icon={Video01Icon}
                    />
                    <Stat
                      label="Пользователи"
                      value={catalog.stats.users}
                      icon={User03Icon}
                    />
                    <Stat
                      label="Ошибки"
                      value={catalog.stats.failedImports}
                      danger={catalog.stats.failedImports > 0}
                      icon={Alert02Icon}
                    />
                  </div>
                  <div className="mb-4 flex flex-col gap-2 sm:flex-row">
                    <div className="relative w-full max-w-xl">
                      <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-[#829087]">
                        <Icon icon={Search01Icon} size={18} />
                      </span>
                      <Input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Поиск по названию или YouTube ID"
                        className="h-11 rounded-xl border-[#e0e5e1] bg-white pr-4 pl-11 shadow-[0_3px_12px_rgba(31,48,35,0.025)]"
                      />
                    </div>
                    <Select
                      value={programFilter}
                      onValueChange={(value) =>
                        value && setProgramFilter(value)
                      }
                    >
                      <SelectTrigger className="h-11 w-full rounded-xl border-[#e0e5e1] bg-white px-4 sm:w-64">
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
                      className="h-11 gap-2 rounded-xl border-[#e0e5e1] bg-white px-4 text-[#526159]"
                    >
                      <Icon icon={RefreshIcon} size={17} />
                      Обновить
                    </Button>
                  </div>
                  <div className="overflow-hidden rounded-2xl border border-[#e2e7e2] bg-white shadow-[0_10px_35px_rgba(31,48,35,0.04)]">
                    <Table>
                      <TableHeader className="bg-[#fbfcfb]">
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
                            <TableRow className="border-[#edf0ed] hover:bg-[#f8faf8]">
                              <TableCell className="font-mono text-xs">
                                {episode.sequenceNumber}
                              </TableCell>
                              <TableCell className="min-w-80 whitespace-normal">
                                <div className="flex items-center gap-3">
                                  <EpisodeThumbnail
                                    youtubeId={episode.youtubeId}
                                    duration={durationLabel(
                                      episode.durationSeconds
                                    )}
                                  />
                                  <div className="min-w-0">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setDetailEpisodeId(episode.id)
                                      }
                                      className="line-clamp-1 text-left font-medium text-[#1e2921] hover:text-[#315b40] hover:underline"
                                    >
                                      {episode.title}
                                    </button>
                                    <div className="mt-1 truncate text-xs text-[#8a938c]">
                                      {durationLabel(episode.durationSeconds)} ·{" "}
                                      {episode.youtubeId}
                                    </div>
                                  </div>
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
                                  variant={statusVariant(
                                    episode.ingestionStatus
                                  )}
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
                                    variant="outline"
                                    onClick={() =>
                                      setDetailEpisodeId(episode.id)
                                    }
                                    className="rounded-xl border-[#e2e7e2] px-3.5"
                                  >
                                    Открыть
                                  </Button>
                                  <Button
                                    size="icon-sm"
                                    variant="outline"
                                    onClick={() => beginEpisodeEdit(episode)}
                                    aria-label={`Изменить ${episode.title}`}
                                    className="rounded-xl border-[#e2e7e2]"
                                  >
                                    <Icon icon={Edit02Icon} size={16} />
                                  </Button>
                                  <Button
                                    size="icon-sm"
                                    variant="destructive"
                                    onClick={() => {
                                      setEditingEpisode(null)
                                      setDeleteConfirmEpisode(episode.id)
                                    }}
                                    aria-label={`Удалить ${episode.title}`}
                                    className="rounded-xl"
                                  >
                                    <Icon icon={Delete02Icon} size={16} />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
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
                        className="h-10 gap-2 rounded-xl bg-[#315b40] px-4 text-white hover:bg-[#274c35]"
                      >
                        {!showCreateProgram && (
                          <Icon icon={PlusSignIcon} size={17} />
                        )}
                        {showCreateProgram ? "Закрыть форму" : "Новый курс"}
                      </Button>
                    }
                  />
                  {showCreateProgram && (
                    <div className="mb-5 rounded-2xl border border-[#e2e7e2] bg-white p-5 shadow-[0_10px_35px_rgba(31,48,35,0.04)]">
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
                  <div className="overflow-hidden rounded-2xl border border-[#e2e7e2] bg-white shadow-[0_10px_35px_rgba(31,48,35,0.04)]">
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
                                <div className="font-medium">
                                  {program.title}
                                </div>
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
                        className="max-w-4xl rounded-2xl border border-[#e2e7e2] bg-white p-5 shadow-[0_10px_35px_rgba(31,48,35,0.04)] sm:p-6"
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
                                  <SelectItem
                                    key={program.id}
                                    value={program.id}
                                  >
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
                        <p className="mt-4 rounded-xl bg-[#f3f6f3] px-4 py-3 text-sm text-[#647068]">
                          Уровень каждой фразы и диапазон курса определит ИИ во
                          время импорта.
                        </p>
                        <p className="mt-4 text-sm text-amber-800">
                          Не закрывай страницу во время импорта: субтитры и
                          фразы обрабатываются синхронно.
                        </p>
                        <Button
                          type="submit"
                          disabled={
                            loading ||
                            importing ||
                            catalog.programs.length === 0
                          }
                          className="mt-5 h-10 rounded-xl bg-[#315b40] px-4 text-white hover:bg-[#274c35]"
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
                        className="h-10 gap-2 rounded-xl border-[#e0e5e1] bg-white px-4"
                      >
                        <Icon icon={RefreshIcon} size={17} />
                        Обновить
                      </Button>
                    }
                  />
                  <div className="overflow-hidden rounded-2xl border border-[#e2e7e2] bg-white shadow-[0_10px_35px_rgba(31,48,35,0.04)]">
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
        <nav className="fixed inset-x-3 bottom-3 z-30 grid grid-cols-4 rounded-2xl border border-[#e2e7e2] bg-white/95 p-1.5 shadow-[0_14px_40px_rgba(31,48,35,0.16)] backdrop-blur-xl md:hidden">
          {nav.map((item) => {
            const active = !detailEpisodeId && section === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setDetailEpisodeId(null)
                  setSection(item.id)
                }}
                className={`flex min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-2 text-[10px] font-medium transition-colors ${
                  active ? "bg-[#edf3ee] text-[#315b40]" : "text-[#7b867e]"
                }`}
              >
                <Icon icon={item.icon} size={18} />
                <span className="truncate">{item.label}</span>
              </button>
            )
          })}
        </nav>
      </div>
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
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[26px] font-semibold tracking-[-0.035em] text-[#172019]">
          {title}
        </h1>
        <p className="mt-1 text-sm text-[#7a857d]">{description}</p>
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
  icon,
  danger = false,
}: {
  label: string
  value: number
  icon: typeof PlayIcon
  danger?: boolean
}) {
  return (
    <div className="flex min-h-24 items-center gap-3 rounded-2xl border border-[#e2e7e2] bg-white p-4 shadow-[0_8px_28px_rgba(31,48,35,0.035)] sm:p-5">
      <span
        className={`grid size-11 shrink-0 place-items-center rounded-2xl ${
          danger ? "bg-[#fff0f0] text-[#dc3f3f]" : "bg-[#edf3ee] text-[#315b40]"
        }`}
      >
        <Icon icon={icon} size={21} />
      </span>
      <div>
        <div className="text-xs font-medium text-[#7d8880]">{label}</div>
        <div
          className={`mt-1 text-2xl font-semibold tracking-[-0.035em] ${
            danger ? "text-[#df3434]" : "text-[#172019]"
          }`}
        >
          {value}
        </div>
      </div>
    </div>
  )
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f3f6f3] text-sm text-[#758078]">
      <div className="flex items-center gap-3 rounded-2xl border border-[#e2e7e2] bg-white px-5 py-4 shadow-[0_12px_35px_rgba(31,48,35,0.06)]">
        <span className="size-2 animate-pulse rounded-full bg-[#315b40]" />
        {children}
      </div>
    </main>
  )
}

function Icon({
  icon,
  size = 20,
  strokeWidth = 1.8,
}: {
  icon: typeof PlayIcon
  size?: number
  strokeWidth?: number
}) {
  return <HugeiconsIcon icon={icon} size={size} strokeWidth={strokeWidth} />
}

function ProjectLogo() {
  return (
    <span className="grid size-10 shrink-0 place-items-center overflow-hidden">
      <Image
        src="/catch-english-mark.png"
        width={40}
        height={40}
        alt="Логотип Catch English"
        className="size-10 object-contain"
        priority
      />
    </span>
  )
}

function EpisodeThumbnail({
  youtubeId,
  duration,
}: {
  youtubeId: string
  duration: string
}) {
  return (
    <span className="relative hidden h-11 w-[74px] shrink-0 overflow-hidden rounded-lg bg-[#dce7de] sm:block">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`https://i.ytimg.com/vi/${youtubeId}/mqdefault.jpg`}
        alt=""
        className="size-full object-cover"
        loading="lazy"
      />
      <span className="absolute inset-0 bg-black/5" />
      <span className="absolute right-1 bottom-1 rounded bg-black/75 px-1 py-0.5 font-mono text-[8px] leading-none text-white">
        {duration}
      </span>
    </span>
  )
}
