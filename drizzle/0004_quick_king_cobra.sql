CREATE TABLE "reminder_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"delivery_date" date NOT NULL,
	"scheduled_time" time NOT NULL,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reminder_deliveries" ADD CONSTRAINT "reminder_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reminder_deliveries_user_date_unique" ON "reminder_deliveries" USING btree ("user_id","delivery_date");--> statement-breakpoint
CREATE INDEX "reminder_deliveries_date_idx" ON "reminder_deliveries" USING btree ("delivery_date");