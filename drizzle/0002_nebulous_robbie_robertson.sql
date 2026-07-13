ALTER TABLE "review_logs" ADD COLUMN "client_event_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "review_logs_client_event_unique" ON "review_logs" USING btree ("client_event_id");