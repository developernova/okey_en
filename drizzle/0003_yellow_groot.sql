CREATE TABLE "interview_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"episode_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"request_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "interview_requests" ADD CONSTRAINT "interview_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_requests" ADD CONSTRAINT "interview_requests_episode_id_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."episodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "interview_requests_user_date_idx" ON "interview_requests" USING btree ("user_id","request_date");--> statement-breakpoint
CREATE INDEX "interview_requests_user_created_idx" ON "interview_requests" USING btree ("user_id","created_at");