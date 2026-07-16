ALTER TABLE "daily_plans" ADD COLUMN "return_gap_days" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ingestion_jobs" ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ingestion_jobs" ADD COLUMN "next_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ingestion_jobs" ADD COLUMN "prompt_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ingestion_jobs" ADD COLUMN "completion_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ingestion_jobs" ADD COLUMN "total_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ingestion_jobs" ADD COLUMN "cost_usd" double precision DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "reminder_deliveries" ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "reminder_deliveries" ADD COLUMN "last_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reminder_deliveries" ADD COLUMN "next_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reminder_deliveries" ADD COLUMN "last_error" text;--> statement-breakpoint
CREATE INDEX "ingestion_jobs_next_attempt_idx" ON "ingestion_jobs" USING btree ("status","next_attempt_at");--> statement-breakpoint
WITH "ranked_active_imports" AS (
	SELECT
		"id",
		row_number() OVER (
			PARTITION BY "youtube_id"
			ORDER BY
				CASE WHEN "status" = 'processing' THEN 0 ELSE 1 END,
				"created_at",
				"id"
		) AS "rank"
	FROM "ingestion_jobs"
	WHERE "status" IN ('pending', 'processing')
)
UPDATE "ingestion_jobs"
SET
	"status" = 'failed',
	"error" = COALESCE("ingestion_jobs"."error", 'Deduplicated before enabling active import protection'),
	"next_attempt_at" = NULL,
	"finished_at" = COALESCE("ingestion_jobs"."finished_at", now())
FROM "ranked_active_imports"
WHERE
	"ingestion_jobs"."id" = "ranked_active_imports"."id"
	AND "ranked_active_imports"."rank" > 1;--> statement-breakpoint
CREATE UNIQUE INDEX "ingestion_jobs_active_youtube_unique" ON "ingestion_jobs" USING btree ("youtube_id") WHERE "ingestion_jobs"."status" in ('pending', 'processing');
