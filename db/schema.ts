import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const ingestionStatus = pgEnum("ingestion_status", [
  "pending",
  "processing",
  "ready",
  "failed",
])

export const planStatus = pgEnum("plan_status", [
  "not_started",
  "supporting",
  "complete",
  "skipped",
])

export const planItemType = pgEnum("plan_item_type", [
  "watch",
  "review",
  "retell",
])

export const lexemeSource = pgEnum("lexeme_source", [
  "oxford",
  "placement_test",
  "review",
  "manual",
])

export const authTokenKind = pgEnum("auth_token_kind", ["access", "refresh"])

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  telegramUserId: text("telegram_user_id").unique(),
  telegramOidcSubject: text("telegram_oidc_subject").unique(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  username: text("username"),
  languageCode: text("language_code"),
  isPremium: boolean("is_premium").notNull().default(false),
  addedToAttachmentMenu: boolean("added_to_attachment_menu")
    .notNull()
    .default(false),
  allowsWriteToPm: boolean("allows_write_to_pm").notNull().default(false),
  photoUrl: text("photo_url"),
  timezone: text("timezone").notNull().default("Europe/Moscow"),
  reminderTime: time("reminder_time"),
  levelEstimate: text("level_estimate"),
  onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const telegramAuthAttempts = pgTable(
  "telegram_auth_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    stateHash: text("state_hash").notNull(),
    oidcNonceHash: text("oidc_nonce_hash").notNull(),
    oidcCodeVerifier: text("oidc_code_verifier"),
    handoffCodeChallenge: text("handoff_code_challenge").notNull(),
    handoffCodeHash: text("handoff_code_hash"),
    platform: text("platform").notNull(),
    deviceId: text("device_id"),
    deviceName: text("device_name"),
    userId: uuid("user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    handoffExpiresAt: timestamp("handoff_expires_at", {
      withTimezone: true,
    }),
    callbackStartedAt: timestamp("callback_started_at", {
      withTimezone: true,
    }),
    callbackCompletedAt: timestamp("callback_completed_at", {
      withTimezone: true,
    }),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("telegram_auth_attempts_state_hash_unique").on(table.stateHash),
    uniqueIndex("telegram_auth_attempts_handoff_code_hash_unique").on(
      table.handoffCodeHash
    ),
    index("telegram_auth_attempts_expires_at_idx").on(table.expiresAt),
  ]
)

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    deviceId: text("device_id"),
    deviceName: text("device_name"),
    absoluteExpiresAt: timestamp("absolute_expires_at", {
      withTimezone: true,
    }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("auth_sessions_user_revoked_idx").on(table.userId, table.revokedAt),
    index("auth_sessions_absolute_expires_at_idx").on(table.absoluteExpiresAt),
  ]
)

export const authTokens = pgTable(
  "auth_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => authSessions.id, { onDelete: "cascade" }),
    kind: authTokenKind("kind").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("auth_tokens_session_kind_expires_at_idx").on(
      table.sessionId,
      table.kind,
      table.expiresAt
    ),
    index("auth_tokens_expires_at_idx").on(table.expiresAt),
  ]
)

export const authRateLimitBuckets = pgTable(
  "auth_rate_limit_buckets",
  {
    key: text("key").primaryKey(),
    requestCount: integer("request_count").notNull(),
    windowStartedAt: timestamp("window_started_at", {
      withTimezone: true,
    }).notNull(),
    windowExpiresAt: timestamp("window_expires_at", {
      withTimezone: true,
    }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("auth_rate_limit_buckets_expires_at_idx").on(table.windowExpiresAt),
  ]
)

export const programs = pgTable("programs", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  levelMin: text("level_min").notNull(),
  levelMax: text("level_max").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const episodes = pgTable(
  "episodes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    youtubeId: text("youtube_id").notNull().unique(),
    title: text("title").notNull(),
    sequenceNumber: integer("sequence_number").notNull(),
    durationSeconds: integer("duration_seconds").notNull(),
    transcriptLanguage: text("transcript_language").notNull().default("en"),
    ingestionStatus: ingestionStatus("ingestion_status")
      .notNull()
      .default("pending"),
    isActive: boolean("is_active").notNull().default(true),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("episodes_program_sequence_unique").on(
      table.programId,
      table.sequenceNumber
    ),
    index("episodes_program_idx").on(table.programId),
  ]
)

export const userProgramProgress = pgTable(
  "user_program_progress",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    programId: uuid("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    currentEpisodeId: uuid("current_episode_id").references(() => episodes.id),
    isActive: boolean("is_active").notNull().default(true),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("user_program_progress_user_program_unique").on(
      table.userId,
      table.programId
    ),
    index("user_program_progress_active_idx").on(table.userId, table.isActive),
  ]
)

export const pendingProgramSwitches = pgTable("pending_program_switches", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  programId: uuid("program_id")
    .notNull()
    .references(() => programs.id, { onDelete: "cascade" }),
  requestedAt: timestamp("requested_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
})

export const transcriptSegments = pgTable(
  "transcript_segments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    episodeId: uuid("episode_id")
      .notNull()
      .references(() => episodes.id, { onDelete: "cascade" }),
    segmentIndex: integer("segment_index").notNull(),
    offsetMs: integer("offset_ms").notNull(),
    durationMs: integer("duration_ms").notNull(),
    text: text("text").notNull(),
    normalizedText: text("normalized_text").notNull(),
  },
  (table) => [
    uniqueIndex("transcript_episode_segment_unique").on(
      table.episodeId,
      table.segmentIndex
    ),
    index("transcript_episode_idx").on(table.episodeId),
  ]
)

export const phrases = pgTable(
  "phrases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    episodeId: uuid("episode_id")
      .notNull()
      .references(() => episodes.id, { onDelete: "cascade" }),
    phrase: text("phrase").notNull(),
    normalizedPhrase: text("normalized_phrase").notNull(),
    lemma: text("lemma").notNull(),
    translationRu: text("translation_ru").notNull(),
    contextSentence: text("context_sentence").notNull(),
    cefr: text("cefr").notNull(),
    segmentIndex: integer("segment_index").notNull(),
    offsetMs: integer("offset_ms").notNull(),
    confidence: real("confidence").notNull(),
    rationale: text("rationale"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("phrases_episode_normalized_unique").on(
      table.episodeId,
      table.normalizedPhrase
    ),
    index("phrases_episode_idx").on(table.episodeId),
    index("phrases_lemma_idx").on(table.lemma),
  ]
)

export const episodeLexemes = pgTable(
  "episode_lexemes",
  {
    episodeId: uuid("episode_id")
      .notNull()
      .references(() => episodes.id, { onDelete: "cascade" }),
    lemma: text("lemma").notNull(),
    frequency: integer("frequency").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.episodeId, table.lemma] }),
    index("episode_lexemes_episode_idx").on(table.episodeId),
  ]
)

export const lexemes = pgTable("lexemes", {
  lemma: text("lemma").primaryKey(),
  cefr: text("cefr").notNull(),
  frequencyRank: integer("frequency_rank"),
  isOxford3000: boolean("is_oxford_3000").notNull().default(false),
})

export const userLexemes = pgTable(
  "user_lexemes",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lemma: text("lemma").notNull(),
    source: lexemeSource("source").notNull(),
    confidence: real("confidence").notNull().default(1),
    learnedAt: timestamp("learned_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.lemma] }),
    index("user_lexemes_user_idx").on(table.userId),
  ]
)

export const userCards = pgTable(
  "user_cards",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    phraseId: uuid("phrase_id")
      .notNull()
      .references(() => phrases.id, { onDelete: "cascade" }),
    due: timestamp("due", { withTimezone: true }).notNull(),
    stability: real("stability").notNull().default(0),
    difficulty: real("difficulty").notNull().default(0),
    scheduledDays: integer("scheduled_days").notNull().default(0),
    learningSteps: integer("learning_steps").notNull().default(0),
    reps: integer("reps").notNull().default(0),
    lapses: integer("lapses").notNull().default(0),
    state: integer("state").notNull().default(0),
    lastReview: timestamp("last_review", { withTimezone: true }),
    isSuspended: boolean("is_suspended").notNull().default(false),
    isPersonal: boolean("is_personal").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("user_cards_user_phrase_unique").on(
      table.userId,
      table.phraseId
    ),
    index("user_cards_due_idx").on(table.userId, table.due),
  ]
)

export const reviewLogs = pgTable(
  "review_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientEventId: uuid("client_event_id"),
    dailyPlanId: uuid("daily_plan_id").references(() => dailyPlans.id, {
      onDelete: "set null",
    }),
    userCardId: uuid("user_card_id")
      .notNull()
      .references(() => userCards.id, { onDelete: "cascade" }),
    rating: integer("rating").notNull(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    stateBefore: integer("state_before").notNull(),
    stateAfter: integer("state_after").notNull(),
    dueBefore: timestamp("due_before", { withTimezone: true }).notNull(),
    dueAfter: timestamp("due_after", { withTimezone: true }).notNull(),
    stabilityAfter: real("stability_after").notNull(),
    difficultyAfter: real("difficulty_after").notNull(),
    scheduledDaysAfter: integer("scheduled_days_after").notNull(),
  },
  (table) => [
    uniqueIndex("review_logs_client_event_unique").on(table.clientEventId),
    index("review_logs_card_reviewed_idx").on(
      table.userCardId,
      table.reviewedAt
    ),
    index("review_logs_plan_reviewed_idx").on(
      table.dailyPlanId,
      table.reviewedAt
    ),
  ]
)

export const interviewRequests = pgTable(
  "interview_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    episodeId: uuid("episode_id")
      .notNull()
      .references(() => episodes.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    requestDate: date("request_date").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("interview_requests_user_date_idx").on(
      table.userId,
      table.requestDate
    ),
    index("interview_requests_user_created_idx").on(
      table.userId,
      table.createdAt
    ),
  ]
)

export const dailyPlans = pgTable(
  "daily_plans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    planDate: date("plan_date").notNull(),
    status: planStatus("status").notNull().default("not_started"),
    episodeId: uuid("episode_id").references(() => episodes.id),
    returnGapDays: integer("return_gap_days").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("daily_plans_user_date_unique").on(
      table.userId,
      table.planDate
    ),
  ]
)

export const dailyPlanItems = pgTable(
  "daily_plan_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    dailyPlanId: uuid("daily_plan_id")
      .notNull()
      .references(() => dailyPlans.id, { onDelete: "cascade" }),
    type: planItemType("type").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
  },
  (table) => [
    uniqueIndex("daily_plan_items_plan_type_unique").on(
      table.dailyPlanId,
      table.type
    ),
  ]
)

export type StoredInterviewMessage = {
  id: string
  role: "assistant" | "user" | "correction"
  text: string
  questionWords?: string[]
  helpToken?: string
}

export const interviewSessions = pgTable(
  "interview_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    dailyPlanId: uuid("daily_plan_id")
      .notNull()
      .references(() => dailyPlans.id, { onDelete: "cascade" }),
    episodeId: uuid("episode_id")
      .notNull()
      .references(() => episodes.id, { onDelete: "cascade" }),
    sessionToken: text("session_token").notNull(),
    messages: jsonb("messages")
      .$type<StoredInterviewMessage[]>()
      .notNull()
      .default([]),
    answersCompleted: integer("answers_completed").notNull().default(0),
    completed: boolean("completed").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("interview_sessions_daily_plan_unique").on(table.dailyPlanId),
    index("interview_sessions_user_episode_idx").on(
      table.userId,
      table.episodeId
    ),
  ]
)

export const reminderDeliveries = pgTable(
  "reminder_deliveries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    deliveryDate: date("delivery_date").notNull(),
    scheduledTime: time("scheduled_time").notNull(),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    lastError: text("last_error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("reminder_deliveries_user_date_unique").on(
      table.userId,
      table.deliveryDate
    ),
    index("reminder_deliveries_date_idx").on(table.deliveryDate),
  ]
)

export const ingestionJobs = pgTable(
  "ingestion_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    episodeId: uuid("episode_id").references(() => episodes.id, {
      onDelete: "cascade",
    }),
    youtubeId: text("youtube_id").notNull(),
    status: ingestionStatus("status").notNull().default("pending"),
    error: text("error"),
    model: text("model"),
    promptVersion: text("prompt_version"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    attemptCount: integer("attempt_count").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    costUsd: doublePrecision("cost_usd").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("ingestion_jobs_youtube_idx").on(table.youtubeId, table.createdAt),
    index("ingestion_jobs_next_attempt_idx").on(
      table.status,
      table.nextAttemptAt
    ),
    uniqueIndex("ingestion_jobs_active_youtube_unique")
      .on(table.youtubeId)
      .where(sql`${table.status} in ('pending', 'processing')`),
  ]
)
