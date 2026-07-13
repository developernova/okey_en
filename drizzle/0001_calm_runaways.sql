CREATE TABLE "user_program_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"program_id" uuid NOT NULL,
	"current_episode_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_program_progress" ADD CONSTRAINT "user_program_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_program_progress" ADD CONSTRAINT "user_program_progress_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_program_progress" ADD CONSTRAINT "user_program_progress_current_episode_id_episodes_id_fk" FOREIGN KEY ("current_episode_id") REFERENCES "public"."episodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_program_progress_user_program_unique" ON "user_program_progress" USING btree ("user_id","program_id");--> statement-breakpoint
CREATE INDEX "user_program_progress_active_idx" ON "user_program_progress" USING btree ("user_id","is_active");