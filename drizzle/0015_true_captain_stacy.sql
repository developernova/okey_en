CREATE TABLE "qr_auth_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_token_hash" text NOT NULL,
	"desktop_verifier_hash" text NOT NULL,
	"desktop_device_id" text NOT NULL,
	"user_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"approved_at" timestamp with time zone,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "qr_auth_challenges" ADD CONSTRAINT "qr_auth_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "qr_auth_challenges_public_token_hash_unique" ON "qr_auth_challenges" USING btree ("public_token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "qr_auth_challenges_desktop_verifier_hash_unique" ON "qr_auth_challenges" USING btree ("desktop_verifier_hash");--> statement-breakpoint
CREATE INDEX "qr_auth_challenges_expires_at_idx" ON "qr_auth_challenges" USING btree ("expires_at");