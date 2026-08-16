"use client"

import * as React from "react"
import {
  ArrowLeft01Icon,
  Chat01Icon,
  Mic02Icon,
  SentIcon,
  StopIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import Link from "next/link"

import { AutoResizeTextarea } from "@/components/ui/auto-resize-textarea"
import { telegramFetch } from "@/lib/telegram"

type PhraseDetails = {
  phrase: string
  translationRu: string
  contextSentence: string | null
}

type PracticeMessage = {
  id: string
  role: "assistant" | "user"
  content: string
  correction?: string | null
}

type PracticeTurn = {
  message: string
  correction: string | null
  phrase?: PhraseDetails
}

type VoicePhase = "idle" | "recording" | "transcribing"

function subscribeToVoiceSupport() {
  return () => undefined
}

function getVoiceSupportSnapshot() {
  return Boolean(
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function" &&
    typeof MediaRecorder !== "undefined"
  )
}

function getServerVoiceSupportSnapshot() {
  return false
}

function preferredRecordingMimeType() {
  if (typeof MediaRecorder === "undefined") return ""
  const candidates = [
    "audio/mp4",
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
  ]
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? ""
}

function recordingFileName(mimeType: string) {
  if (mimeType.includes("mp4")) return "answer.mp4"
  if (mimeType.includes("ogg")) return "answer.ogg"
  return "answer.webm"
}

async function requestPractice(body: Record<string, unknown>) {
  const response = await telegramFetch("/api/phrases/practice", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const payload = (await response.json()) as {
    data?: PracticeTurn
    error?: { message?: string }
  }
  if (!response.ok || !payload.data) {
    throw new Error(payload.error?.message ?? "Разговор сейчас недоступен")
  }
  return payload.data
}

async function requestTranscription(input: {
  cardId: string
  audio: Blob
  fileName: string
}) {
  const body = new FormData()
  body.set("cardId", input.cardId)
  body.set("audio", input.audio, input.fileName)
  const response = await telegramFetch("/api/phrases/practice/transcribe", {
    method: "POST",
    body,
  })
  const payload = (await response.json().catch(() => ({}))) as {
    data?: { text?: string }
    error?: { message?: string }
  }
  const text = payload.data?.text?.trim()
  if (!response.ok || !text) {
    throw new Error(payload.error?.message ?? "Не удалось распознать запись")
  }
  return text
}

export function PhrasePracticeScreen({ cardId }: { cardId: string }) {
  const [phrase, setPhrase] = React.useState<PhraseDetails | null>(null)
  const [messages, setMessages] = React.useState<PracticeMessage[]>([])
  const [draft, setDraft] = React.useState("")
  const [starting, setStarting] = React.useState(true)
  const [sending, setSending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const voiceSupported = React.useSyncExternalStore(
    subscribeToVoiceSupport,
    getVoiceSupportSnapshot,
    getServerVoiceSupportSnapshot
  )
  const [voiceDisabled, setVoiceDisabled] = React.useState(false)
  const [voicePhase, setVoicePhase] = React.useState<VoicePhase>("idle")
  const [recordingSeconds, setRecordingSeconds] = React.useState(0)
  const [voiceError, setVoiceError] = React.useState<string | null>(null)
  const bottomRef = React.useRef<HTMLDivElement | null>(null)
  const mediaStreamRef = React.useRef<MediaStream | null>(null)
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null)
  const discardRecordingRef = React.useRef(false)

  const releaseMicrophone = React.useCallback(() => {
    discardRecordingRef.current = true
    const recorder = mediaRecorderRef.current
    mediaRecorderRef.current = null
    if (recorder && recorder.state !== "inactive") recorder.stop()
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop())
    mediaStreamRef.current = null
  }, [])

  async function retryStart() {
    setStarting(true)
    setError(null)
    try {
      const turn = await requestPractice({ action: "start", cardId })
      if (turn.phrase) setPhrase(turn.phrase)
      setMessages([
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: turn.message,
          correction: turn.correction,
        },
      ])
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Разговор сейчас недоступен"
      )
    } finally {
      setStarting(false)
    }
  }

  React.useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const turn = await requestPractice({ action: "start", cardId })
        if (cancelled) return
        if (turn.phrase) setPhrase(turn.phrase)
        setMessages([
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: turn.message,
            correction: turn.correction,
          },
        ])
      } catch (requestError) {
        if (!cancelled) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Разговор сейчас недоступен"
          )
        }
      } finally {
        if (!cancelled) setStarting(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [cardId])

  React.useEffect(() => releaseMicrophone, [releaseMicrophone])

  React.useEffect(() => {
    if (voicePhase !== "recording") return
    const timer = window.setInterval(() => {
      setRecordingSeconds((seconds) => {
        if (seconds >= 59) {
          const recorder = mediaRecorderRef.current
          if (recorder?.state === "recording") recorder.stop()
          return 60
        }
        return seconds + 1
      })
    }, 1_000)
    return () => window.clearInterval(timer)
  }, [voicePhase])

  React.useEffect(() => {
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
    })
  }, [messages, sending])

  async function sendMessage(text = draft) {
    const normalized = text.trim()
    if (!normalized || sending || starting) return

    const userMessage: PracticeMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: normalized,
    }
    const nextMessages = [...messages, userMessage]
    setMessages(nextMessages)
    setDraft("")
    setError(null)
    setSending(true)
    try {
      const turn = await requestPractice({
        action: "reply",
        cardId,
        messages: nextMessages.map(({ role, content }) => ({ role, content })),
      })
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: turn.message,
          correction: turn.correction,
        },
      ])
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Не удалось отправить ответ"
      )
    } finally {
      setSending(false)
    }
  }

  async function finishVoiceRecording(chunks: Blob[], mimeType: string) {
    if (discardRecordingRef.current) return
    const audio = new Blob(chunks, { type: mimeType })
    if (audio.size < 128) {
      setVoicePhase("idle")
      setVoiceError("Запись получилась слишком короткой")
      return
    }

    setVoicePhase("transcribing")
    setVoiceError(null)
    try {
      const text = await requestTranscription({
        cardId,
        audio,
        fileName: recordingFileName(mimeType),
      })
      setVoicePhase("idle")
      setRecordingSeconds(0)
      await sendMessage(text)
    } catch (requestError) {
      setVoicePhase("idle")
      setRecordingSeconds(0)
      setVoiceError(
        requestError instanceof Error
          ? requestError.message
          : "Не удалось распознать запись"
      )
    }
  }

  async function startVoiceRecording() {
    if (
      !voiceSupported ||
      voiceDisabled ||
      sending ||
      voicePhase !== "idle"
    ) {
      return
    }

    discardRecordingRef.current = false
    setVoiceError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false,
      })
      mediaStreamRef.current = stream
      const mimeType = preferredRecordingMimeType()
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)
      const chunks: Blob[] = []
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data)
      }
      recorder.onstop = () => {
        mediaRecorderRef.current = null
        stream.getTracks().forEach((track) => track.stop())
        mediaStreamRef.current = null
        void finishVoiceRecording(
          chunks,
          recorder.mimeType || mimeType || "audio/webm"
        )
      }
      mediaRecorderRef.current = recorder
      recorder.start(250)
      setRecordingSeconds(0)
      setVoicePhase("recording")
    } catch {
      setVoiceDisabled(true)
      setVoiceError("Нет доступа к микрофону")
      releaseMicrophone()
    }
  }

  function stopVoiceRecording() {
    const recorder = mediaRecorderRef.current
    if (recorder?.state === "recording") recorder.stop()
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[1120px] flex-col px-4 pt-[calc(16px+var(--app-safe-top))] sm:px-7 sm:pt-[calc(24px+var(--app-safe-top))] lg:px-10">
      <header className="flex items-center gap-3 border-b pb-4 sm:pb-5">
        <Link
          href="/my/phrases"
          aria-label="Вернуться к фразам"
          className="grid size-10 shrink-0 place-items-center rounded-2xl border bg-card transition-colors hover:bg-muted"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={20} strokeWidth={1.9} />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Разговор</p>
          <p className="truncate text-xs text-muted-foreground" lang="en">
            {phrase?.phrase ?? "Практика фразы"}
          </p>
        </div>
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-muted text-muted-foreground">
          <HugeiconsIcon icon={Chat01Icon} size={20} strokeWidth={1.8} />
        </span>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        <section className="mx-auto flex w-full max-w-[820px] flex-1 flex-col py-5 sm:py-7">
          {phrase && (
            <div className="mb-7 rounded-[24px] border bg-card p-5 shadow-sm sm:p-6">
              <p
                className="text-[24px] font-semibold tracking-[-0.035em] sm:text-[28px]"
                lang="en"
              >
                {phrase.phrase}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {phrase.translationRu}
              </p>
              {phrase.contextSentence && (
                <p
                  className="mt-4 border-l-2 border-foreground/15 pl-3 text-sm leading-6 text-muted-foreground"
                  lang="en"
                >
                  {phrase.contextSentence}
                </p>
              )}
            </div>
          )}

          <div className="flex-1 space-y-3">
            {starting && (
              <div className="w-fit rounded-[20px] rounded-bl-md bg-card px-4 py-3 text-sm text-muted-foreground shadow-sm">
                Начинаем разговор
              </div>
            )}

            {messages.map((message) => (
              <div key={message.id}>
                <div
                  className={
                    message.role === "user"
                      ? "ml-auto max-w-[86%] rounded-[20px] rounded-br-md bg-foreground px-4 py-3 text-sm leading-6 text-background sm:max-w-[72%]"
                      : "max-w-[90%] rounded-[20px] rounded-bl-md bg-card px-4 py-3 text-sm leading-6 shadow-sm sm:max-w-[76%]"
                  }
                >
                  <p lang="en">{message.content}</p>
                </div>
                {message.correction && (
                  <p className="mt-2 max-w-[90%] pl-2 text-xs leading-5 text-muted-foreground sm:max-w-[76%]">
                    {message.correction}
                  </p>
                )}
              </div>
            ))}

            {sending && (
              <div
                className="flex w-fit items-center gap-1.5 rounded-[20px] rounded-bl-md bg-card px-4 py-4 text-muted-foreground shadow-sm"
                aria-label="Формируем ответ"
              >
                {[0, 1, 2].map((dot) => (
                  <span
                    key={dot}
                    className="size-1.5 animate-bounce rounded-full bg-current"
                    style={{ animationDelay: `${dot * 120}ms` }}
                  />
                ))}
              </div>
            )}

            {error && (
              <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
                <p>{error}</p>
                {messages.length === 0 && !starting && (
                  <button
                    type="button"
                    onClick={() => void retryStart()}
                    className="mt-2 font-semibold"
                  >
                    Попробовать снова
                  </button>
                )}
              </div>
            )}
            <div ref={bottomRef} aria-hidden="true" />
          </div>
        </section>

        {messages.length > 0 && (
          <form
            className="sticky bottom-0 mx-auto w-full max-w-[820px] bg-background/92 py-4 pb-[calc(16px+var(--app-safe-bottom))] backdrop-blur-xl sm:py-5"
            onSubmit={(event) => {
              event.preventDefault()
              void sendMessage()
            }}
          >
            {voicePhase !== "idle" && (
              <div
                className="mb-2 flex h-7 items-center gap-2 px-1 text-xs text-muted-foreground"
                aria-live="polite"
              >
                <span
                  className={
                    voicePhase === "recording"
                      ? "size-2 animate-pulse rounded-full bg-red-500"
                      : "size-2 animate-pulse rounded-full bg-muted-foreground"
                  }
                />
                {voicePhase === "recording"
                  ? `Запись · ${Math.floor(recordingSeconds / 60)}:${String(recordingSeconds % 60).padStart(2, "0")}`
                  : "Распознаём ответ"}
              </div>
            )}
            <div className="flex items-end gap-2">
              <AutoResizeTextarea
                aria-label="Ответ на английском"
                maxLength={600}
                maxHeight={176}
                value={draft}
                disabled={sending || voicePhase === "transcribing"}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault()
                    event.currentTarget.form?.requestSubmit()
                  }
                }}
                placeholder="Напиши ответ по-английски"
                className="min-h-14 min-w-0 flex-1 rounded-[20px] border bg-card px-4 py-4 text-sm shadow-sm outline-none focus:border-foreground"
              />
              {voiceSupported && !voiceDisabled && (
                <button
                  type="button"
                  aria-label={
                    voicePhase === "recording"
                      ? "Остановить запись"
                      : "Ответить голосом"
                  }
                  aria-pressed={voicePhase === "recording"}
                  disabled={sending || voicePhase === "transcribing"}
                  onClick={() => {
                    if (voicePhase === "recording") stopVoiceRecording()
                    else void startVoiceRecording()
                  }}
                  className={
                    voicePhase === "recording"
                      ? "grid size-14 shrink-0 place-items-center rounded-[20px] bg-destructive text-white"
                      : "grid size-14 shrink-0 place-items-center rounded-[20px] bg-muted text-foreground"
                  }
                >
                  <HugeiconsIcon
                    icon={voicePhase === "recording" ? StopIcon : Mic02Icon}
                    size={20}
                    strokeWidth={1.9}
                  />
                </button>
              )}
              <button
                type="submit"
                aria-label="Отправить ответ"
                disabled={
                  !draft.trim() || sending || voicePhase !== "idle"
                }
                className="grid size-14 shrink-0 place-items-center rounded-[20px] bg-foreground text-background transition-opacity disabled:opacity-35"
              >
                <HugeiconsIcon icon={SentIcon} size={20} strokeWidth={1.9} />
              </button>
            </div>
            {voiceError && (
              <p
                className="mt-2 px-1 text-xs text-destructive"
                aria-live="polite"
              >
                {voiceError}
              </p>
            )}
          </form>
        )}
      </div>
    </div>
  )
}
