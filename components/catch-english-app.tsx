"use client"

import * as React from "react"
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Cards01Icon,
  Chat01Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  Edit02Icon,
  Mic02Icon,
  Notification01Icon,
  PlayIcon,
  Settings01Icon,
  StopIcon,
  Tick02Icon,
  Video01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import Image from "next/image"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { AutoResizeTextarea } from "@/components/ui/auto-resize-textarea"
import { CatchEnglishLanding } from "@/components/catch-english-landing"
import { MyPhrasesScreen } from "@/components/my-phrases-screen"
import { usePersonalAreaSession } from "@/components/personal-area-auth-gate"
import { WatchCatalogScreen } from "@/components/watch-catalog-screen"
import {
  InterviewTranscriptionRequestError,
  isEmptyInterviewTranscriptionError,
} from "@/lib/interview-transcription-error"
import {
  enqueuePendingReview,
  flushPendingReviews,
  getPendingReviews,
  hasReviewsBlockingPlanItemFlush,
  normalizeReviewQueueIndex,
} from "@/lib/pending-reviews"
import {
  enqueuePendingPlanItem,
  flushPendingPlanItems,
  getPendingPlanItems,
} from "@/lib/pending-plan-items"
import {
  getTelegramCloudFlag,
  getTelegramWebApp,
  setTelegramCloudFlag,
  telegramFetch,
} from "@/lib/telegram"
import { cn } from "@/lib/utils"
import logoMark from "@/public/catch-english-mark.png"

type Screen =
  | "welcome"
  | "test"
  | "result"
  | "reminder"
  | "today"
  | "video"
  | "review"
  | "interview"
  | "complete"
  | "settings"
  | "phrases"
  | "watch"
type PrimarySection = "today" | "phrases" | "watch" | "settings"
type Rating = "again" | "hard" | "good" | "known"

type ReviewCardDto = {
  id: string
  due: string
  reps: number
  phrase: string
  translationRu: string
  contextSentence: string
  offsetMs: number
}

type TodayDto = {
  date: string
  plan: {
    id: string
    status: "not_started" | "supporting" | "complete" | "skipped"
    completedItems: Array<"watch" | "review" | "retell">
    completedAt: string | null
  }
  episode: {
    id: string
    youtubeId: string
    title: string
    programTitle: string
    sequenceNumber: number
    durationMinutes: number
    youtubeUrl: string
  }
  comprehension: {
    percentage: number
    isReady: boolean
    isEstimated: boolean
    knownLexemeCount: number
  }
  queue: {
    mode: "normal" | "return" | "soft_restart"
    gapDays: number
    totalDueReviews: number
    shownReviews: number
    newCardsPaused: boolean
    estimatedMinutes: number
    message?: string
    reviewStep?: {
      status: "available" | "completed" | "skipped"
      skipReason: "no_cards" | null
      assignedCount: number
      reviewedCount: number
    }
    cards: ReviewCardDto[]
  }
}

type ProgramSettingDto = {
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

type InterviewMessage = {
  id: string
  role: "assistant" | "user" | "correction"
  text: string
  delivery?: "sending" | "failed"
  error?: string
  questionWords?: string[]
  helpToken?: string
}

type InterviewTurnDto = {
  message: string
  correction: string | null
  reaction: string | null
  completed: boolean
  answersCompleted: number
  questionNumber: number | null
  questionWords: string[]
  sessionToken: string | null
  messages?: InterviewMessage[]
  restored?: boolean
  queuedWord?: {
    word: string
    translationRu: string
    queued: true
  } | null
}

type InterviewWordHelpDto = {
  word: string
  lemma: string
  translationRu: string
  queued: true
}

type VoicePhase = "idle" | "recording" | "transcribing"
type AuthMode = "checking" | "telegram" | "web" | "anonymous"

type WebSessionUser = {
  onboardingCompleted: boolean
  firstName?: string | null
}

type PendingVoiceRecording = {
  audio: Blob
  mimeType: string
  run: number
  episodeId: string
  sessionToken: string
}

type PlanItemType = "watch" | "review"
type PlanItemResult = {
  status: TodayDto["plan"]["status"]
  completedItems: TodayDto["plan"]["completedItems"]
}

class PlanItemRequestError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
    this.name = "PlanItemRequestError"
  }
}

async function requestPlanItem(
  planId: string,
  episodeId: string,
  type: PlanItemType
): Promise<PlanItemResult> {
  const response = await telegramFetch("/api/daily-plan/items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ planId, episodeId, type }),
  })
  const payload = (await response.json()) as {
    data?: PlanItemResult
    error?: { message?: string }
  }
  if (!response.ok || !payload.data) {
    throw new PlanItemRequestError(
      payload.error?.message ?? "Не удалось сохранить шаг",
      response.status
    )
  }
  return payload.data
}

const questions = [
  {
    id: "a1-make",
    phrase: "I need to make an appointment.",
    word: "make",
    answers: ["создать", "назначить", "пропустить"],
    correct: 1,
    level: "A1",
    difficulty: 0,
  },
  {
    id: "a1-usually",
    phrase: "I usually walk to work.",
    word: "usually",
    answers: ["обычно", "быстро", "иногда"],
    correct: 0,
    level: "A1",
    difficulty: 0,
  },
  {
    id: "a1-borrow",
    phrase: "Can I borrow your pen?",
    word: "borrow",
    answers: ["сломать", "одолжить у кого-то", "подарить"],
    correct: 1,
    level: "A1",
    difficulty: 0,
  },
  {
    id: "a1-hungry",
    phrase: "I’m hungry. Let’s eat.",
    word: "hungry",
    answers: ["голодный", "уставший", "занятый"],
    correct: 0,
    level: "A1",
    difficulty: 0,
  },
  {
    id: "a2-run-out",
    phrase: "We’ve run out of milk.",
    word: "run out of",
    answers: ["разлить", "купить", "закончиться"],
    correct: 2,
    level: "A2",
    difficulty: 1,
  },
  {
    id: "a2-pick-up",
    phrase: "I’ll pick you up after work.",
    word: "pick you up",
    answers: ["встречу и заберу", "позвоню", "подожду"],
    correct: 0,
    level: "A2",
    difficulty: 1,
  },
  {
    id: "a2-instead",
    phrase: "Let’s stay home instead.",
    word: "instead",
    answers: ["ненадолго", "вместо этого", "вместе"],
    correct: 1,
    level: "A2",
    difficulty: 1,
  },
  {
    id: "a2-afford",
    phrase: "I can’t afford a new laptop.",
    word: "afford",
    answers: ["выбрать", "починить", "позволить себе"],
    correct: 2,
    level: "A2",
    difficulty: 1,
  },
  {
    id: "b1-eventually",
    phrase: "She eventually found the answer.",
    word: "eventually",
    answers: ["в конце концов", "возможно", "случайно"],
    correct: 0,
    level: "B1",
    difficulty: 2,
  },
  {
    id: "b1-look-forward",
    phrase: "I’m looking forward to the trip.",
    word: "looking forward to",
    answers: ["планировать", "ждать с нетерпением", "отказаться"],
    correct: 1,
    level: "B1",
    difficulty: 2,
  },
  {
    id: "b1-aware",
    phrase: "I wasn’t aware of the change.",
    word: "aware",
    answers: ["уверен", "осведомлён", "доволен"],
    correct: 1,
    level: "B1",
    difficulty: 2,
  },
  {
    id: "b1-likely",
    phrase: "It’s likely to rain tonight.",
    word: "likely",
    answers: ["вероятно", "опасно", "запрещено"],
    correct: 0,
    level: "B1",
    difficulty: 2,
  },
  {
    id: "b2-compelling",
    phrase: "The evidence was compelling.",
    word: "compelling",
    answers: ["противоречивый", "убедительный", "неполный"],
    correct: 1,
    level: "B2",
    difficulty: 3,
  },
  {
    id: "b2-reluctant",
    phrase: "He was reluctant to agree.",
    word: "reluctant",
    answers: ["неохотный", "готовый", "обязанный"],
    correct: 0,
    level: "B2",
    difficulty: 3,
  },
  {
    id: "b2-feasible",
    phrase: "The plan is feasible.",
    word: "feasible",
    answers: ["рискованный", "осуществимый", "подробный"],
    correct: 1,
    level: "B2",
    difficulty: 3,
  },
  {
    id: "b2-vague",
    phrase: "Her explanation was rather vague.",
    word: "vague",
    answers: ["неясный", "точный", "длинный"],
    correct: 0,
    level: "B2",
    difficulty: 3,
  },
  {
    id: "c1-exacerbate",
    phrase: "The policy may exacerbate the problem.",
    word: "exacerbate",
    answers: ["изучить", "скрыть", "усугубить"],
    correct: 2,
    level: "C1",
    difficulty: 4,
  },
  {
    id: "c1-unequivocal",
    phrase: "His response was unequivocal.",
    word: "unequivocal",
    answers: ["двусмысленный", "однозначный", "эмоциональный"],
    correct: 1,
    level: "C1",
    difficulty: 4,
  },
  {
    id: "c1-substantiate",
    phrase: "The claim is difficult to substantiate.",
    word: "substantiate",
    answers: ["опровергнуть", "обосновать", "переформулировать"],
    correct: 1,
    level: "C1",
    difficulty: 4,
  },
  {
    id: "c1-pervasive",
    phrase: "The influence of social media is pervasive.",
    word: "pervasive",
    answers: ["всепроникающий", "временный", "незаметный"],
    correct: 0,
    level: "C1",
    difficulty: 4,
  },
]

const testLength = 10
const placementLevels = ["A1", "A2", "B1", "B2"] as const
const reminderOptions = [
  { label: "Утром", hint: "Перед началом дня", time: "08:00" },
  { label: "Днём", hint: "В перерыве", time: "13:00" },
  { label: "Вечером", hint: "После дел", time: "19:00" },
  { label: "Позже", hint: "Перед отдыхом", time: "21:30" },
]

function pluralRu(value: number, one: string, few: string, many: string) {
  const lastTwo = value % 100
  const last = value % 10
  if (lastTwo >= 11 && lastTwo <= 14) return many
  if (last === 1) return one
  if (last >= 2 && last <= 4) return few
  return many
}

function cleanLegacyInterviewText(text: string) {
  return text.replace(/\s*✓/g, "")
}

async function requestInterview(body: Record<string, string>) {
  const response = await telegramFetch("/api/interview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const payload = (await response.json()) as {
    data?: InterviewTurnDto
    error?: { message?: string }
  }
  if (!response.ok || !payload.data) {
    throw new Error(payload.error?.message ?? "Интервью сейчас недоступно")
  }
  return payload.data
}

async function requestInterviewTranscription(input: {
  episodeId: string
  sessionToken: string
  audio: Blob
  fileName: string
}) {
  const body = new FormData()
  body.set("episodeId", input.episodeId)
  body.set("sessionToken", input.sessionToken)
  body.set("audio", input.audio, input.fileName)
  const response = await telegramFetch("/api/interview/transcribe", {
    method: "POST",
    body,
  })
  const payload = (await response.json().catch(() => ({}))) as {
    data?: { text?: string }
    error?: { code?: string; message?: string }
  }
  if (!response.ok) {
    throw new InterviewTranscriptionRequestError(
      payload.error?.message ?? "Voice input unavailable",
      response.status,
      payload.error?.code
    )
  }
  const text = payload.data?.text?.trim()
  if (!text) {
    throw new InterviewTranscriptionRequestError(
      "Empty transcription",
      422,
      "EMPTY_TRANSCRIPTION"
    )
  }
  return text
}

async function requestInterviewWordHelp(input: {
  episodeId: string
  sessionToken: string
  word: string
}) {
  const response = await telegramFetch("/api/interview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "word_help", ...input }),
  })
  const payload = (await response.json()) as {
    data?: InterviewWordHelpDto
    error?: { message?: string }
  }
  if (!response.ok || !payload.data) {
    throw new Error(payload.error?.message ?? "Не удалось перевести слово")
  }
  return payload.data
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

function normalizeTappableWord(value: string) {
  return value.toLocaleLowerCase("en").replace(/[’]/g, "'")
}

function TappableQuestion({
  text,
  words,
  onHelp,
}: {
  text: string
  words: string[]
  onHelp: (word: string) => Promise<InterviewWordHelpDto>
}) {
  const [loadingWord, setLoadingWord] = React.useState<string | null>(null)
  const [help, setHelp] = React.useState<InterviewWordHelpDto | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const tappable = new Set(words.map(normalizeTappableWord))
  const parts = text.split(/([A-Za-z]+(?:['’-][A-Za-z]+)*)/g)

  async function openWord(word: string) {
    if (loadingWord) return
    setLoadingWord(word)
    setError(null)
    try {
      const result = await onHelp(word)
      setHelp(result)
      getTelegramWebApp()?.HapticFeedback?.impactOccurred("light")
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Не удалось перевести слово"
      )
    } finally {
      setLoadingWord(null)
    }
  }

  return (
    <div>
      <span>
        {parts.map((part, index) =>
          tappable.has(normalizeTappableWord(part)) ? (
            <button
              key={`${part}-${index}`}
              type="button"
              disabled={Boolean(loadingWord)}
              onClick={() => void openWord(part)}
              className="font-inherit inline cursor-pointer border-0 bg-transparent p-0 text-inherit underline decoration-current/45 decoration-dotted underline-offset-4 disabled:opacity-60"
            >
              {part}
            </button>
          ) : (
            <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>
          )
        )}
      </span>
      {loadingWord && (
        <p className="mt-2 text-xs text-muted-foreground">Переводим…</p>
      )}
      {help && !loadingWord && (
        <p className="mt-2 border-t border-foreground/10 pt-2 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{help.word}</span> —{" "}
          {help.translationRu} · добавлено в повторение
        </p>
      )}
      {error && !loadingWord && (
        <p className="mt-2 text-xs text-destructive">{error}</p>
      )}
    </div>
  )
}

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

function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center overflow-hidden"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <Image
        src={logoMark}
        alt=""
        width={size}
        height={size}
        className="size-full scale-[1.5] object-contain"
        priority
      />
    </span>
  )
}

const subscribeToTelegramEnvironment = () => () => undefined
const getServerTelegramBackSnapshot = () => false

function getTelegramBackSnapshot() {
  const webApp = getTelegramWebApp()
  return Boolean(
    webApp?.initData && webApp.isVersionAtLeast("6.1") && webApp.BackButton
  )
}

function CatchEnglishShell({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <main className="min-h-dvh w-full bg-[var(--tg-theme-bg-color,var(--background))] text-[var(--tg-theme-text-color,var(--foreground))] lg:bg-muted/35">
      <section
        className={cn(
          "relative min-h-dvh w-full overflow-x-hidden bg-background lg:border-x lg:shadow-[0_0_80px_rgba(40,35,25,0.06)]",
          className
        )}
      >
        {children}
      </section>
    </main>
  )
}

function TopBar({
  title,
  onBack,
  right,
}: {
  title?: string
  onBack?: () => void
  right?: React.ReactNode
}) {
  const nativeBackAvailable = React.useSyncExternalStore(
    subscribeToTelegramEnvironment,
    getTelegramBackSnapshot,
    getServerTelegramBackSnapshot
  )

  if (nativeBackAvailable && onBack && !title && !right) {
    return <div className="h-[var(--app-safe-top)]" aria-hidden="true" />
  }

  return (
    <header className="mx-auto flex h-[calc(64px+var(--app-safe-top))] w-full max-w-[1200px] items-center justify-between px-5 pt-[var(--app-safe-top)] lg:h-[calc(76px+var(--app-safe-top))] lg:px-10">
      <div className="w-10">
        {onBack && !nativeBackAvailable && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Назад"
            onClick={onBack}
            className="-ml-2"
          >
            <Icon icon={ArrowLeft01Icon} />
          </Button>
        )}
      </div>
      {title && <div className="text-sm font-semibold">{title}</div>}
      <div className="flex w-10 justify-end">{right}</div>
    </header>
  )
}

function MoreForToday() {
  const links = [
    { href: "/my/phrases", label: "Мои фразы", icon: Cards01Icon },
    { href: "/my/watch", label: "Что посмотреть", icon: Video01Icon },
  ] as const

  return (
    <section className="mt-7 w-full max-w-[760px]">
      <h2 className="text-sm font-semibold">Хочешь ещё?</h2>
      <div className="mt-3 divide-y border-y">
        {links.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group flex min-h-14 items-center gap-3 py-3 text-sm font-semibold"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground transition-colors group-hover:text-foreground">
              <Icon icon={item.icon} size={18} />
            </span>
            <span className="flex-1">{item.label}</span>
            <span className="text-muted-foreground transition-transform group-hover:translate-x-0.5">
              <Icon icon={ArrowRight01Icon} size={17} />
            </span>
          </Link>
        ))}
      </div>
    </section>
  )
}

export function CatchEnglishApp({
  initialSection = "today",
}: {
  initialSection?: PrimarySection
}) {
  const personalAreaSession = usePersonalAreaSession()
  const nativeBackAvailable = React.useSyncExternalStore(
    subscribeToTelegramEnvironment,
    getTelegramBackSnapshot,
    getServerTelegramBackSnapshot
  )
  const resumeFromPersonalArea =
    personalAreaSession?.onboardingCompleted === true
  const [authMode, setAuthMode] = React.useState<AuthMode>(() =>
    resumeFromPersonalArea ? "web" : "checking"
  )
  const [webSessionUser, setWebSessionUser] =
    React.useState<WebSessionUser | null>(() =>
      resumeFromPersonalArea ? { onboardingCompleted: true } : null
    )
  const [browserAuthError, setBrowserAuthError] = React.useState<string | null>(
    null
  )
  const [screen, setScreen] = React.useState<Screen>(() =>
    resumeFromPersonalArea ? initialSection : "welcome"
  )
  const [question, setQuestion] = React.useState(4)
  const [questionNumber, setQuestionNumber] = React.useState(0)
  const [ability, setAbility] = React.useState(1)
  const [correctStreak, setCorrectStreak] = React.useState(0)
  const [askedQuestions, setAskedQuestions] = React.useState<number[]>([4])
  const [selectedAnswer, setSelectedAnswer] = React.useState<
    number | "unknown" | null
  >(null)
  const [reminder, setReminder] = React.useState("19:00")
  const [placementProgram, setPlacementProgram] = React.useState<string | null>(
    null
  )
  const [placementResultLevel, setPlacementResultLevel] = React.useState<
    (typeof placementLevels)[number] | null
  >(null)
  const [placementSaving, setPlacementSaving] = React.useState(false)
  const [placementError, setPlacementError] = React.useState<string | null>(
    null
  )
  const [reminderEnabled, setReminderEnabled] = React.useState(true)
  const [reminderSaving, setReminderSaving] = React.useState(false)
  const [reminderError, setReminderError] = React.useState<string | null>(null)
  const [videoDone, setVideoDone] = React.useState(false)
  const [cardsDone, setCardsDone] = React.useState(false)
  const [retellDone, setRetellDone] = React.useState(false)
  const [cardIndex, setCardIndex] = React.useState(0)
  const [revealed, setRevealed] = React.useState(false)
  const [todayData, setTodayData] = React.useState<TodayDto | null>(null)
  const [todayLoading, setTodayLoading] = React.useState(false)
  const [todayError, setTodayError] = React.useState<string | null>(null)
  const [sessionCardTotal, setSessionCardTotal] = React.useState(0)
  const [planItemSaving, setPlanItemSaving] =
    React.useState<PlanItemType | null>(null)
  const [reviewCompletionPending, setReviewCompletionPending] =
    React.useState(false)
  const [reviewCompletionError, setReviewCompletionError] = React.useState<
    string | null
  >(null)
  const [programSettings, setProgramSettings] = React.useState<
    ProgramSettingDto[] | null
  >(null)
  const [programError, setProgramError] = React.useState<string | null>(null)
  const [interviewMessages, setInterviewMessages] = React.useState<
    InterviewMessage[]
  >([])
  const [interviewToken, setInterviewToken] = React.useState<string | null>(
    null
  )
  const [interviewDraft, setInterviewDraft] = React.useState("")
  const [interviewLoading, setInterviewLoading] = React.useState(false)
  const [interviewError, setInterviewError] = React.useState<string | null>(
    null
  )
  const [interviewAnswers, setInterviewAnswers] = React.useState(0)
  const [interviewCompleted, setInterviewCompleted] = React.useState(false)
  const voiceSupported = React.useSyncExternalStore(
    subscribeToVoiceSupport,
    getVoiceSupportSnapshot,
    getServerVoiceSupportSnapshot
  )
  const [voiceDisabled, setVoiceDisabled] = React.useState(false)
  const voiceAvailable = voiceSupported && !voiceDisabled
  const [voicePhase, setVoicePhase] = React.useState<VoicePhase>("idle")
  const [recordingSeconds, setRecordingSeconds] = React.useState(0)
  const [pendingVoiceRecording, setPendingVoiceRecording] =
    React.useState<PendingVoiceRecording | null>(null)
  const [voiceTranscriptionError, setVoiceTranscriptionError] = React.useState<
    string | null
  >(null)
  const [homeScreenPrompted, setHomeScreenPrompted] = React.useState(() =>
    typeof window === "undefined"
      ? false
      : window.localStorage.getItem("okey-english:home-screen-prompted") === "1"
  )
  const [dismissedTodayReturnPlanId, setDismissedTodayReturnPlanId] =
    React.useState(() =>
      typeof window === "undefined"
        ? null
        : window.localStorage.getItem(
            "catch-english:dismissed-today-return-plan"
          )
    )
  const reviewSyncInFlight = React.useRef<Promise<void> | null>(null)
  const reviewSyncRequested = React.useRef(false)
  const planItemSyncInFlight = React.useRef<ReturnType<
    typeof flushPendingPlanItems
  > | null>(null)
  const todayLoadInFlight = React.useRef<Promise<TodayDto | null> | null>(null)
  const todayRefreshInFlight = React.useRef<Promise<void> | null>(null)
  const todayRefreshRequested = React.useRef(false)
  const todayStateVersion = React.useRef(0)
  const activePlanId = React.useRef<string | null>(null)
  const planItemSaveInFlight = React.useRef(false)
  const reviewCompletionInFlight = React.useRef(false)
  const settingsLoadInFlight = React.useRef(false)
  const deferredTodayRefresh = React.useRef(false)
  const screenRef = React.useRef<Screen>(screen)
  const interviewRun = React.useRef(0)
  const mediaStream = React.useRef<MediaStream | null>(null)
  const mediaRecorder = React.useRef<MediaRecorder | null>(null)
  const discardRecording = React.useRef(false)
  const voiceLifecycle = React.useRef(0)
  const voiceRecordingInProgress = React.useRef(false)
  const voiceTranscriptionInProgress = React.useRef(false)
  const interviewScroll = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    screenRef.current = screen
  }, [screen])

  const releaseMicrophone = React.useCallback(() => {
    voiceLifecycle.current += 1
    discardRecording.current = true
    const recorder = mediaRecorder.current
    mediaRecorder.current = null
    if (recorder && recorder.state !== "inactive") {
      recorder.stop()
    }
    mediaStream.current?.getTracks().forEach((track) => track.stop())
    mediaStream.current = null
    voiceRecordingInProgress.current = false
    voiceTranscriptionInProgress.current = false
    setVoicePhase("idle")
    setRecordingSeconds(0)
  }, [])

  const resetInterview = React.useCallback(() => {
    interviewRun.current += 1
    releaseMicrophone()
    setInterviewMessages([])
    setInterviewToken(null)
    setInterviewDraft("")
    setInterviewLoading(false)
    setInterviewError(null)
    setInterviewAnswers(0)
    setInterviewCompleted(false)
    setPendingVoiceRecording(null)
    setVoiceTranscriptionError(null)
  }, [releaseMicrophone])

  React.useEffect(() => {
    return releaseMicrophone
  }, [releaseMicrophone])

  React.useEffect(() => {
    if (voicePhase !== "recording") return
    const interval = window.setInterval(
      () => setRecordingSeconds((seconds) => seconds + 1),
      1_000
    )
    const timeout = window.setTimeout(() => {
      const recorder = mediaRecorder.current
      if (recorder?.state === "recording") recorder.stop()
    }, 60_000)
    return () => {
      window.clearInterval(interval)
      window.clearTimeout(timeout)
    }
  }, [voicePhase])

  React.useEffect(() => {
    if (screen !== "interview") return
    const frame = window.requestAnimationFrame(() => {
      const container = interviewScroll.current
      container?.scrollTo({
        top: container.scrollHeight,
        behavior: "smooth",
      })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [interviewLoading, interviewMessages, screen, voicePhase])

  const syncPendingReviews = React.useCallback((requestRerun = true) => {
    if (requestRerun) reviewSyncRequested.current = true
    if (reviewSyncInFlight.current) return reviewSyncInFlight.current

    const work = (async () => {
      try {
        do {
          reviewSyncRequested.current = false
          try {
            const result = await flushPendingReviews()
            if (result.synced > 0 || result.discarded > 0) {
              todayStateVersion.current += 1
            }
          } catch {
            // The queue remains in localStorage and is retried when connectivity returns.
          }
        } while (reviewSyncRequested.current)
      } finally {
        reviewSyncInFlight.current = null
      }
    })()
    reviewSyncInFlight.current = work
    return work
  }, [])

  const syncPendingPlanItems = React.useCallback(() => {
    if (planItemSyncInFlight.current) return planItemSyncInFlight.current

    const pendingPlanItems = getPendingPlanItems()
    if (
      hasReviewsBlockingPlanItemFlush(
        pendingPlanItems.map((item) => item.planId)
      )
    ) {
      return Promise.resolve({
        saved: [],
        stale: [],
        discarded: 0,
        remaining: pendingPlanItems.length,
      })
    }

    const work = (async () => {
      const result = await flushPendingPlanItems()
      if (result.saved.length > 0 || result.stale.length > 0) {
        todayStateVersion.current += 1
      }
      return result
    })()
    planItemSyncInFlight.current = work
    const clearInFlight = () => {
      if (planItemSyncInFlight.current === work) {
        planItemSyncInFlight.current = null
      }
    }
    void work.then(clearInFlight, clearInFlight)
    return work
  }, [])

  const loadToday = React.useCallback(() => {
    if (todayLoadInFlight.current) return todayLoadInFlight.current
    const requestedVersion = todayStateVersion.current

    const work = (async () => {
      setTodayLoading(true)
      setTodayError(null)
      try {
        const response = await telegramFetch("/api/today", {
          cache: "no-store",
        })
        const payload = (await response.json()) as {
          data?: TodayDto
          error?: { message?: string }
        }
        if (!response.ok || !payload.data) {
          throw new Error(payload.error?.message ?? "Не удалось загрузить план")
        }
        if (requestedVersion !== todayStateVersion.current) return null

        const today = payload.data
        const completedItems = today.plan.completedItems
        const planChanged = activePlanId.current !== today.plan.id
        activePlanId.current = today.plan.id

        setTodayData(today)
        setVideoDone(completedItems.includes("watch"))
        setCardsDone(completedItems.includes("review"))
        setRetellDone(completedItems.includes("retell"))

        if (planChanged) {
          setCardIndex(0)
          setRevealed(false)
          setReviewCompletionPending(false)
          setReviewCompletionError(null)
          if (screenRef.current === "complete") setScreen("today")
          setSessionCardTotal(
            today.queue.reviewStep?.status === "skipped"
              ? 0
              : today.queue.reviewStep?.status === "completed"
                ? today.queue.reviewStep.reviewedCount
                : (today.queue.reviewStep?.assignedCount ??
                  today.queue.cards.length)
          )
        } else if (
          !completedItems.includes("review") &&
          today.queue.cards.length > 0
        ) {
          setSessionCardTotal((current) =>
            Math.max(
              current,
              today.queue.reviewStep?.assignedCount ?? today.queue.cards.length
            )
          )
        } else if (completedItems.includes("review")) {
          setSessionCardTotal(
            today.queue.reviewStep?.status === "completed"
              ? today.queue.reviewStep.reviewedCount
              : 0
          )
        }
        return today
      } catch (error) {
        if (requestedVersion !== todayStateVersion.current) return null
        setTodayError(
          error instanceof Error ? error.message : "Не удалось загрузить план"
        )
        return null
      } finally {
        setTodayLoading(false)
      }
    })()

    todayLoadInFlight.current = work
    void work.then(() => {
      if (todayLoadInFlight.current === work) todayLoadInFlight.current = null
    })
    return work
  }, [])

  const reconcileTodayAfterMutation = React.useCallback(async () => {
    const previousLoad = todayLoadInFlight.current
    if (previousLoad) await previousLoad
    return loadToday()
  }, [loadToday])

  const refreshToday = React.useCallback(() => {
    todayRefreshRequested.current = true
    if (todayRefreshInFlight.current) return todayRefreshInFlight.current

    const work = (async () => {
      do {
        todayRefreshRequested.current = false
        await syncPendingReviews(false)
        await syncPendingPlanItems()

        // A request that started before focus/online/midnight may describe the
        // previous day. Ignore it, then fetch a fresh server snapshot.
        if (todayLoadInFlight.current) todayStateVersion.current += 1
        await reconcileTodayAfterMutation()
      } while (todayRefreshRequested.current)
    })()
    todayRefreshInFlight.current = work
    const clearInFlight = () => {
      if (todayRefreshInFlight.current === work) {
        todayRefreshInFlight.current = null
      }
    }
    void work.then(clearInFlight, clearInFlight)
    return work
  }, [reconcileTodayAfterMutation, syncPendingPlanItems, syncPendingReviews])

  const openToday = React.useCallback(async () => {
    setScreen("today")
    await refreshToday()
  }, [refreshToday])

  const openInitialSection = React.useCallback(async () => {
    if (initialSection === "phrases" || initialSection === "watch") {
      setScreen(initialSection)
      return
    }
    if (initialSection === "settings") {
      setScreen("settings")
      return
    }
    await openToday()
  }, [initialSection, openToday])

  React.useEffect(() => {
    if (resumeFromPersonalArea) return
    let cancelled = false
    const initializeAuthentication = async () => {
      await Promise.resolve()
      if (cancelled) return

      const webApp = getTelegramWebApp()
      if (webApp?.initData) {
        setAuthMode("telegram")
        return
      }

      const error = new URLSearchParams(window.location.search).get(
        "auth_error"
      )
      if (error) {
        setBrowserAuthError(
          error === "cancelled"
            ? "Вход через Telegram был отменён."
            : "Не удалось войти через Telegram. Попробуй ещё раз."
        )
      }

      try {
        const response = await telegramFetch("/api/auth/web/session", {
          cache: "no-store",
        })
        if (cancelled) return
        if (!response.ok) {
          if (process.env.NODE_ENV !== "production") {
            setWebSessionUser({
              onboardingCompleted:
                window.localStorage.getItem(
                  "okey-english:onboarding-complete"
                ) === "1",
            })
            setAuthMode("web")
            return
          }
          setAuthMode("anonymous")
          return
        }
        const payload = (await response.json()) as {
          data?: { user?: WebSessionUser }
        }
        if (!payload.data?.user) {
          setAuthMode("anonymous")
          return
        }
        setWebSessionUser(payload.data.user)
        setAuthMode("web")
      } catch {
        if (!cancelled) setAuthMode("anonymous")
      }
    }

    void initializeAuthentication()

    return () => {
      cancelled = true
    }
  }, [resumeFromPersonalArea])

  React.useEffect(() => {
    if (authMode === "checking" || authMode === "anonymous") return
    let cancelled = false
    const resume = async () => {
      if (!cancelled) await openInitialSection()
    }
    if (authMode === "web") {
      if (!webSessionUser?.onboardingCompleted) return
      const timeout = window.setTimeout(() => void resume(), 0)
      return () => {
        cancelled = true
        window.clearTimeout(timeout)
      }
    }
    if (
      window.localStorage.getItem("okey-english:onboarding-complete") === "1"
    ) {
      const timeout = window.setTimeout(() => void resume(), 0)
      return () => {
        cancelled = true
        window.clearTimeout(timeout)
      }
    }
    getTelegramCloudFlag("onboarding_complete", (value) => {
      if (value !== "1" || cancelled) return
      window.localStorage.setItem("okey-english:onboarding-complete", "1")
      void resume()
    })
    return () => {
      cancelled = true
    }
  }, [authMode, openInitialSection, syncPendingReviews, webSessionUser])

  React.useEffect(() => {
    let midnightRefresh: number | null = null

    const requestRefresh = () => {
      if (document.visibilityState === "hidden") return
      if (screenRef.current !== "today" && screenRef.current !== "complete") {
        deferredTodayRefresh.current = true
        return
      }
      deferredTodayRefresh.current = false
      void refreshToday()
    }

    const scheduleMidnightRefresh = () => {
      const now = new Date()
      const nextMidnight = new Date(now)
      nextMidnight.setHours(24, 0, 1, 0)
      midnightRefresh = window.setTimeout(
        () => {
          requestRefresh()
          scheduleMidnightRefresh()
        },
        Math.max(1_000, nextMidnight.getTime() - now.getTime())
      )
    }

    window.addEventListener("pageshow", requestRefresh)
    window.addEventListener("focus", requestRefresh)
    document.addEventListener("visibilitychange", requestRefresh)
    scheduleMidnightRefresh()
    return () => {
      window.removeEventListener("pageshow", requestRefresh)
      window.removeEventListener("focus", requestRefresh)
      document.removeEventListener("visibilitychange", requestRefresh)
      if (midnightRefresh !== null) window.clearTimeout(midnightRefresh)
    }
  }, [refreshToday])

  React.useEffect(() => {
    if (screen !== "today" || !deferredTodayRefresh.current) return
    deferredTodayRefresh.current = false
    void refreshToday()
  }, [refreshToday, screen])

  const openSettings = React.useCallback(async () => {
    if (settingsLoadInFlight.current) return
    settingsLoadInFlight.current = true
    setScreen("settings")
    setProgramError(null)
    setReminderError(null)
    try {
      const [programResponse, reminderResponse] = await Promise.all([
        telegramFetch("/api/programs", { cache: "no-store" }),
        telegramFetch("/api/reminders", { cache: "no-store" }),
      ])
      const payload = (await programResponse.json()) as {
        data?: ProgramSettingDto[]
        error?: { message?: string }
      }
      if (!programResponse.ok || !payload.data) {
        throw new Error(
          payload.error?.message ?? "Не удалось загрузить программы"
        )
      }
      setProgramSettings(payload.data)
      const reminderPayload = (await reminderResponse.json()) as {
        data?: { time: string | null }
      }
      if (reminderResponse.ok && reminderPayload.data) {
        setReminderEnabled(reminderPayload.data.time !== null)
        if (reminderPayload.data.time) setReminder(reminderPayload.data.time)
      }
    } catch (error) {
      setProgramError(
        error instanceof Error
          ? error.message
          : "Не удалось загрузить программы"
      )
    } finally {
      settingsLoadInFlight.current = false
    }
  }, [])

  async function saveReminderPreference(
    time: string | null,
    returnToToday = false
  ) {
    setReminderSaving(true)
    setReminderError(null)
    try {
      const response = await telegramFetch("/api/reminders", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ time }),
      })
      const payload = (await response.json()) as {
        data?: { time: string | null }
        error?: { message?: string }
      }
      if (!response.ok || !payload.data) {
        throw new Error(
          payload.error?.message ?? "Не удалось сохранить напоминание"
        )
      }
      setReminderEnabled(payload.data.time !== null)
      if (payload.data.time) setReminder(payload.data.time)
      if (returnToToday) openToday()
    } catch (error) {
      setReminderError(
        error instanceof Error
          ? error.message
          : "Не удалось сохранить напоминание"
      )
    } finally {
      setReminderSaving(false)
    }
  }

  const goBack = React.useCallback(() => {
    if (screen === "test") setScreen("welcome")
    else if (screen === "result") setScreen("test")
    else if (screen === "reminder") setScreen("result")
    else if (screen === "video" || screen === "review" || screen === "settings")
      setScreen("today")
    else if (screen === "interview") {
      resetInterview()
      setScreen("today")
    } else if (screen === "complete") setScreen("today")
  }, [resetInterview, screen])

  React.useEffect(() => {
    const webApp = getTelegramWebApp()
    webApp?.ready()
    webApp?.expand()
    if (webApp?.isVersionAtLeast("7.7")) webApp.disableVerticalSwipes?.()

    const handleOnline = () => {
      if (["today", "complete"].includes(screenRef.current)) {
        void refreshToday()
        return
      }
      deferredTodayRefresh.current = true
      void syncPendingReviews().then(() => syncPendingPlanItems())
    }
    window.addEventListener("online", handleOnline)
    void syncPendingReviews()
    return () => {
      window.removeEventListener("online", handleOnline)
      if (webApp?.isVersionAtLeast("7.7")) webApp.enableVerticalSwipes?.()
    }
  }, [refreshToday, syncPendingPlanItems, syncPendingReviews])

  React.useEffect(() => {
    const webApp = getTelegramWebApp()
    const backButton = webApp?.BackButton
    if (!webApp?.initData || !webApp.isVersionAtLeast("6.1") || !backButton)
      return
    const canGoBack = !["welcome", "today"].includes(screen)
    if (canGoBack) backButton.show().onClick(goBack)
    else backButton.hide()
    return () => {
      backButton.offClick(goBack)
    }
  }, [goBack, screen])

  React.useEffect(() => {
    if (screen !== "review") return
    return () => {
      const webApp = getTelegramWebApp()
      if (webApp?.isVersionAtLeast("8.0")) webApp.exitFullscreen?.()
    }
  }, [screen])

  function answer(index: number | "unknown") {
    if (selectedAnswer !== null) return
    setSelectedAnswer(index)
    const isCorrect =
      index !== "unknown" && index === questions[question].correct
    const nextStreak = isCorrect ? correctStreak + 1 : 0
    const nextAbility = isCorrect
      ? Math.min(4, ability + (nextStreak >= 2 ? 1 : 0))
      : Math.max(0, ability - 1)

    window.setTimeout(() => {
      setAbility(nextAbility)
      setCorrectStreak(nextStreak >= 2 ? 0 : nextStreak)

      if (questionNumber === testLength - 1) {
        const placementLevel = placementLevels[Math.min(3, nextAbility)]
        setPlacementResultLevel(placementLevel)
        setScreen("result")
        void savePlacementResult(placementLevel)
      } else {
        const unasked = questions
          .map((item, candidateIndex) => ({ item, candidateIndex }))
          .filter(
            ({ candidateIndex }) => !askedQuestions.includes(candidateIndex)
          )
          .sort(
            (a, b) =>
              Math.abs(a.item.difficulty - nextAbility) -
              Math.abs(b.item.difficulty - nextAbility)
          )
        const nextQuestion = unasked[0].candidateIndex
        setQuestion(nextQuestion)
        setQuestionNumber((value) => value + 1)
        setAskedQuestions((value) => [...value, nextQuestion])
      }
      setSelectedAnswer(null)
    }, 460)
  }

  const finishReviewStep = React.useCallback(async () => {
    const planId = todayData?.plan.id
    if (!planId || reviewCompletionInFlight.current) return

    reviewCompletionInFlight.current = true
    setPlanItemSaving("review")
    setTodayError(null)
    setReviewCompletionError(null)
    try {
      await syncPendingReviews(false)
      if (getPendingReviews().some((review) => review.planId === planId)) {
        setTodayError("Не удалось синхронизировать все оценки карточек")
        setReviewCompletionError(
          "Не удалось отправить все оценки на сервер. Они сохранены на устройстве и будут отправлены автоматически."
        )
        return
      }

      const sync = await syncPendingPlanItems()
      if (sync.stale.some((item) => item.planId === planId)) {
        await reconcileTodayAfterMutation()
        setReviewCompletionPending(false)
        setReviewCompletionError(null)
        setScreen("today")
        return
      }

      const saved = sync.saved.find((entry) => entry.item.planId === planId)
      if (!saved) {
        if (!getPendingPlanItems().some((item) => item.planId === planId)) {
          await reconcileTodayAfterMutation()
          setReviewCompletionPending(false)
          setReviewCompletionError(null)
          setScreen("today")
        } else {
          setReviewCompletionError(
            "Не удалось подтвердить шаг на сервере. Повторим автоматически, как только связь восстановится."
          )
        }
        return
      }

      const freshToday = await reconcileTodayAfterMutation()
      if (!freshToday || freshToday.plan.id !== planId) {
        setReviewCompletionPending(false)
        setReviewCompletionError(null)
        setScreen("today")
        return
      }

      setReviewCompletionPending(false)
      setReviewCompletionError(null)
      setCardIndex(0)
      setRevealed(false)
      setScreen(
        freshToday.plan.completedItems.includes("watch") &&
          freshToday.plan.completedItems.includes("review") &&
          freshToday.plan.completedItems.includes("retell")
          ? "complete"
          : "today"
      )
    } catch {
      setReviewCompletionError(
        "Не удалось подтвердить шаг на сервере. Повторим автоматически, как только связь восстановится."
      )
    } finally {
      reviewCompletionInFlight.current = false
      if (!planItemSaveInFlight.current) setPlanItemSaving(null)
    }
  }, [
    reconcileTodayAfterMutation,
    syncPendingPlanItems,
    syncPendingReviews,
    todayData?.plan.id,
  ])

  React.useEffect(() => {
    if (screen !== "review" || !reviewCompletionPending) return

    const retry = () => void finishReviewStep()
    const interval = window.setInterval(retry, 5_000)
    window.addEventListener("online", retry)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener("online", retry)
    }
  }, [finishReviewStep, reviewCompletionPending, screen])

  function rateCard(rating: Rating) {
    const reviewQueue = todayData?.queue.cards ?? []
    const planId = todayData?.plan.id
    const episodeId = todayData?.episode.id
    const activeCardIndex = normalizeReviewQueueIndex(
      cardIndex,
      reviewQueue.length
    )
    const card = reviewQueue[activeCardIndex]
    if (
      !card ||
      !planId ||
      !episodeId ||
      reviewCompletionPending ||
      planItemSaveInFlight.current
    )
      return

    enqueuePendingReview({
      eventId: crypto.randomUUID(),
      cardId: card.id,
      planId,
      rating,
      answeredAt: new Date().toISOString(),
    })
    const isLastCard = activeCardIndex === reviewQueue.length - 1
    if (isLastCard) {
      enqueuePendingPlanItem({ planId, episodeId, type: "review" })
      setReviewCompletionError(null)
    }
    const haptics = getTelegramWebApp()?.HapticFeedback
    if (rating === "again") haptics?.notificationOccurred("warning")
    else haptics?.impactOccurred(rating === "hard" ? "medium" : "light")
    void syncPendingReviews()

    if (isLastCard) {
      setReviewCompletionPending(true)
      void finishReviewStep()
      return
    }
    setCardIndex(activeCardIndex + 1)
    setRevealed(false)
  }

  function startTest() {
    setPlacementProgram(null)
    setPlacementResultLevel(null)
    setPlacementSaving(false)
    setPlacementError(null)
    setQuestion(4)
    setQuestionNumber(0)
    setAbility(1)
    setCorrectStreak(0)
    setAskedQuestions([4])
    setSelectedAnswer(null)
    setScreen("test")
  }

  async function savePlacementResult(
    placementLevel: (typeof placementLevels)[number]
  ) {
    setPlacementSaving(true)
    setPlacementError(null)
    try {
      const response = await telegramFetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level: placementLevel }),
      })
      const payload = (await response.json()) as {
        data?: { program?: { title?: string } | null }
        error?: { message?: string }
      }
      if (!response.ok || !payload.data) {
        throw new Error(
          payload.error?.message ?? "Не удалось сохранить результат"
        )
      }
      setPlacementProgram(payload.data.program?.title ?? null)
      window.localStorage.setItem("okey-english:onboarding-complete", "1")
      setTelegramCloudFlag("onboarding_complete", "1")
    } catch (error) {
      setPlacementError(
        error instanceof Error
          ? error.message
          : "Не удалось сохранить результат"
      )
    } finally {
      setPlacementSaving(false)
    }
  }

  async function openInterview() {
    const episodeId = todayData?.episode.id
    if (!episodeId) return
    resetInterview()
    const run = interviewRun.current
    setScreen("interview")
    setInterviewLoading(true)
    try {
      const turn = await requestInterview({ action: "start", episodeId })
      if (run !== interviewRun.current) return
      setInterviewMessages(
        turn.messages ?? [
          {
            id: crypto.randomUUID(),
            role: "assistant",
            text: turn.message,
            questionWords: turn.questionWords,
            helpToken: turn.sessionToken ?? undefined,
          },
        ]
      )
      setInterviewToken(turn.sessionToken)
      setInterviewAnswers(turn.answersCompleted)
      setInterviewCompleted(turn.completed)
    } catch (error) {
      if (run !== interviewRun.current) return
      setInterviewError(
        error instanceof Error ? error.message : "Интервью сейчас недоступно"
      )
    } finally {
      if (run === interviewRun.current) setInterviewLoading(false)
    }
  }

  async function sendInterviewAnswer(
    answerOverride?: string,
    retryMessageId?: string
  ) {
    const episodeId = todayData?.episode.id
    const answer = (answerOverride ?? interviewDraft).trim()
    if (!episodeId || !interviewToken || !answer || interviewLoading) {
      return
    }

    setPendingVoiceRecording(null)
    setVoiceTranscriptionError(null)
    const run = interviewRun.current
    const stepWasCompleted = interviewCompleted
    const messageId = retryMessageId ?? crypto.randomUUID()
    if (retryMessageId) {
      setInterviewMessages((messages) =>
        messages.map((message) =>
          message.id === retryMessageId
            ? { ...message, delivery: "sending", error: undefined }
            : message
        )
      )
    } else {
      setInterviewMessages((messages) => [
        ...messages,
        {
          id: messageId,
          role: "user",
          text: answer,
          delivery: "sending",
        },
      ])
    }
    setInterviewDraft("")
    setInterviewLoading(true)
    setInterviewError(null)
    getTelegramWebApp()?.HapticFeedback?.impactOccurred("light")
    try {
      const turn = await requestInterview({
        action: "reply",
        episodeId,
        sessionToken: interviewToken,
        answer,
      })
      if (run !== interviewRun.current) return
      setInterviewMessages(
        (messages) =>
          turn.messages ?? [
            ...messages.map((message) =>
              message.id === messageId
                ? { ...message, delivery: undefined, error: undefined }
                : message
            ),
            ...(turn.correction
              ? [
                  {
                    id: crypto.randomUUID(),
                    role: "correction" as const,
                    text: turn.correction,
                  },
                ]
              : []),
            ...(turn.reaction
              ? [
                  {
                    id: crypto.randomUUID(),
                    role: "assistant" as const,
                    text: turn.reaction,
                  },
                ]
              : []),
            {
              id: crypto.randomUUID(),
              role: "assistant",
              text: turn.message,
              questionWords: turn.questionWords,
              helpToken: turn.sessionToken ?? undefined,
            },
          ]
      )
      setInterviewToken(turn.sessionToken)
      setInterviewAnswers(turn.answersCompleted)
      setInterviewCompleted(turn.completed)
      if (turn.completed && !stepWasCompleted) {
        setRetellDone(true)
        getTelegramWebApp()?.HapticFeedback?.notificationOccurred("success")
      }
    } catch (error) {
      if (run !== interviewRun.current) return
      const message =
        error instanceof Error ? error.message : "Ответ не отправился"
      setInterviewMessages((messages) =>
        messages.map((item) =>
          item.id === messageId
            ? { ...item, delivery: "failed", error: message }
            : item
        )
      )
    } finally {
      if (run === interviewRun.current) setInterviewLoading(false)
    }
  }

  function disableVoiceInput() {
    releaseMicrophone()
    setPendingVoiceRecording(null)
    setVoiceTranscriptionError(null)
    setVoiceDisabled(true)
  }

  async function transcribeVoiceRecording(input: PendingVoiceRecording) {
    if (
      input.run !== interviewRun.current ||
      voiceTranscriptionInProgress.current
    ) {
      return
    }
    voiceTranscriptionInProgress.current = true

    setPendingVoiceRecording(input)
    setVoiceTranscriptionError(null)
    setVoicePhase("transcribing")
    try {
      const text = await requestInterviewTranscription({
        episodeId: input.episodeId,
        sessionToken: input.sessionToken,
        audio: input.audio,
        fileName: recordingFileName(input.mimeType),
      })
      if (input.run !== interviewRun.current) return

      setPendingVoiceRecording(null)
      setVoiceTranscriptionError(null)
      setInterviewDraft(text)
      setVoicePhase("idle")
      setRecordingSeconds(0)
      await sendInterviewAnswer(text)
    } catch (error) {
      if (input.run !== interviewRun.current) return
      if (isEmptyInterviewTranscriptionError(error)) {
        disableVoiceInput()
        return
      }
      setVoicePhase("idle")
      setRecordingSeconds(0)
      setVoiceTranscriptionError("Не удалось распознать запись")
    } finally {
      if (input.run === interviewRun.current) {
        voiceTranscriptionInProgress.current = false
      }
    }
  }

  async function finishVoiceRecording(input: {
    chunks: Blob[]
    mimeType: string
    run: number
    episodeId: string
    sessionToken: string
  }) {
    if (discardRecording.current || input.run !== interviewRun.current) return
    const audio = new Blob(input.chunks, { type: input.mimeType })
    if (audio.size < 128) {
      disableVoiceInput()
      return
    }

    await transcribeVoiceRecording({
      audio,
      mimeType: input.mimeType,
      run: input.run,
      episodeId: input.episodeId,
      sessionToken: input.sessionToken,
    })
  }

  async function startVoiceRecording() {
    const episodeId = todayData?.episode.id
    const sessionToken = interviewToken
    if (
      !voiceAvailable ||
      !episodeId ||
      !sessionToken ||
      interviewLoading ||
      voicePhase !== "idle" ||
      voiceRecordingInProgress.current ||
      voiceTranscriptionInProgress.current
    ) {
      return
    }

    voiceRecordingInProgress.current = true
    discardRecording.current = false
    setPendingVoiceRecording(null)
    setVoiceTranscriptionError(null)
    const lifecycle = voiceLifecycle.current
    try {
      let stream = mediaStream.current
      if (
        !stream?.getAudioTracks().some((track) => track.readyState === "live")
      ) {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
          },
          video: false,
        })
        if (lifecycle !== voiceLifecycle.current) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        mediaStream.current = stream
      }

      const mimeType = preferredRecordingMimeType()
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)
      const chunks: Blob[] = []
      const run = interviewRun.current
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data)
      }
      recorder.onstop = () => {
        mediaRecorder.current = null
        if (lifecycle === voiceLifecycle.current) {
          voiceRecordingInProgress.current = false
        }
        void finishVoiceRecording({
          chunks,
          mimeType: recorder.mimeType || mimeType || "audio/webm",
          run,
          episodeId,
          sessionToken,
        })
      }
      mediaRecorder.current = recorder
      recorder.start(250)
      setRecordingSeconds(0)
      setVoicePhase("recording")
    } catch {
      if (lifecycle === voiceLifecycle.current) disableVoiceInput()
    }
  }

  function stopVoiceRecording() {
    const recorder = mediaRecorder.current
    if (recorder?.state === "recording") recorder.stop()
  }

  function leaveInterview() {
    resetInterview()
    setScreen("today")
  }

  function leaveCompletedInterview() {
    const planId = todayData?.plan.id
    if (planId) {
      window.localStorage.setItem(
        "catch-english:dismissed-today-return-plan",
        planId
      )
      setDismissedTodayReturnPlanId(planId)
    }
    leaveInterview()
  }

  async function markVideoDone() {
    const saved = await persistPlanItem("watch")
    if (!saved) return
    setScreen(
      saved.completedItems.includes("watch") &&
        saved.completedItems.includes("review") &&
        saved.completedItems.includes("retell")
        ? "complete"
        : "today"
    )
  }

  function openYoutube(url: string) {
    const webApp = getTelegramWebApp()
    if (webApp?.initData && webApp.openLink) {
      webApp.openLink(url)
      return
    }
    window.open(url, "_blank", "noopener,noreferrer")
  }

  async function persistPlanItem(type: PlanItemType) {
    const planId = todayData?.plan.id
    const episodeId = todayData?.episode.id
    if (!planId || !episodeId || planItemSaveInFlight.current) return null

    planItemSaveInFlight.current = true
    setPlanItemSaving(type)
    setTodayError(null)
    try {
      await requestPlanItem(planId, episodeId, type)
      if (activePlanId.current !== planId) return null
      todayStateVersion.current += 1
      const freshToday = await reconcileTodayAfterMutation()
      if (!freshToday || freshToday.plan.id !== planId) return null
      return {
        status: freshToday.plan.status,
        completedItems: freshToday.plan.completedItems,
      }
    } catch (error) {
      if (error instanceof PlanItemRequestError && error.status === 409) {
        todayStateVersion.current += 1
        await reconcileTodayAfterMutation()
        setReviewCompletionPending(false)
        setScreen("today")
        return null
      }
      setTodayError(
        error instanceof Error ? error.message : "Не удалось сохранить шаг"
      )
      return null
    } finally {
      planItemSaveInFlight.current = false
      setPlanItemSaving(null)
    }
  }

  function openReview() {
    const webApp = getTelegramWebApp()
    if (webApp?.isVersionAtLeast("8.0")) webApp.requestFullscreen?.()
    setScreen("review")
  }

  async function switchProgram(programId: string) {
    setProgramError(null)
    try {
      const response = await telegramFetch("/api/programs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programId }),
      })
      const payload = (await response.json()) as {
        error?: { message?: string }
      }
      if (!response.ok) {
        throw new Error(
          payload.error?.message ?? "Не удалось сменить программу"
        )
      }
      await openSettings()
    } catch (error) {
      setProgramError(
        error instanceof Error ? error.message : "Не удалось сменить программу"
      )
    }
  }

  function promptAddToHomeScreen() {
    setHomeScreenPrompted(true)
    window.localStorage.setItem("okey-english:home-screen-prompted", "1")
    setTelegramCloudFlag("home_screen_prompted", "1")
    const webApp = getTelegramWebApp()
    if (webApp?.isVersionAtLeast("8.0")) webApp.addToHomeScreen?.()
  }

  async function logoutFromWeb() {
    await fetch("/api/auth/web/session", {
      method: "DELETE",
      cache: "no-store",
    }).catch(() => undefined)
    setWebSessionUser(null)
    setAuthMode("anonymous")
    setScreen("welcome")
  }

  if (authMode === "checking") {
    return (
      <CatchEnglishShell>
        <div className="grid min-h-dvh place-items-center px-6 text-center">
          <div>
            <div className="mx-auto grid size-12 place-items-center">
              <BrandMark size={48} />
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Открываем Catch English…
            </p>
          </div>
        </div>
      </CatchEnglishShell>
    )
  }

  if (authMode === "anonymous") {
    return <CatchEnglishLanding authError={browserAuthError} />
  }

  if (screen === "welcome") {
    return (
      <CatchEnglishShell>
        <div className="mx-auto flex min-h-dvh w-full max-w-[1280px] flex-col px-6 pb-[calc(24px+var(--app-safe-bottom))] lg:px-12 lg:pb-10">
          <div className="flex items-center gap-2 pt-[calc(28px+var(--app-safe-top))] text-sm font-semibold tracking-tight lg:pt-[calc(40px+var(--app-safe-top))] lg:text-base">
            <BrandMark size={28} />
            Catch English
          </div>
          <div className="grid flex-1 items-center gap-10 py-10 lg:grid-cols-[minmax(0,0.92fr)_minmax(460px,1.08fr)] lg:gap-20 lg:py-16">
            <div className="order-2 lg:order-1">
              <p className="mb-3 text-sm font-medium text-muted-foreground lg:text-base">
                Английский через то, что интересно
              </p>
              <h1 className="max-w-2xl text-[38px] leading-[1.08] font-semibold tracking-[-0.035em] text-balance sm:text-[48px] lg:text-[68px]">
                Смотри. Замечай. Запоминай.
              </h1>
              <p className="mt-5 max-w-xl text-[16px] leading-6 text-pretty text-muted-foreground lg:mt-7 lg:text-lg lg:leading-7">
                Короткий план на каждый день: видео, полезные фразы и вопросы. В
                своём темпе, с понятной следующей задачей.
              </p>
              <div className="mt-8 lg:mt-10 lg:flex lg:items-center lg:gap-5">
                <Button
                  size="lg"
                  className="h-14 w-full rounded-2xl px-7 text-base lg:w-auto lg:min-w-64"
                  onClick={startTest}
                >
                  Настроить мой план <Icon icon={ArrowRight01Icon} />
                </Button>
                <p className="mt-3 text-center text-xs text-muted-foreground lg:mt-0 lg:text-left">
                  Около 2 минут
                </p>
              </div>
            </div>
            <div className="order-1 flex min-h-52 items-end justify-center overflow-hidden rounded-[28px] bg-[#ece9df] px-8 pt-10 lg:order-2 lg:min-h-[480px] lg:rounded-[38px] lg:px-14 lg:pt-20 dark:bg-[#262824]">
              <div className="relative mb-[-34px] h-48 w-full max-w-md rounded-[28px] border border-black/10 bg-[#fcfbf6] p-6 shadow-2xl lg:mb-[-50px] lg:h-[360px] lg:max-w-lg lg:rounded-[34px] lg:p-10 dark:bg-[#181a17]">
                <div className="mb-3 h-2 w-16 rounded-full bg-black/15 lg:mb-8 lg:h-2.5 lg:w-24" />
                <div className="text-2xl font-semibold tracking-tight lg:text-[42px]">
                  figure it out
                </div>
                <div className="mt-6 h-px bg-black/10 lg:mt-12" />
                <div className="mt-4 flex gap-2 lg:mt-8 lg:gap-3">
                  <span className="h-7 w-14 rounded-full bg-[#dfc5bd] lg:h-11 lg:w-24" />
                  <span className="h-7 w-14 rounded-full bg-[#e4d7a9] lg:h-11 lg:w-24" />
                  <span className="h-7 w-14 rounded-full bg-[#bdd7c4] lg:h-11 lg:w-24" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </CatchEnglishShell>
    )
  }

  if (screen === "test") {
    const current = questions[question]
    return (
      <CatchEnglishShell>
        <TopBar onBack={() => setScreen("welcome")} title="Уровень" />
        <div className="mx-auto flex min-h-[calc(100dvh-64px)] w-full max-w-[760px] flex-col px-5 pb-6 lg:min-h-[calc(100dvh-76px)] lg:px-10 lg:pb-10">
          <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground">
            <span>
              {questionNumber + 1} из {testLength}
            </span>
            <span>Адаптивный тест</span>
          </div>
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-foreground transition-all"
              style={{ width: `${((questionNumber + 1) / testLength) * 100}%` }}
            />
          </div>
          <div className="flex flex-1 flex-col justify-center py-10 lg:py-14">
            <p className="mb-4 text-sm text-muted-foreground">
              Что означает выделенное выражение?
            </p>
            <h1 className="text-[30px] leading-[1.25] font-medium tracking-tight lg:text-[42px]">
              {current.phrase.split(current.word)[0]}
              <span className="rounded-md bg-[#f0e7b8] px-1.5 py-0.5 text-[#332d13]">
                {current.word}
              </span>
              {current.phrase.split(current.word)[1]}
            </h1>
            <div className="mt-10 space-y-3 lg:mt-12">
              {current.answers.map((option, index) => {
                const isSelected = selectedAnswer === index
                const isCorrect =
                  selectedAnswer !== null && index === current.correct
                return (
                  <button
                    key={option}
                    onClick={() => answer(index)}
                    className={cn(
                      "flex min-h-14 w-full items-center justify-between rounded-2xl border bg-card px-4 text-left text-[15px] font-medium transition-all active:scale-[0.99]",
                      isCorrect &&
                        "border-[#75a785] bg-[#e7f3e9] text-[#173d22] dark:bg-[#193222] dark:text-[#d5f2dd]",
                      isSelected &&
                        !isCorrect &&
                        "border-destructive/40 bg-destructive/5"
                    )}
                  >
                    <span>{option}</span>
                    {isCorrect && <Icon icon={Tick02Icon} size={18} />}
                  </button>
                )
              })}
              <button
                onClick={() => answer("unknown")}
                className={cn(
                  "min-h-12 w-full rounded-2xl px-4 text-center text-sm font-medium text-muted-foreground transition-colors hover:bg-muted",
                  selectedAnswer === "unknown" && "bg-muted text-foreground"
                )}
              >
                Я не знаю
              </button>
            </div>
          </div>
          <p className="text-center text-xs leading-5 text-muted-foreground">
            Если ответ не получается, сложность следующего вопроса снизится.
          </p>
        </div>
      </CatchEnglishShell>
    )
  }

  if (screen === "result") {
    return (
      <CatchEnglishShell>
        <div className="mx-auto flex min-h-dvh w-full max-w-[760px] flex-col px-6 pt-[var(--app-safe-top)] pb-[calc(24px+var(--app-safe-bottom))] lg:px-10 lg:py-10">
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <div className="mb-8 grid size-24 place-items-center rounded-full bg-[#e6efe4] text-[#466a4a] dark:bg-[#1d3021] dark:text-[#a9caaa]">
              <Icon icon={Video01Icon} size={38} />
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              Подбор готов
            </p>
            <h1 className="mt-2 max-w-xl text-[32px] leading-[1.12] font-semibold tracking-tight lg:text-[44px]">
              Начнём с видео, где тебе знакомо примерно 75–85% слов
            </h1>
            <p className="mt-4 max-w-xs text-[15px] leading-6 text-muted-foreground">
              Так смысл уже понятен, а новые фразы можно заметить из контекста.
            </p>
            <div className="mt-8 w-full rounded-2xl bg-muted/70 p-4 text-left lg:p-5">
              <div className="flex items-center gap-3">
                <div className="grid size-9 place-items-center rounded-xl bg-background">
                  <Icon icon={Video01Icon} size={18} />
                </div>
                <div>
                  <p className="text-sm font-medium">Первая рекомендация</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {placementProgram
                      ? `${placementProgram} · подходит по уровню и покрытию`
                      : placementError
                        ? "Не удалось сохранить подбор"
                        : "Подбираем по уровню и покрытию…"}
                  </p>
                </div>
              </div>
            </div>
          </div>
          <Button
            size="lg"
            className="h-14 w-full rounded-2xl text-base"
            disabled={placementSaving || Boolean(placementError)}
            onClick={() => setScreen("reminder")}
          >
            {placementSaving ? "Сохраняем…" : "Продолжить"}{" "}
            <Icon icon={ArrowRight01Icon} />
          </Button>
          {placementError && placementResultLevel && (
            <button
              type="button"
              className="mt-3 text-sm font-semibold text-destructive"
              onClick={() => void savePlacementResult(placementResultLevel)}
            >
              Повторить сохранение
            </button>
          )}
        </div>
      </CatchEnglishShell>
    )
  }

  if (screen === "reminder") {
    return (
      <CatchEnglishShell>
        <TopBar onBack={() => setScreen("result")} />
        <div className="mx-auto flex min-h-[calc(100dvh-64px-var(--app-safe-top))] w-full max-w-[920px] flex-col px-5 pb-[calc(20px+var(--app-safe-bottom))] lg:min-h-[calc(100dvh-76px-var(--app-safe-top))] lg:px-10 lg:pb-10">
          <div className="pt-4">
            <div className="mb-6 grid size-12 place-items-center rounded-2xl bg-muted">
              <Icon icon={Notification01Icon} size={23} />
            </div>
            <h1 className="text-[30px] leading-tight font-semibold tracking-tight lg:text-[42px]">
              Когда тебе удобно?
            </h1>
            <p className="mt-3 max-w-xs text-sm leading-5 text-muted-foreground">
              Пришлём одно короткое напоминание. Без давления и повторов.
            </p>
          </div>
          <div className="mt-7 grid flex-1 grid-cols-2 content-start gap-3 lg:grid-cols-4">
            {reminderOptions.map((option) => (
              <button
                key={option.time}
                onClick={() => setReminder(option.time)}
                className={cn(
                  "min-h-28 rounded-2xl border p-4 text-left transition-all",
                  reminder === option.time
                    ? "border-foreground bg-foreground text-background ring-1 ring-foreground"
                    : "bg-card"
                )}
              >
                <span className="block text-xl font-semibold tabular-nums">
                  {option.time}
                </span>
                <span className="mt-3 block text-sm font-medium">
                  {option.label}
                </span>
                <span
                  className={cn(
                    "mt-1 block text-[11px]",
                    reminder === option.time
                      ? "text-background/60"
                      : "text-muted-foreground"
                  )}
                >
                  {option.hint}
                </span>
              </button>
            ))}
          </div>
          <label className="mt-3 mb-5 flex h-14 items-center justify-between rounded-2xl border bg-card px-4">
            <span className="flex items-center gap-2.5 text-sm font-medium">
              <Icon icon={Clock01Icon} size={18} /> Другое время
            </span>
            <input
              aria-label="Другое время напоминания"
              type="time"
              value={reminder}
              onChange={(event) => setReminder(event.target.value)}
              className="rounded-xl bg-muted px-3 py-2 text-sm font-semibold tabular-nums outline-none"
            />
          </label>
          <Button
            size="lg"
            className="h-14 w-full rounded-2xl text-base"
            disabled={reminderSaving}
            onClick={() => void saveReminderPreference(reminder, true)}
          >
            Готово <Icon icon={Tick02Icon} />
          </Button>
          <button
            disabled={reminderSaving}
            className="mt-4 text-sm text-muted-foreground"
            onClick={() => void saveReminderPreference(null, true)}
          >
            Без напоминания
          </button>
          {reminderError && (
            <p className="mt-3 text-center text-xs text-destructive">
              {reminderError}
            </p>
          )}
        </div>
      </CatchEnglishShell>
    )
  }

  if (screen === "phrases") {
    return <MyPhrasesScreen />
  }

  if (screen === "watch") {
    return <WatchCatalogScreen />
  }

  if (screen === "settings") {
    return (
      <div className="min-h-dvh w-full max-w-[1440px] px-5 pt-[calc(28px+var(--app-safe-top))] pb-[calc(24px+var(--app-safe-bottom))] sm:px-8 lg:px-10 lg:pt-[calc(44px+var(--app-safe-top))] lg:pb-12">
        <h1 className="text-[34px] leading-none font-semibold tracking-[-0.045em] sm:text-[46px]">
          Настройки
        </h1>

        <h2 className="mt-9 text-sm font-semibold">Программа</h2>

        <div className="mt-7 grid gap-3 md:grid-cols-2">
          {programSettings?.map((program, index) => {
            const canSelect =
              Boolean(program.id) &&
              program.isUnlocked &&
              !program.isActive &&
              !program.isPending
            return (
              <button
                key={program.slug}
                disabled={!canSelect}
                onClick={() => {
                  if (program.id) void switchProgram(program.id)
                }}
                className={cn(
                  "flex w-full items-center gap-4 rounded-[22px] border bg-card p-3 text-left",
                  program.isActive &&
                    "border-foreground ring-1 ring-foreground",
                  program.isPending && "border-[#6f9474] ring-1 ring-[#6f9474]",
                  !program.isUnlocked && "opacity-65"
                )}
              >
                <div
                  className={cn(
                    "grid size-[70px] shrink-0 place-items-center rounded-2xl text-lg font-bold tracking-tighter text-white",
                    index === 0
                      ? "bg-[#c69b62]"
                      : index === 1
                        ? "bg-[#8f7f78]"
                        : "bg-[#6f8b6d]"
                  )}
                >
                  {program.title
                    .split(" ")
                    .map((word) => word[0])
                    .join("")
                    .slice(0, 2)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-semibold">{program.title}</h2>
                    <span className="rounded-full bg-muted px-2 py-1 text-[11px]">
                      {program.level}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {program.description}
                  </p>
                  <p className="mt-2 text-[11px] font-medium text-muted-foreground">
                    {program.isPending
                      ? `Выбрана на завтра · ${program.coverage ?? "—"}% знакомых слов`
                      : program.isActive
                        ? `Текущая программа · ${program.coverage ?? "—"}% знакомых слов`
                        : program.isUnlocked
                          ? `${program.coverage}% знакомых слов · можно переключиться`
                          : program.hasContent
                            ? `${program.coverage}% знакомых слов · откроется при ${program.unlockCoverage}% покрытия`
                            : `Откроется при ~${program.unlockCoverage}% покрытия · выпуски готовятся`}
                  </p>
                </div>
              </button>
            )
          })}
          {!programSettings && !programError && (
            <div className="rounded-2xl bg-muted/70 p-5 text-sm text-muted-foreground">
              Считаем покрытие программ…
            </div>
          )}
        </div>

        {programError && (
          <div className="mt-4 rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
            {programError}
          </div>
        )}

        <section className="mt-8 rounded-[22px] border bg-card p-4">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-muted">
              <Icon icon={Notification01Icon} size={19} />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Напоминание</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Одно сообщение в выбранное время
              </p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <input
              aria-label="Время напоминания"
              type="time"
              value={reminder}
              onChange={(event) => setReminder(event.target.value)}
              className="h-11 flex-1 rounded-xl bg-muted px-3 text-sm font-semibold tabular-nums outline-none"
            />
            <Button
              type="button"
              disabled={reminderSaving}
              onClick={() => void saveReminderPreference(reminder)}
              className="h-11 rounded-xl px-4"
            >
              {reminderEnabled ? "Сохранить" : "Включить"}
            </Button>
          </div>
          {reminderEnabled && (
            <button
              type="button"
              disabled={reminderSaving}
              onClick={() => void saveReminderPreference(null)}
              className="mt-3 text-xs font-medium text-muted-foreground"
            >
              Выключить напоминание
            </button>
          )}
          {reminderError && (
            <p className="mt-3 text-xs text-destructive">{reminderError}</p>
          )}
        </section>

        <section className="mt-4 rounded-[22px] border bg-card p-4 text-sm">
          <h2 className="font-semibold">О каталоге</h2>
          <p className="mt-2 leading-6 text-muted-foreground">
            This product uses the TMDB API but is not endorsed or certified by
            TMDB.
          </p>
          <a
            href="mailto:admin@dakhe.ru"
            className="mt-3 inline-block font-semibold"
          >
            admin@dakhe.ru
          </a>
        </section>

        <p className="mt-6 px-2 text-center text-[11px] leading-4 text-muted-foreground/70">
          Тексты учебных диалогов и ответов обрабатываются OpenAI и могут
          использоваться для улучшения моделей. Данные профиля Telegram и сами
          голосовые записи туда не передаются.
        </p>
        {authMode === "web" && (
          <button
            type="button"
            onClick={() => void logoutFromWeb()}
            className="mt-5 w-full rounded-2xl border bg-card px-4 py-3 text-sm font-semibold text-muted-foreground"
          >
            Выйти из аккаунта
          </button>
        )}
      </div>
    )
  }

  if (screen === "interview") {
    return (
      <div className="flex h-dvh w-full flex-col overflow-hidden">
        <header className="mx-auto flex w-full max-w-[1120px] shrink-0 items-center gap-4 px-5 pt-[calc(var(--app-page-top)+var(--app-safe-top))] pb-5 sm:px-8 lg:px-10 lg:pt-[calc(32px+var(--app-safe-top))]">
          {!nativeBackAvailable && (
            <button
              type="button"
              onClick={leaveInterview}
              aria-label="Назад"
              className="grid size-10 shrink-0 place-items-center rounded-2xl border bg-card transition-colors hover:bg-muted"
            >
              <Icon icon={ArrowLeft01Icon} />
            </button>
          )}
          <h1 className="min-w-0 flex-1 text-[26px] font-semibold tracking-[-0.035em] sm:text-[32px]">
            Обсуждение
          </h1>
          <span className="shrink-0 text-sm font-semibold text-muted-foreground">
            {interviewCompleted ? 3 : Math.min(interviewAnswers + 1, 3)} из 3
          </span>
        </header>
        <div className="relative mx-auto flex min-h-0 w-full max-w-[920px] flex-1 flex-col px-5 sm:px-8 lg:px-10">
          <div
            ref={interviewScroll}
            className="min-h-0 flex-1 overflow-y-auto pt-8 pb-5 lg:pt-10 lg:pb-8"
            aria-live="polite"
          >
            <div className="space-y-5">
              {interviewMessages.map((message) =>
                message.role === "correction" ? (
                  <div
                    key={message.id}
                    className="mr-auto flex max-w-[90%] items-start gap-3 pl-12"
                  >
                    <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-xl bg-[#f1e9d4] text-[#7a6630] dark:bg-[#352f20] dark:text-[#d6c17c]">
                      <Icon icon={Edit02Icon} size={14} />
                    </span>
                    <div className="rounded-r-2xl border-l-2 border-[#d8c276] bg-muted/65 px-3 py-2 text-sm leading-6 text-muted-foreground">
                      {cleanLegacyInterviewText(message.text)}
                    </div>
                  </div>
                ) : (
                  <div
                    key={message.id}
                    className={cn(
                      "flex max-w-[90%] animate-in items-start gap-3 duration-200 fade-in slide-in-from-bottom-1",
                      message.role === "user"
                        ? "ml-auto flex-row-reverse"
                        : "mr-auto"
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-9 shrink-0 place-items-center rounded-2xl",
                        message.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-[#e3ece4] text-[#4e7455] dark:bg-[#223127] dark:text-[#a8c8ae]"
                      )}
                    >
                      <Icon
                        icon={message.role === "user" ? Mic02Icon : Chat01Icon}
                        size={17}
                      />
                    </span>
                    <div
                      className={cn(
                        "rounded-[20px] px-4 py-3 text-sm leading-6 shadow-sm transition-opacity",
                        message.role === "user"
                          ? "rounded-tr-md bg-primary text-primary-foreground"
                          : "rounded-tl-md border bg-card",
                        message.delivery === "sending" && "opacity-75"
                      )}
                    >
                      {message.role === "assistant" &&
                      message.questionWords?.length &&
                      message.helpToken &&
                      todayData?.episode.id ? (
                        <TappableQuestion
                          text={cleanLegacyInterviewText(message.text)}
                          words={message.questionWords}
                          onHelp={(word) =>
                            requestInterviewWordHelp({
                              episodeId: todayData.episode.id,
                              sessionToken: message.helpToken!,
                              word,
                            })
                          }
                        />
                      ) : (
                        cleanLegacyInterviewText(message.text)
                      )}
                    </div>
                    <div className="sr-only" aria-live="polite">
                      {message.role === "user" && message.delivery === "sending"
                        ? "Отправляем"
                        : ""}
                    </div>
                    {message.role === "user" &&
                      message.delivery === "failed" && (
                        <button
                          type="button"
                          disabled={interviewLoading}
                          title={message.error}
                          onClick={() =>
                            void sendInterviewAnswer(message.text, message.id)
                          }
                          className="self-end text-[11px] font-semibold text-destructive disabled:opacity-50"
                        >
                          Повторить отправку
                        </button>
                      )}
                  </div>
                )
              )}

              {interviewLoading && (
                <div
                  className="mr-auto flex animate-in items-center gap-1.5 rounded-[20px] border bg-card px-4 py-3 text-sm text-muted-foreground shadow-sm duration-200 fade-in slide-in-from-bottom-1"
                  aria-label={
                    interviewMessages.length === 0
                      ? "Готовим первый вопрос"
                      : "Собеседник печатает"
                  }
                >
                  {interviewMessages.length === 0 && (
                    <span className="mr-1">Готовим вопрос</span>
                  )}
                  {[0, 1, 2].map((dot) => (
                    <span
                      key={dot}
                      className="size-1.5 animate-bounce rounded-full bg-current"
                      style={{ animationDelay: `${dot * 120}ms` }}
                    />
                  ))}
                </div>
              )}
            </div>

            {interviewError && (
              <div className="mt-4 rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
                <p>{interviewError}</p>
                {!interviewToken && (
                  <button
                    className="mt-2 font-semibold"
                    onClick={() => void openInterview()}
                  >
                    Попробовать снова
                  </button>
                )}
              </div>
            )}
          </div>
          <div
            className="pointer-events-none absolute inset-x-5 top-0 z-10 h-8 bg-linear-to-b from-background via-background/90 to-transparent sm:inset-x-8 lg:inset-x-10 lg:h-10"
            aria-hidden="true"
          />

          {interviewToken ? (
            <form
              className="shrink-0 bg-background/92 py-4 pb-[calc(16px+var(--app-safe-bottom))] backdrop-blur-xl lg:py-6"
              onSubmit={(event) => {
                event.preventDefault()
                void sendInterviewAnswer()
              }}
            >
              {voicePhase !== "idle" && (
                <div
                  className="mb-2 flex h-7 items-center gap-2 px-1 text-xs text-muted-foreground"
                  aria-live="polite"
                >
                  {voicePhase === "recording" ? (
                    <>
                      <span className="size-2 animate-pulse rounded-full bg-red-500" />
                      Запись · {Math.floor(recordingSeconds / 60)}:
                      {String(recordingSeconds % 60).padStart(2, "0")}
                    </>
                  ) : (
                    <>
                      <span className="size-2 animate-pulse rounded-full bg-muted-foreground" />
                      Распознаём ответ…
                    </>
                  )}
                </div>
              )}
              <div className="flex items-end gap-2">
                <AutoResizeTextarea
                  aria-label="Ответ на английском"
                  maxLength={600}
                  maxHeight={176}
                  value={interviewDraft}
                  disabled={interviewLoading || voicePhase === "transcribing"}
                  onChange={(event) => setInterviewDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault()
                      event.currentTarget.form?.requestSubmit()
                    }
                  }}
                  placeholder={
                    interviewCompleted
                      ? "Продолжить по теме видео"
                      : "Напиши ответ по-английски"
                  }
                  className="min-h-14 min-w-0 flex-1 rounded-[20px] border bg-card px-4 py-4 text-sm shadow-sm outline-none focus:border-foreground"
                />
                {voiceAvailable && (
                  <Button
                    type="button"
                    variant={
                      voicePhase === "recording" ? "destructive" : "secondary"
                    }
                    size="icon"
                    aria-label={
                      voicePhase === "recording"
                        ? "Остановить запись"
                        : "Ответить голосом"
                    }
                    aria-pressed={voicePhase === "recording"}
                    disabled={interviewLoading || voicePhase === "transcribing"}
                    onClick={() => {
                      if (voicePhase === "recording") stopVoiceRecording()
                      else void startVoiceRecording()
                    }}
                    className="size-14 shrink-0 rounded-[20px]"
                  >
                    <Icon
                      icon={voicePhase === "recording" ? StopIcon : Mic02Icon}
                    />
                  </Button>
                )}
                <Button
                  type="submit"
                  size="icon"
                  aria-label="Отправить ответ"
                  disabled={
                    !interviewDraft.trim() ||
                    interviewLoading ||
                    voicePhase !== "idle"
                  }
                  className="size-14 shrink-0 rounded-[20px]"
                >
                  <Icon icon={ArrowRight01Icon} />
                </Button>
              </div>
              {voiceTranscriptionError &&
                pendingVoiceRecording &&
                voiceAvailable && (
                  <div
                    className="mt-2 flex min-h-8 items-center justify-between gap-3 px-1 text-xs text-muted-foreground"
                    aria-live="polite"
                  >
                    <span>{voiceTranscriptionError}</span>
                    <button
                      type="button"
                      className="shrink-0 font-semibold text-foreground disabled:opacity-50"
                      disabled={
                        interviewLoading || voicePhase === "transcribing"
                      }
                      onClick={() =>
                        void transcribeVoiceRecording(pendingVoiceRecording)
                      }
                    >
                      Повторить
                    </button>
                  </div>
                )}
              {interviewCompleted &&
                dismissedTodayReturnPlanId !== todayData?.plan.id && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="mt-2 h-11 w-full rounded-2xl"
                    onClick={leaveCompletedInterview}
                  >
                    К экрану «Сегодня»
                  </Button>
                )}
            </form>
          ) : null}
        </div>
      </div>
    )
  }

  if (screen === "video") {
    const episode = todayData?.episode
    return (
      <div className="min-h-dvh w-full">
        <header className="mx-auto flex w-full max-w-[1200px] items-center gap-4 px-5 pt-[calc(20px+var(--app-safe-top))] pb-5 sm:px-8 lg:px-10 lg:pt-[calc(32px+var(--app-safe-top))] lg:pb-7">
          <button
            type="button"
            onClick={() => setScreen("today")}
            aria-label="Назад"
            className="grid size-10 shrink-0 place-items-center rounded-2xl border bg-card transition-colors hover:bg-muted"
          >
            <Icon icon={ArrowLeft01Icon} />
          </button>
          <h1 className="text-[26px] font-semibold tracking-[-0.035em] sm:text-[32px]">
            Сегодняшнее видео
          </h1>
        </header>
        <div className="mx-auto flex w-full max-w-[1200px] flex-col px-5 pb-[calc(24px+var(--app-safe-bottom))] sm:px-8 lg:px-10 lg:pb-10">
          {episode ? (
            <>
              <div className="aspect-video overflow-hidden rounded-[24px] bg-black shadow-[0_18px_60px_rgba(0,0,0,0.16)] lg:rounded-[32px]">
                <iframe
                  className="size-full"
                  src={`https://www.youtube-nocookie.com/embed/${episode.youtubeId}?playsinline=1&rel=0`}
                  title={episode.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              </div>
              <div className="grid gap-5 pt-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:pt-8">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">
                    {episode.programTitle} · {episode.durationMinutes} минут
                  </p>
                  <h2 className="mt-2 max-w-3xl text-[25px] leading-tight font-semibold tracking-[-0.035em] lg:text-[36px]">
                    {episode.title}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => openYoutube(episode.youtubeUrl)}
                  className="inline-flex h-11 w-fit items-center gap-2 rounded-2xl border bg-card px-4 text-sm font-semibold transition-colors hover:bg-muted"
                >
                  Открыть в YouTube
                  <Icon icon={ArrowRight01Icon} size={16} />
                </button>
              </div>
              {todayError && (
                <p className="mt-4 text-center text-sm text-destructive">
                  {todayError}
                </p>
              )}
              <Button
                size="lg"
                className="mt-8 h-14 w-full rounded-[20px] text-base lg:ml-auto lg:w-auto lg:min-w-72"
                disabled={planItemSaving === "watch"}
                onClick={
                  videoDone
                    ? () => setScreen("today")
                    : () => void markVideoDone()
                }
              >
                {videoDone ? (
                  <>
                    Вернуться к плану <Icon icon={ArrowRight01Icon} />
                  </>
                ) : (
                  <>
                    {planItemSaving === "watch"
                      ? "Сохраняем…"
                      : "Я посмотрел — дальше"}{" "}
                    <Icon icon={Tick02Icon} />
                  </>
                )}
              </Button>
            </>
          ) : (
            <div className="grid flex-1 place-items-center text-center text-sm text-muted-foreground">
              Видео пока не загрузилось
            </div>
          )}
        </div>
      </div>
    )
  }

  if (screen === "review") {
    const reviewQueue = todayData?.queue.cards ?? []
    const reviewedBeforeSession =
      todayData?.queue.reviewStep?.reviewedCount ?? 0
    const assignedCardTotal =
      todayData?.queue.reviewStep?.assignedCount ?? reviewQueue.length
    const activeCardIndex = normalizeReviewQueueIndex(
      cardIndex,
      reviewQueue.length
    )
    const card = reviewQueue[activeCardIndex]

    if (reviewCompletionPending) {
      return (
        <div className="min-h-dvh w-full">
          <header className="mx-auto flex w-full max-w-[920px] items-center gap-4 px-5 pt-[calc(20px+var(--app-safe-top))] sm:px-8 lg:px-10 lg:pt-[calc(32px+var(--app-safe-top))]">
            <button
              type="button"
              onClick={() => setScreen("today")}
              aria-label="Назад"
              className="grid size-10 place-items-center rounded-2xl border bg-card"
            >
              <Icon icon={ArrowLeft01Icon} />
            </button>
            <h1 className="text-[26px] font-semibold tracking-[-0.035em] sm:text-[32px]">
              Фразы
            </h1>
          </header>
          <div className="mx-auto grid min-h-[calc(100dvh-64px)] max-w-[760px] place-items-center px-6 text-center">
            <div className="max-w-xs">
              <p className="font-semibold">
                {planItemSaving === "review"
                  ? "Сохраняем повторение…"
                  : "Оценки сохранены на устройстве"}
              </p>
              <p className="mt-2 text-sm leading-5 text-muted-foreground">
                {planItemSaving === "review"
                  ? "Это займёт несколько секунд."
                  : (reviewCompletionError ??
                    "Не удалось подтвердить шаг на сервере. Можно повторить без повторной оценки карточек.")}
              </p>
              {planItemSaving !== "review" && (
                <Button
                  className="mt-5"
                  onClick={() => void finishReviewStep()}
                >
                  Повторить сохранение
                </Button>
              )}
            </div>
          </div>
        </div>
      )
    }

    if (!card) {
      return (
        <div className="min-h-dvh w-full">
          <header className="mx-auto flex w-full max-w-[920px] items-center gap-4 px-5 pt-[calc(20px+var(--app-safe-top))] sm:px-8 lg:px-10 lg:pt-[calc(32px+var(--app-safe-top))]">
            <button
              type="button"
              onClick={() => setScreen("today")}
              aria-label="Назад"
              className="grid size-10 place-items-center rounded-2xl border bg-card"
            >
              <Icon icon={ArrowLeft01Icon} />
            </button>
            <h1 className="text-[26px] font-semibold tracking-[-0.035em] sm:text-[32px]">
              Фразы
            </h1>
          </header>
          <div className="mx-auto grid min-h-[calc(100dvh-64px)] max-w-[760px] place-items-center px-6 text-center">
            <div>
              <p className="font-semibold">Карточек на сегодня нет</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Обнови план или вернись к видео.
              </p>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="min-h-dvh w-full">
        <header className="mx-auto flex w-full max-w-[920px] items-center gap-4 px-5 pt-[calc(20px+var(--app-safe-top))] pb-5 sm:px-8 lg:px-10 lg:pt-[calc(32px+var(--app-safe-top))] lg:pb-7">
          <button
            type="button"
            onClick={() => setScreen("today")}
            aria-label="Назад"
            className="grid size-10 shrink-0 place-items-center rounded-2xl border bg-card transition-colors hover:bg-muted"
          >
            <Icon icon={ArrowLeft01Icon} />
          </button>
          <h1 className="min-w-0 flex-1 text-[26px] font-semibold tracking-[-0.035em] sm:text-[32px]">
            Фразы
          </h1>
          <span className="text-sm font-semibold text-muted-foreground">
            {reviewedBeforeSession + activeCardIndex + 1} из {assignedCardTotal}
          </span>
        </header>
        <div className="mx-auto flex w-full max-w-[920px] flex-col px-5 pb-[calc(24px+var(--app-safe-bottom))] sm:px-8 lg:px-10 lg:pb-10">
          <div className="h-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-foreground transition-all"
              style={{
                width: `${((reviewedBeforeSession + activeCardIndex + 1) / Math.max(1, assignedCardTotal)) * 100}%`,
              }}
            />
          </div>
          <button
            onClick={() => setRevealed(true)}
            className="my-7 flex min-h-[410px] flex-col items-center justify-center rounded-[32px] border bg-card p-8 text-center shadow-[0_18px_60px_rgba(0,0,0,0.06)] transition-transform active:scale-[0.995] sm:min-h-[480px] sm:p-12"
          >
            <p className="text-[34px] leading-tight font-semibold tracking-[-0.035em] sm:text-[44px]">
              {card.phrase}
            </p>
            {revealed ? (
              <div className="mt-9 w-full animate-in duration-300 fade-in slide-in-from-bottom-2">
                <div className="mx-auto h-px w-12 bg-border" />
                <p className="mt-8 text-xl font-medium">{card.translationRu}</p>
                <p className="mx-auto mt-6 max-w-xl rounded-[20px] bg-muted/70 p-4 text-left text-sm leading-6 text-muted-foreground">
                  “{card.contextSentence}”
                </p>
              </div>
            ) : (
              <p className="mt-5 text-sm text-muted-foreground">
                Показать перевод
              </p>
            )}
          </button>
          {revealed ? (
            <div className="grid grid-cols-3 gap-2.5">
              <button
                onClick={() => rateCard("again")}
                className="h-14 rounded-2xl bg-[#f5e5e2] text-sm font-semibold text-[#8c3e35] dark:bg-[#3b211f] dark:text-[#efaaa1]"
              >
                Не вспомнил
              </button>
              <button
                onClick={() => rateCard("hard")}
                className="h-14 rounded-2xl bg-[#f4edcf] text-sm font-semibold text-[#7b671d] dark:bg-[#39331d] dark:text-[#e7d783]"
              >
                С трудом
              </button>
              <button
                onClick={() => rateCard("good")}
                className="h-14 rounded-2xl bg-[#dfeee2] text-sm font-semibold text-[#376f43] dark:bg-[#1d3523] dark:text-[#9fd2a8]"
              >
                Вспомнил
              </button>
            </div>
          ) : (
            <Button
              size="lg"
              className="h-14 rounded-2xl text-base"
              onClick={() => setRevealed(true)}
            >
              Показать ответ
            </Button>
          )}
          <button
            type="button"
            onClick={() => rateCard("known")}
            className="mt-3 h-10 rounded-xl text-sm font-medium text-muted-foreground"
          >
            Уже знаю — не повторять
          </button>
        </div>
      </div>
    )
  }

  if (screen === "complete") {
    const supportsHomeScreen = Boolean(
      getTelegramWebApp()?.isVersionAtLeast("8.0")
    )
    const strengthenedCardTotal =
      todayData?.queue.reviewStep?.status === "skipped" ? 0 : sessionCardTotal
    return (
      <CatchEnglishShell>
        <div className="mx-auto flex min-h-dvh w-full max-w-[760px] flex-col px-6 pt-[var(--app-safe-top)] pb-[calc(24px+var(--app-safe-bottom))] lg:px-10 lg:py-10">
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <div className="grid size-20 place-items-center rounded-full bg-[#e2eee3] text-[#3d7548] dark:bg-[#1c3422] dark:text-[#a0d0a8]">
              <Icon icon={CheckmarkCircle02Icon} size={38} />
            </div>
            <p className="mt-8 text-sm font-medium text-muted-foreground">
              План на сегодня выполнен
            </p>
            <h1 className="mt-2 text-[34px] font-semibold tracking-tight">
              На сегодня всё
            </h1>
            {strengthenedCardTotal > 0 && (
              <p className="mt-2 text-sm font-semibold text-muted-foreground">
                {strengthenedCardTotal}{" "}
                {pluralRu(
                  strengthenedCardTotal,
                  "фраза укреплена",
                  "фразы укреплены",
                  "фраз укреплено"
                )}
              </p>
            )}
            <p className="mt-4 max-w-xs text-[15px] leading-6 text-muted-foreground">
              Выпуск просмотрен, 3 ответа даны. Чат по видео доступен до конца
              дня.
            </p>
            <div className="mt-9 flex w-full divide-x rounded-2xl bg-muted/70 py-4">
              <div className="flex-1">
                <div className="text-lg font-semibold">
                  {(todayData?.episode.durationMinutes ?? 0) +
                    (todayData?.queue.estimatedMinutes ?? 0) +
                    5}{" "}
                  мин
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  сегодня
                </div>
              </div>
              <div className="flex-1">
                <div className="text-lg font-semibold">
                  {todayData?.comprehension.isReady
                    ? `${todayData.comprehension.percentage}%`
                    : "После калибровки"}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  знакомые слова в видео
                </div>
              </div>
            </div>
          </div>
          {supportsHomeScreen && !homeScreenPrompted && (
            <button
              onClick={promptAddToHomeScreen}
              className="mb-3 rounded-2xl border bg-card px-4 py-4 text-left"
            >
              <span className="block text-sm font-semibold">
                Добавить на главный экран
              </span>
              <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                Чтобы завтра открыть Catch English в одно касание. Больше не
                предложим.
              </span>
            </button>
          )}
          <MoreForToday />
          <div className="mt-4">
            <Button
              variant="ghost"
              size="lg"
              className="h-12 w-full rounded-2xl text-sm"
              onClick={() => setScreen("today")}
            >
              К экрану «Сегодня»
            </Button>
          </div>
        </div>
      </CatchEnglishShell>
    )
  }

  const allDone = videoDone && cardsDone && retellDone
  const completedCount = [videoDone, cardsDone, retellDone].filter(
    Boolean
  ).length
  const isPausedDay = todayData?.plan.status === "skipped"
  const extrasAvailable = allDone || isPausedDay
  const daySummary = isPausedDay
    ? {
        label: "Пауза",
        className: "bg-muted/70 text-muted-foreground",
      }
    : allDone
      ? {
          label: "Полный день",
          className:
            "bg-[#dceedd] text-[#245a31] dark:bg-[#1d3a24] dark:text-[#b8dfbf]",
        }
      : completedCount > 0
        ? {
            label: "Лёгкий день",
            className:
              "bg-[#eef5ef] text-[#607864] dark:bg-[#222d24] dark:text-[#aab9ad]",
          }
        : null
  const activeStep = !videoDone ? 0 : !cardsDone ? 1 : !retellDone ? 2 : -1
  const episode = todayData?.episode
  const reviewCount =
    todayData?.queue.cards.filter((card) => card.reps > 0).length ?? 0
  const newCount =
    todayData?.queue.cards.filter((card) => card.reps === 0).length ?? 0
  const cardCount = todayData?.queue.cards.length ?? 0
  const reviewWasSkipped = todayData?.queue.reviewStep?.status === "skipped"
  const legacyEmptyReview =
    todayData?.queue.reviewStep === undefined &&
    cardsDone &&
    cardCount === 0 &&
    sessionCardTotal === 0
  const totalMinutes =
    (episode?.durationMinutes ?? 0) +
    (todayData?.queue.estimatedMinutes ?? 0) +
    5
  return (
    <div className="mx-auto min-h-dvh w-full max-w-[1280px] px-5 pb-[calc(24px+var(--app-safe-bottom))] sm:px-8 lg:px-10 lg:pb-10">
      <header className="flex items-center justify-between pt-[calc(42px+var(--app-safe-top))] pb-5 lg:pt-[calc(54px+var(--app-safe-top))] lg:pb-8">
        <h1 className="text-[34px] leading-none font-semibold tracking-[-0.045em] sm:text-[46px]">
          Сегодня
        </h1>
        <Link
          href="/my/settings"
          aria-label="Настройки"
          className="grid size-9 place-items-center rounded-full transition-colors hover:bg-muted"
        >
          <Icon icon={Settings01Icon} />
        </Link>
      </header>

      <section className="mb-5 rounded-2xl bg-muted/70 p-4 lg:mb-8 lg:p-6">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">
            Следующее видео
          </span>
          <span className="text-xs font-semibold">
            {todayData?.comprehension.isReady
              ? `${todayData.comprehension.percentage}% знакомых слов`
              : "Калибруем"}
          </span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-background">
          <div
            className="h-full rounded-full bg-[#6f9474] transition-all"
            style={{
              width: todayData?.comprehension.isReady
                ? `${todayData.comprehension.percentage}%`
                : "12%",
            }}
          />
        </div>
      </section>

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Твой план</h2>
        {completedCount > 0 && (
          <span className="text-xs text-muted-foreground">
            {completedCount} из 3
          </span>
        )}
      </div>
      <div className="grid gap-3 lg:grid-cols-3 lg:gap-4">
        <TaskCard
          icon={PlayIcon}
          title="Посмотреть выпуск"
          meta={
            videoDone
              ? "Выпуск просмотрен"
              : episode
                ? `${episode.programTitle} · ${episode.title} · ${episode.durationMinutes} минут`
                : "Загружаем выпуск…"
          }
          done={videoDone}
          active={activeStep === 0}
          onClick={() => {
            if (episode) setScreen("video")
          }}
          accent="bg-[#e9e2d0] text-[#75653b] dark:bg-[#332f24] dark:text-[#ddcc98]"
          action={videoDone ? "Пересмотреть" : "Открыть"}
          showActionWhenDone
          quietActionWhenDone
        />
        <TaskCard
          icon={Cards01Icon}
          title="Повторить фразы"
          meta={
            reviewWasSkipped || legacyEmptyReview
              ? "На сегодня карточек нет"
              : cardsDone
                ? sessionCardTotal > 0
                  ? `${sessionCardTotal} ${pluralRu(sessionCardTotal, "фраза повторена", "фразы повторены", "фраз повторено")}`
                  : "Повторение завершено"
                : todayLoading
                  ? "Собираем очередь…"
                  : cardCount > 0
                    ? `${reviewCount} ${pluralRu(reviewCount, "повторение", "повторения", "повторений")} + ${newCount} ${pluralRu(newCount, "новая", "новые", "новых")} · ~${todayData?.queue.estimatedMinutes ?? 1} мин`
                    : "На сегодня карточек нет"
          }
          done={cardsDone}
          skipped={reviewWasSkipped || legacyEmptyReview}
          active={activeStep === 1}
          onClick={() => {
            if (cardCount > 0) openReview()
          }}
          accent="bg-[#dfe9df] text-[#4f7455] dark:bg-[#243127] dark:text-[#a9c6ad]"
          action="Начать повторение"
        />
        <TaskCard
          icon={Chat01Icon}
          title="Обсудить видео"
          meta={
            retellDone
              ? "3 ответа даны · разговор доступен до конца дня"
              : "Ответь на 3 вопроса о видео · ~5 минут"
          }
          done={retellDone}
          active={activeStep === 2}
          onClick={() => void openInterview()}
          accent="bg-[#e4e2eb] text-[#65617a] dark:bg-[#2d2b36] dark:text-[#bbb6d2]"
          action={retellDone ? "Продолжить" : "Начать"}
          showActionWhenDone
        />
      </div>

      {todayError && (
        <div className="mt-4 rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
          <p>{todayError}</p>
          <button
            className="mt-2 font-semibold"
            onClick={() => void openToday()}
          >
            Повторить
          </button>
        </div>
      )}

      {daySummary && (
        <div
          className={cn(
            "mt-6 inline-flex min-h-10 items-center gap-2.5 rounded-full px-4 py-2.5",
            daySummary.className
          )}
        >
          {isPausedDay ? (
            <span className="size-2 rounded-full bg-current opacity-40" />
          ) : (
            <Icon icon={CheckmarkCircle02Icon} size={20} />
          )}
          <p className="text-sm font-semibold">{daySummary.label}</p>
        </div>
      )}
      {extrasAvailable ? (
        <MoreForToday />
      ) : (
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Мои фразы и каталог откроются после сегодняшнего плана.
        </p>
      )}
      <p className="mt-5 text-center text-xs text-muted-foreground">
        Сегодня около {totalMinutes || "…"} мин
      </p>
    </div>
  )
}

function TaskCard({
  icon,
  title,
  meta,
  done,
  active,
  onClick,
  secondaryAction,
  secondaryLabel,
  accent,
  action,
  showActionWhenDone = false,
  quietActionWhenDone = false,
  skipped = false,
}: {
  icon: typeof PlayIcon
  title: string
  meta: string
  done: boolean
  active: boolean
  onClick: () => void
  secondaryAction?: () => void
  secondaryLabel?: string
  accent: string
  action: string
  showActionWhenDone?: boolean
  quietActionWhenDone?: boolean
  skipped?: boolean
}) {
  return (
    <article
      className={cn(
        "group w-full rounded-[22px] border p-4 text-left transition-all",
        active &&
          "border-foreground bg-card shadow-[0_8px_30px_rgba(0,0,0,0.07)] ring-1 ring-foreground",
        !active && !done && !skipped && "border-border bg-card opacity-70",
        skipped && "border-border bg-card opacity-70",
        done &&
          !skipped &&
          (showActionWhenDone
            ? "border-border bg-card"
            : "border-border bg-card/80 opacity-75")
      )}
    >
      <div className="flex gap-3.5">
        <div
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-2xl",
            skipped
              ? "bg-muted text-muted-foreground"
              : done
                ? "bg-[#dfeee2] text-[#376f43] dark:bg-[#1d3523] dark:text-[#9fd2a8]"
                : accent
          )}
        >
          {done && !skipped ? <Icon icon={Tick02Icon} /> : <Icon icon={icon} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              {active && (
                <p className="text-[11px] font-semibold text-foreground">
                  СЕЙЧАС
                </p>
              )}
              <h3
                className={cn(
                  active ? "mt-1 font-semibold" : "font-semibold",
                  done && !skipped && "text-muted-foreground"
                )}
              >
                {title}
              </h3>
            </div>
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{meta}</p>
          {!skipped && (!done || showActionWhenDone) && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                onClick={onClick}
                className={cn(
                  "inline-flex items-center text-xs transition-colors",
                  quietActionWhenDone && done
                    ? "h-auto rounded-none p-0 font-medium text-muted-foreground hover:text-foreground"
                    : cn(
                        "h-9 gap-2 rounded-xl px-3 font-semibold",
                        active
                          ? "bg-foreground text-background"
                          : "border bg-background text-foreground"
                      )
                )}
              >
                {action}
                {!(quietActionWhenDone && done) && (
                  <Icon icon={ArrowRight01Icon} size={14} />
                )}
              </button>
              {secondaryAction && secondaryLabel && (
                <button
                  onClick={secondaryAction}
                  className="text-xs font-medium text-muted-foreground underline-offset-4 hover:underline"
                >
                  {secondaryLabel}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  )
}
