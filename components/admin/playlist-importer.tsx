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
  levelMin: string
  levelMax: string
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
  status: "pending" | "processing" | "ready" | "failed"
  message?: string
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
  const [targetLevels, setTargetLevels] = React.useState("A2, B1")
  const [maxPhrases, setMaxPhrases] = React.useState(15)
  const [results, setResults] = React.useState<Record<string, ImportResult>>({})
  const [running, setRunning] = React.useState(false)
  const [completedCount, setCompletedCount] = React.useState(0)

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
    setCompletedCount(0)
    setResults(
      Object.fromEntries(
        items.map((item) => [item.videoId, { status: "pending" }])
      )
    )

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index]
      setResults((current) => ({
        ...current,
        [item.videoId]: { status: "processing" },
      }))
      try {
        await request("/api/admin/episodes/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            youtubeUrl: `https://www.youtube.com/watch?v=${item.videoId}`,
            title: item.title,
            program: {
              slug: program.slug,
              title: program.title,
              description: program.description ?? undefined,
              levelMin: program.levelMin,
              levelMax: program.levelMax,
            },
            sequenceNumber: startSequence + index,
            ...(item.durationSeconds > 0
              ? { durationSeconds: item.durationSeconds }
              : {}),
            transcriptLanguage,
            targetLevels: targetLevels
              .split(",")
              .map((level) => level.trim().toUpperCase())
              .filter(Boolean),
            maxPhrases,
          }),
        })
        setResults((current) => ({
          ...current,
          [item.videoId]: { status: "ready" },
        }))
      } catch (requestError) {
        setResults((current) => ({
          ...current,
          [item.videoId]: {
            status: "failed",
            message:
              requestError instanceof Error
                ? requestError.message
                : "Ошибка импорта",
          },
        }))
      }
      setCompletedCount(index + 1)
      if (index < items.length - 1) {
        await delay(1_500)
      }
    }
    setRunning(false)
    await onComplete()
  }

  const selectableItems =
    preview?.items.filter((item) => item.available && !item.alreadyImported) ??
    []
  const allSelected =
    selectableItems.length > 0 &&
    selectableItems.every((item) => selected.has(item.videoId))
  const progressValue = selected.size
    ? Math.round((completedCount / selected.size) * 100)
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
                Строго по одному, с паузой 1,5 секунды. Ошибка одного не
                отменяет уже готовые.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
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
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="playlist-levels">Уровни фраз</Label>
                <Input
                  id="playlist-levels"
                  value={targetLevels}
                  onChange={(event) => setTargetLevels(event.target.value)}
                  placeholder="A2, B1"
                />
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
                  ? `${completedCount} из ${selected.size}`
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
