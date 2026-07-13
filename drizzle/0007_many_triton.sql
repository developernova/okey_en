CREATE TABLE "pending_program_switches" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"program_id" uuid NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_cards" ADD COLUMN "is_personal" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pending_program_switches" ADD CONSTRAINT "pending_program_switches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_program_switches" ADD CONSTRAINT "pending_program_switches_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
INSERT INTO "programs" ("slug", "title", "description", "level_min", "level_max", "is_active")
VALUES ('extra-english', 'Extra English', 'Сюжетный ситком с повседневным английским', 'A2', 'A2', true)
ON CONFLICT ("slug") DO UPDATE SET
  "title" = excluded."title",
  "description" = excluded."description",
  "level_min" = excluded."level_min",
  "level_max" = excluded."level_max",
  "is_active" = true;
