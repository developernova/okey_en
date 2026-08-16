CREATE TABLE "daily_catalog_recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"daily_plan_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_date" date NOT NULL,
	"items" jsonb NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "daily_catalog_recommendations" ADD CONSTRAINT "daily_catalog_recommendations_daily_plan_id_daily_plans_id_fk" FOREIGN KEY ("daily_plan_id") REFERENCES "public"."daily_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_catalog_recommendations" ADD CONSTRAINT "daily_catalog_recommendations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "daily_catalog_recommendations_plan_unique" ON "daily_catalog_recommendations" USING btree ("daily_plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "daily_catalog_recommendations_user_date_unique" ON "daily_catalog_recommendations" USING btree ("user_id","plan_date");