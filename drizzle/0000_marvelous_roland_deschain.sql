CREATE TYPE "public"."ingestion_status" AS ENUM('pending', 'processing', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."lexeme_source" AS ENUM('oxford', 'placement_test', 'review', 'manual');--> statement-breakpoint
CREATE TYPE "public"."plan_item_type" AS ENUM('watch', 'review', 'retell');--> statement-breakpoint
CREATE TYPE "public"."plan_status" AS ENUM('not_started', 'supporting', 'complete', 'skipped');--> statement-breakpoint
CREATE TABLE "daily_plan_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"daily_plan_id" uuid NOT NULL,
	"type" "plan_item_type" NOT NULL,
	"completed_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_date" date NOT NULL,
	"status" "plan_status" DEFAULT 'not_started' NOT NULL,
	"episode_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "episode_lexemes" (
	"episode_id" uuid NOT NULL,
	"lemma" text NOT NULL,
	"frequency" integer NOT NULL,
	CONSTRAINT "episode_lexemes_episode_id_lemma_pk" PRIMARY KEY("episode_id","lemma")
);
--> statement-breakpoint
CREATE TABLE "episodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"program_id" uuid NOT NULL,
	"youtube_id" text NOT NULL,
	"title" text NOT NULL,
	"sequence_number" integer NOT NULL,
	"duration_seconds" integer NOT NULL,
	"transcript_language" text DEFAULT 'en' NOT NULL,
	"ingestion_status" "ingestion_status" DEFAULT 'pending' NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "episodes_youtube_id_unique" UNIQUE("youtube_id")
);
--> statement-breakpoint
CREATE TABLE "ingestion_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"episode_id" uuid,
	"youtube_id" text NOT NULL,
	"status" "ingestion_status" DEFAULT 'pending' NOT NULL,
	"error" text,
	"model" text,
	"prompt_version" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lexemes" (
	"lemma" text PRIMARY KEY NOT NULL,
	"cefr" text NOT NULL,
	"frequency_rank" integer,
	"is_oxford_3000" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "phrases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"episode_id" uuid NOT NULL,
	"phrase" text NOT NULL,
	"normalized_phrase" text NOT NULL,
	"lemma" text NOT NULL,
	"translation_ru" text NOT NULL,
	"context_sentence" text NOT NULL,
	"cefr" text NOT NULL,
	"segment_index" integer NOT NULL,
	"offset_ms" integer NOT NULL,
	"confidence" real NOT NULL,
	"rationale" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "programs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"level_min" text NOT NULL,
	"level_max" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "programs_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "review_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_card_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"state_before" integer NOT NULL,
	"state_after" integer NOT NULL,
	"due_before" timestamp with time zone NOT NULL,
	"due_after" timestamp with time zone NOT NULL,
	"stability_after" real NOT NULL,
	"difficulty_after" real NOT NULL,
	"scheduled_days_after" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transcript_segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"episode_id" uuid NOT NULL,
	"segment_index" integer NOT NULL,
	"offset_ms" integer NOT NULL,
	"duration_ms" integer NOT NULL,
	"text" text NOT NULL,
	"normalized_text" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"phrase_id" uuid NOT NULL,
	"due" timestamp with time zone NOT NULL,
	"stability" real DEFAULT 0 NOT NULL,
	"difficulty" real DEFAULT 0 NOT NULL,
	"scheduled_days" integer DEFAULT 0 NOT NULL,
	"learning_steps" integer DEFAULT 0 NOT NULL,
	"reps" integer DEFAULT 0 NOT NULL,
	"lapses" integer DEFAULT 0 NOT NULL,
	"state" integer DEFAULT 0 NOT NULL,
	"last_review" timestamp with time zone,
	"is_suspended" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_lexemes" (
	"user_id" uuid NOT NULL,
	"lemma" text NOT NULL,
	"source" "lexeme_source" NOT NULL,
	"confidence" real DEFAULT 1 NOT NULL,
	"learned_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_lexemes_user_id_lemma_pk" PRIMARY KEY("user_id","lemma")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"telegram_user_id" text,
	"timezone" text DEFAULT 'Europe/Moscow' NOT NULL,
	"reminder_time" time,
	"level_estimate" text,
	"last_active_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_telegram_user_id_unique" UNIQUE("telegram_user_id")
);
--> statement-breakpoint
ALTER TABLE "daily_plan_items" ADD CONSTRAINT "daily_plan_items_daily_plan_id_daily_plans_id_fk" FOREIGN KEY ("daily_plan_id") REFERENCES "public"."daily_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_plans" ADD CONSTRAINT "daily_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_plans" ADD CONSTRAINT "daily_plans_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episode_lexemes" ADD CONSTRAINT "episode_lexemes_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingestion_jobs" ADD CONSTRAINT "ingestion_jobs_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phrases" ADD CONSTRAINT "phrases_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_logs" ADD CONSTRAINT "review_logs_user_card_id_user_cards_id_fk" FOREIGN KEY ("user_card_id") REFERENCES "public"."user_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcript_segments" ADD CONSTRAINT "transcript_segments_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_cards" ADD CONSTRAINT "user_cards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_cards" ADD CONSTRAINT "user_cards_phrase_id_phrases_id_fk" FOREIGN KEY ("phrase_id") REFERENCES "public"."phrases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_lexemes" ADD CONSTRAINT "user_lexemes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "daily_plan_items_plan_type_unique" ON "daily_plan_items" USING btree ("daily_plan_id","type");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_plans_user_date_unique" ON "daily_plans" USING btree ("user_id","plan_date");--> statement-breakpoint
CREATE INDEX "episode_lexemes_episode_idx" ON "episode_lexemes" USING btree ("episode_id");--> statement-breakpoint
CREATE UNIQUE INDEX "episodes_program_sequence_unique" ON "episodes" USING btree ("program_id","sequence_number");--> statement-breakpoint
CREATE INDEX "episodes_program_idx" ON "episodes" USING btree ("program_id");--> statement-breakpoint
CREATE INDEX "ingestion_jobs_youtube_idx" ON "ingestion_jobs" USING btree ("youtube_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "phrases_episode_normalized_unique" ON "phrases" USING btree ("episode_id","normalized_phrase");--> statement-breakpoint
CREATE INDEX "phrases_episode_idx" ON "phrases" USING btree ("episode_id");--> statement-breakpoint
CREATE INDEX "phrases_lemma_idx" ON "phrases" USING btree ("lemma");--> statement-breakpoint
CREATE INDEX "review_logs_card_reviewed_idx" ON "review_logs" USING btree ("user_card_id","reviewed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "transcript_episode_segment_unique" ON "transcript_segments" USING btree ("episode_id","segment_index");--> statement-breakpoint
CREATE INDEX "transcript_episode_idx" ON "transcript_segments" USING btree ("episode_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_cards_user_phrase_unique" ON "user_cards" USING btree ("user_id","phrase_id");--> statement-breakpoint
CREATE INDEX "user_cards_due_idx" ON "user_cards" USING btree ("user_id","due");--> statement-breakpoint
CREATE INDEX "user_lexemes_user_idx" ON "user_lexemes" USING btree ("user_id");