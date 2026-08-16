CREATE TABLE "catalog_language_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tmdb_id" integer NOT NULL,
	"media_type" text NOT NULL,
	"learning_level" text NOT NULL,
	"summary_ru" text NOT NULL,
	"difficulty_factors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confidence" text NOT NULL,
	"source_fingerprint" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_language_profiles_tmdb_media_unique" ON "catalog_language_profiles" USING btree ("tmdb_id","media_type");--> statement-breakpoint
CREATE INDEX "catalog_language_profiles_updated_idx" ON "catalog_language_profiles" USING btree ("updated_at");