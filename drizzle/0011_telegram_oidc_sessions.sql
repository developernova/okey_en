CREATE TYPE "public"."auth_token_kind" AS ENUM('access', 'refresh');--> statement-breakpoint
CREATE TABLE "auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"device_id" text,
	"device_name" text,
	"absolute_expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_tokens" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"kind" "auth_token_kind" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_auth_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"state_hash" text NOT NULL,
	"oidc_nonce_hash" text NOT NULL,
	"oidc_code_verifier" text,
	"handoff_code_challenge" text NOT NULL,
	"handoff_code_hash" text,
	"platform" text NOT NULL,
	"device_id" text,
	"device_name" text,
	"user_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"handoff_expires_at" timestamp with time zone,
	"callback_started_at" timestamp with time zone,
	"callback_completed_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "telegram_oidc_subject" text;--> statement-breakpoint
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_session_id_auth_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."auth_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telegram_auth_attempts" ADD CONSTRAINT "telegram_auth_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auth_sessions_user_revoked_idx" ON "auth_sessions" USING btree ("user_id","revoked_at");--> statement-breakpoint
CREATE INDEX "auth_sessions_absolute_expires_at_idx" ON "auth_sessions" USING btree ("absolute_expires_at");--> statement-breakpoint
CREATE INDEX "auth_tokens_session_kind_expires_at_idx" ON "auth_tokens" USING btree ("session_id","kind","expires_at");--> statement-breakpoint
CREATE INDEX "auth_tokens_expires_at_idx" ON "auth_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_auth_attempts_state_hash_unique" ON "telegram_auth_attempts" USING btree ("state_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "telegram_auth_attempts_handoff_code_hash_unique" ON "telegram_auth_attempts" USING btree ("handoff_code_hash");--> statement-breakpoint
CREATE INDEX "telegram_auth_attempts_expires_at_idx" ON "telegram_auth_attempts" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_telegram_oidc_subject_unique" UNIQUE("telegram_oidc_subject");