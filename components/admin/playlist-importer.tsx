"use client"

import * as React from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export type PlaylistProgram = {
  id: string
  slug: string
  title: string
  description: string | null
  episodes: Array<{ sequenceNumber: number }>
}

type PlaylistItem = {
  videoId: string
  title: string
  description: string
  position: number
  thumbnailUrl: string | null
  channelTitle: string | null
  publishedAt: string | null
  durationSeconds: number
  hasCaptions: boolean
  privacyStatus: string
  embeddable: boolean
  available: boolean
  alreadyImported: boolean
}

type PlaylistPreview = {
  id: string
  title: string
  description: string
  channelTitle: string | null
  items: PlaylistItem[]
}

type ImportResult = {
  status: "pending" | "processing" | "ready" | "failed" | "skipped"
  message?: string
}

type QueuedBatch = {
  batchId: string
  queued: number
  skipped: number
  skippedVideoIds: string[]
}

type BatchStatus = {
  batchId: string
  total: number
  completed: number
  pending: number
  processing: number
  ready: number
  failed: number
  totalTokens: number
  costUsd: number
  jobs: Array<{
    id: string
    videoId: string
    status: ImportResult["status"]
    error: string | null
    attemptCount: number
    nextAttemptAt: string | null
    totalTokens: number
    costUsd: number
  }>
}

function batchUsageLabel(totalTokens: number, costUsd: number) {
  if (totalTokens === 0 && costUsd === 0) return "LLM-расходов пока нет."
  const tokens = new Intl.NumberFormat("ru-RU").format(totalTokens)
  const cost = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 4,
    maximumFractionDigits: 6,
  }).format(costUsd)
  return `LLM: ${tokens} токенов · ${cost}.`
}

function durationLabel(seconds: number) {
  const hours = Math.floor(seconds / 3_600)
  const minutes = Math.floor((seconds % 3_600) / 60)
  const rest = seconds % 60
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`
    : `${minutes}:${String(rest).padStart(2, "0")}`
}

async function request<T>(url: string, init: RequestInit) {
  const response = await fetch(url, init)
  const payload = (await response.json()) as {
    data?: T
    error?: { message?: string }
  }
  if (!response.ok || payload.data === undefined) {
    throw new Error(payload.error?.message ?? "Ошибка запроса")
  }
  return payload.data
}

function nextSequence(program: PlaylistProgram | undefined) {
  return program
    ? Math.max(0, ...program.episodes.map((item) => item.sequenceNumber)) + 1
    : 1
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) =>
    window.setTimeout(resolve, milliseconds)
  )
}

export function PlaylistImporter({
  programs,
  onComplete,
}: {
  programs: PlaylistProgram[]
  onComplete: () => Promise<void> | void
}) {
  const initialProgram = programs[0]
  const [playlistUrl, setPlaylistUrl] = React.useState("")
  const [preview, setPreview] = React.useState<PlaylistPreview | null>(null)
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [previewLoading, setPreviewLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [programId, setProgramId] = React.useState(initialProgram?.id ?? "")
  const [startSequence, setStartSequence] = React.useState(
    nextSequence(initialProgram)
  )
  const [transcriptLanguage, setTranscriptLanguage] = React.useState("en")
  const [maxPhrases, setMaxPhrases] = React.useState(15)
  const [results, setResults] = React.useState<Record<string, ImportResult>>({})
  const [running, setRunning] = React.useState(false)
  const [completedCount, setCompletedCount] = React.useState(0)
  const [batchTotal, setBatchTotal] = React.useState(0)
  const [backgroundNotice, setBackgroundNotice] = React.useState<string | null>(
    null
  )

  async function loadPlaylist(event: React.FormEvent) {
    event.preventDefault()
    setPreviewLoading(true)
    setError(null)
    setResults({})
    try {
      const data = await request<PlaylistPreview>(
        "/api/admin/playlists/preview",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playlistUrl }),
        }
      )
      setPreview(data)
      setSelected(
        new Set(
          data.items
            .filter((item) => item.available && !item.alreadyImported)
            .map((item) => item.videoId)
        )
      )
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Не удалось прочитать плейлист"
      )
    } finally {
      setPreviewLoading(false)
    }
  }

  function chooseProgram(value: string | null) {
    if (!value) return
    setProgramId(value)
    setStartSequence(nextSequence(programs.find((item) => item.id === value)))
  }

  function toggleItem(videoId: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current)
      if (checked) next.add(videoId)
      else next.delete(videoId)
      return next
    })
  }

  function selectAll(checked: boolean) {
    if (!preview) return
    setSelected(
      checked
        ? new Set(
            preview.items
              .filter((item) => item.available && !item.alreadyImported)
              .map((item) => item.videoId)
          )
        : new Set()
    )
  }

  async function importSelected() {
    const program = programs.find((item) => item.id === programId)
    if (!program || !preview || selected.size === 0) return
    const items = preview.items
      .filter((item) => selected.has(item.videoId))
      .sort((left, right) => left.position - right.position)
    setRunning(true)
    setError(null)
    setBackgroundNotice(null)
    setCompletedCount(0)
    setBatchTotal(0)
    setResults(
      Object.fromEntries(
        items.map((item) => [item.videoId, { status: "pending" }])
      )
    )

    try {
      const queued = await request<QueuedBatch>("/api/admin/imports/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((item, index) => ({
            youtubeUrl: `https://www.youtube.com/watch?v=${item.videoId}`,
            title: item.title,
            program: {
              slug: program.slug,
              title: program.title,
              description: program.description ?? undefined,
            },
            sequenceNumber: startSequence + index,
            ...(item.durationSeconds > 0
              ? { durationSeconds: item.durationSeconds }
              : {}),
            transcriptLanguage,
            maxPhrases,
          })),
        }),
      })
      setBatchTotal(queued.queued)
      setResults((current) => ({
        ...current,
        ...Object.fromEntries(
          queued.skippedVideoIds.map((videoId) => [
            videoId,
            { status: "skipped" as const },
          ])
        ),
      }))
      setBackgroundNotice(
        `${queued.queued} видео поставлено в фоновую очередь${
          queued.skipped > 0
            ? `, ${queued.skipped} пропущено как дубликаты`
            : ""
        }. Эту страницу можно закрыть.`
      )

      while (true) {
        const status = await request<BatchStatus>(
          `/api/admin/imports/batch?batchId=${encodeURIComponent(queued.batchId)}`,
          { method: "GET" }
        )
        setCompletedCount(status.completed)
        setResults((current) => ({
          ...Object.fromEntries(
            Object.entries(current).filter(
              ([, result]) => result.status === "skipped"
            )
          ),
          ...Object.fromEntries(
            status.jobs.map((job) => [
              job.videoId,
              {
                status: job.status,
                ...(job.error ? { message: job.error } : {}),
              },
            ])
          ),
        }))
        if (status.pending === 0 && status.processing === 0) {
          const usage = batchUsageLabel(status.totalTokens, status.costUsd)
          if (status.total === 0 && queued.skipped > 0) {
            setBackgroundNotice(
              `Новых видео нет: ${queued.skipped} пропущено как дубликаты.`
            )
          } else {
            const skipped =
              queued.skipped > 0
                ? `, ${queued.skipped} пропущено как дубликаты`
                : ""
            setBackgroundNotice(
              status.failed > 0
                ? `Импорт завершён: ${status.ready} готово, ${status.failed} с ошибкой${skipped}. ${usage}`
                : `Импорт завершён: ${status.ready} готово${skipped}. ${usage}`
            )
          }
          break
        }
        setBackgroundNotice(
          `Фоновый импорт: ${status.completed} из ${status.total}. ${batchUsageLabel(
            status.totalTokens,
            status.costUsd
          )} Эту страницу можно закрыть.`
        )
        await delay(2_500)
      }
      await onComplete()
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Не удалось запустить фоновый импорт"
      )
    } finally {
      setRunning(false)
    }
  }

  const selectableItems =
    preview?.items.filter((item) => item.available && !item.alreadyImported) ??
    []
  const allSelected =
    selectableItems.length > 0 &&
    selectableItems.every((item) => selected.has(item.videoId))
  const progressValue = batchTotal
    ? Math.round((completedCount / batchTotal) * 100)
    : 0

  return (
    <div className="space-y-5">
      <Card className="rounded-lg shadow-none">
        <CardHeader>
          <CardTitle>Импорт из YouTube-плейлиста</CardTitle>
          <CardDescription>
            Вставь публичную ссылку. Сначала можно проверить состав и выбрать
            конкретные ролики.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={loadPlaylist}
            className="flex flex-col gap-3 sm:flex-row"
          >
            <Input
              type="url"
              value={playlistUrl}
              onChange={(event) => setPlaylistUrl(event.target.value)}
              placeholder="https://www.youtube.com/playlist?list=…"
              required
              className="flex-1"
            />
            <Button type="submit" disabled={previewLoading}>
              {previewLoading ? "Читаем плейлист…" : "Получить видео"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Не удалось продолжить</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {backgroundNotice && (
        <Alert>
          <AlertTitle>Фоновый импорт</AlertTitle>
          <AlertDescription>{backgroundNotice}</AlertDescription>
        </Alert>
      )}

      {preview && (
        <>
          <Card className="rounded-lg shadow-none">
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>{preview.title}</CardTitle>
                  <CardDescription>
                    {preview.channelTitle ?? "YouTube"} · {preview.items.length}{" "}
                    видео
                  </CardDescription>
                </div>
                <Badge variant="secondary">Выбрано: {selected.size}</Badge>
              </div>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12 pl-6">
                      <Checkbox
                        checked={allSelected}
                        disabled={running}
                        onCheckedChange={(checked) =>
                          selectAll(Boolean(checked))
                        }
                        aria-label="Выбрать все доступные видео"
                      />
                    </TableHead>
                    <TableHead>Видео</TableHead>
                    <TableHead>Длительность</TableHead>
                    <TableHead>Субтитры</TableHead>
                    <TableHead>Состояние</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.items.map((item) => {
                    const result = results[item.videoId]
                    const disabled =
                      !item.available || item.alreadyImported || running
                    return (
                      <TableRow key={item.videoId}>
                        <TableCell className="pl-6">
                          <Checkbox
                            checked={selected.has(item.videoId)}
                            disabled={disabled}
                            onCheckedChange={(checked) =>
                              toggleItem(item.videoId, Boolean(checked))
                            }
                            aria-label={`Выбрать ${item.title}`}
                          />
                        </TableCell>
                        <TableCell className="min-w-80 whitespace-normal">
                          <div className="flex items-center gap-3">
                            <div
                              className="h-14 w-24 shrink-0 rounded-lg bg-muted bg-cover bg-center"
                              style={
                                item.thumbnailUrl
                                  ? {
                                      backgroundImage: `url(${item.thumbnailUrl})`,
                                    }
                                  : undefined
                              }
                            />
                            <div>
                              <div className="line-clamp-2 font-medium">
                                {item.title}
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                #{item.position + 1} · {item.videoId}
                              </div>
                              {result?.message && (
                                <div className="mt-1 text-xs text-destructive">
                                  {result.message}
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {durationLabel(item.durationSeconds)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={item.hasCaptions ? "secondary" : "outline"}
                          >
                            {item.hasCaptions ? "Есть" : "Не найдены"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {item.alreadyImported ? (
                            <Badge variant="outline">Уже импортировано</Badge>
                          ) : result ? (
                            <Badge
                              variant={
                                result.status === "failed"
                                  ? "destructive"
                                  : result.status === "ready"
                                    ? "default"
                                    : result.status === "skipped"
                                      ? "outline"
                                      : "secondary"
                              }
                              title={result.message}
                            >
                              {result.status === "processing"
                                ? "Импорт…"
                                : result.status === "ready"
                                  ? "Готово"
                                  : result.status === "failed"
                                    ? "Ошибка"
                                    : result.status === "skipped"
                                      ? "Пропущено"
                                      : "Ожидает"}
                            </Badge>
                          ) : (
                            <Badge variant="outline">
                              {item.available ? "Доступно" : "Недоступно"}
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="rounded-lg shadow-none">
            <CardHeader>
              <CardTitle>Настройки импорта</CardTitle>
              <CardDescription>
                Сервер обработает видео строго по одному, с паузой 1,5 секунды.
                После запуска можно уйти из админки.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-2 sm:col-span-2">
                <Label>Курс</Label>
                <Select value={programId} onValueChange={chooseProgram}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Выбрать курс" />
                  </SelectTrigger>
                  <SelectContent>
                    {programs.map((program) => (
                      <SelectItem key={program.id} value={program.id}>
                        {program.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="playlist-sequence">Первый номер</Label>
                <Input
                  id="playlist-sequence"
                  type="number"
                  min={1}
                  value={startSequence}
                  onChange={(event) =>
                    setStartSequence(Number(event.target.value))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="playlist-language">Субтитры</Label>
                <Input
                  id="playlist-language"
                  value={transcriptLanguage}
                  onChange={(event) =>
                    setTranscriptLanguage(event.target.value)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="playlist-max-phrases">Фраз на видео</Label>
                <Input
                  id="playlist-max-phrases"
                  type="number"
                  min={5}
                  max={30}
                  value={maxPhrases}
                  onChange={(event) =>
                    setMaxPhrases(Number(event.target.value))
                  }
                />
              </div>
              <div className="flex items-center rounded-lg bg-muted/60 px-3 text-sm leading-5 text-muted-foreground sm:col-span-2 lg:col-span-4">
                ИИ сам определит CEFR каждой фразы и обновит диапазон курса
                после каждого видео.
              </div>
            </CardContent>
            {running && (
              <CardContent>
                <Progress value={progressValue}>
                  <ProgressLabel>Импортируем видео</ProgressLabel>
                  <ProgressValue />
                </Progress>
              </CardContent>
            )}
            <CardFooter className="gap-3 border-t">
              <Button
                onClick={() => void importSelected()}
                disabled={running || selected.size === 0 || !programId}
              >
                {running
                  ? `${completedCount} из ${batchTotal || selected.size}`
                  : `Импортировать выбранные (${selected.size})`}
              </Button>
              <span className="text-xs text-muted-foreground">
                Стартовый номер: {startSequence}
              </span>
            </CardFooter>
          </Card>
        </>
      )}
    </div>
  )
}
