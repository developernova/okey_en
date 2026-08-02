CREATE TABLE "auth_rate_limit_buckets" (
	"key" text PRIMARY KEY NOT NULL,
	"request_count" integer NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"window_expires_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "auth_rate_limit_buckets_expires_at_idx" ON "auth_rate_limit_buckets" USING btree ("window_expires_at");