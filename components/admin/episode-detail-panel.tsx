"use client"

import * as React from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

type Status = "pending" | "processing" | "ready" | "failed"

type EpisodeDetail = {
  episode: {
    id: string
    programTitle: string
    youtubeId: string
    youtubeUrl: string
    title: string
    sequenceNumber: number
    durationSeconds: number
    transcriptLanguage: string
    ingestionStatus: Status
    isActive: boolean
    updatedAt: string
  }
  transcript: Array<{
    id: string
    index: number
    offsetMs: number
    durationMs: number
    text: string
  }>
  phrases: Array<{
    id: string
    phrase: string
    lemma: string
    translationRu: string
    contextSentence: string
    cefr: string
    offsetMs: number
    confidence: number
    rationale: string | null
    isActive: boolean
  }>
  jobs: Array<{
    id: string
    status: Status
    error: string | null
    model: string | null
    promptVersion: string | null
    metadata: Record<string, unknown>
    startedAt: string | null
    finishedAt: string | null
    createdAt: string
  }>
}

function timecode(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1_000)
  const hours = Math.floor(seconds / 3_600)
  const minutes = Math.floor((seconds % 3_600) / 60)
  const rest = seconds % 60
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`
    : `${minutes}:${String(rest).padStart(2, "0")}`
}

function formatDate(value: string | null) {
  if (!value) return "—"
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value))
}

function statusVariant(status: Status) {
  if (status === "failed") return "destructive" as const
  if (status === "ready") return "secondary" as const
  return "outline" as const
}

function statusLabel(status: Status) {
  if (status === "ready") return "Готово"
  if (status === "failed") return "Ошибка"
  if (status === "processing") return "Обработка"
  return "В очереди"
}

export function EpisodeDetailPanel({
  episodeId,
  onBack,
}: {
  episodeId: string
  onBack: () => void
}) {
  const [detail, setDetail] = React.useState<EpisodeDetail | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState("")

  React.useEffect(() => {
    let cancelled = false
    void fetch(`/api/admin/episodes/${episodeId}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as {
          data?: EpisodeDetail
          error?: { message?: string }
        }
        if (!response.ok || !payload.data) {
          throw new Error(payload.error?.message ?? "Не удалось открыть видео")
        }
        if (!cancelled) setDetail(payload.data)
      })
      .catch((requestError) => {
        if (!cancelled) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Не удалось открыть видео"
          )
        }
      })
    return () => {
      cancelled = true
    }
  }, [episodeId])

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-white p-6">
        <h1 className="font-semibold">Не удалось открыть видео</h1>
        <p className="mt-2 text-sm text-red-700">{error}</p>
        <Button variant="outline" className="mt-4" onClick={onBack}>
          Назад к каталогу
        </Button>
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-80" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-[55vh] w-full" />
      </div>
    )
  }

  const normalizedSearch = search.trim().toLocaleLowerCase("ru")
  const visibleSegments = detail.transcript.filter((segment) =>
    segment.text.toLocaleLowerCase("ru").includes(normalizedSearch)
  )

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Button variant="outline" size="sm" onClick={onBack}>
            ← Видео
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold">
              {detail.episode.title}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
              <span>
                {detail.episode.programTitle} · #{detail.episode.sequenceNumber}
              </span>
              <Badge variant={statusVariant(detail.episode.ingestionStatus)}>
                {statusLabel(detail.episode.ingestionStatus)}
              </Badge>
              <Badge variant="outline">
                {detail.episode.isActive ? "Опубликовано" : "Скрыто"}
              </Badge>
            </div>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={
            <a
              href={detail.episode.youtubeUrl}
              target="_blank"
              rel="noreferrer"
            />
          }
        >
          Открыть на YouTube
        </Button>
      </div>

      <Tabs defaultValue="transcript">
        <TabsList className="mb-3 rounded-md">
          <TabsTrigger value="transcript">
            Субтитры · {detail.transcript.length}
          </TabsTrigger>
          <TabsTrigger value="phrases">
            Фразы · {detail.phrases.length}
          </TabsTrigger>
          <TabsTrigger value="video">Видео</TabsTrigger>
          <TabsTrigger value="jobs">Импорт · {detail.jobs.length}</TabsTrigger>
        </TabsList>

        <TabsContent value="transcript">
          <div className="mb-3 flex items-center gap-3">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Поиск по субтитрам"
              className="max-w-lg bg-white"
            />
            <span className="text-xs whitespace-nowrap text-zinc-500">
              {visibleSegments.length} строк
            </span>
          </div>
          <div className="max-h-[68vh] overflow-auto rounded-lg border border-zinc-200 bg-white">
            <div className="divide-y divide-zinc-100">
              {visibleSegments.map((segment) => (
                <div
                  key={segment.id}
                  className="grid grid-cols-[64px_1fr] gap-3 px-4 py-2.5 hover:bg-zinc-50"
                >
                  <a
                    href={`${detail.episode.youtubeUrl}&t=${Math.floor(
                      segment.offsetMs / 1_000
                    )}s`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-xs text-zinc-500 hover:text-zinc-950"
                  >
                    {timecode(segment.offsetMs)}
                  </a>
                  <p className="text-sm leading-6">{segment.text}</p>
                </div>
              ))}
              {visibleSegments.length === 0 && (
                <div className="p-10 text-center text-sm text-zinc-500">
                  Ничего не найдено
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="phrases">
          <div className="max-h-[70vh] overflow-auto rounded-lg border border-zinc-200 bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Фраза и контекст</TableHead>
                  <TableHead>Перевод</TableHead>
                  <TableHead>CEFR</TableHead>
                  <TableHead>Оценка ИИ</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Время</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.phrases.map((phrase) => (
                  <TableRow key={phrase.id}>
                    <TableCell className="max-w-md whitespace-normal">
                      <div className="font-medium">{phrase.phrase}</div>
                      <div className="mt-1 text-xs leading-5 text-zinc-500">
                        {phrase.contextSentence}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-64 whitespace-normal">
                      {phrase.translationRu}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{phrase.cefr}</Badge>
                    </TableCell>
                    <TableCell>
                      {Math.round(phrase.confidence * 100)}%
                    </TableCell>
                    <TableCell>
                      {phrase.isActive ? "Активна" : "Архив"}
                    </TableCell>
                    <TableCell>
                      <a
                        href={`${detail.episode.youtubeUrl}&t=${Math.floor(
                          phrase.offsetMs / 1_000
                        )}s`}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-xs underline"
                      >
                        {timecode(phrase.offsetMs)}
                      </a>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="video">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,900px)_300px]">
            <div className="aspect-video overflow-hidden rounded-lg bg-black">
              <iframe
                className="size-full"
                src={`https://www.youtube.com/embed/${detail.episode.youtubeId}`}
                title={detail.episode.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
            <dl className="h-fit rounded-lg border border-zinc-200 bg-white p-4 text-sm">
              <Meta label="YouTube ID" value={detail.episode.youtubeId} />
              <Meta
                label="Длительность"
                value={timecode(detail.episode.durationSeconds * 1_000)}
              />
              <Meta label="Язык" value={detail.episode.transcriptLanguage} />
              <Meta
                label="Обновлено"
                value={formatDate(detail.episode.updatedAt)}
              />
            </dl>
          </div>
        </TabsContent>

        <TabsContent value="jobs">
          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Дата</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead>Модель</TableHead>
                  <TableHead>Prompt</TableHead>
                  <TableHead>Результат</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.jobs.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {formatDate(job.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(job.status)}>
                        {statusLabel(job.status)}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {job.model ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {job.promptVersion ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-2xl text-xs whitespace-normal">
                      {job.error ?? "Без ошибок"}
                    </TableCell>
                  </TableRow>
                ))}
                {detail.jobs.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="h-28 text-center text-zinc-500"
                    >
                      Запусков нет
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </section>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-3 last:mb-0">
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className="mt-1 font-medium break-all">{value}</dd>
    </div>
  )
}
