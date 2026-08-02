ALTER TABLE "users" ADD COLUMN "onboarding_completed" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE "users" AS "u"
SET "onboarding_completed" = true
WHERE "u"."level_estimate" IN ('A1', 'A2', 'B1', 'B2')
   OR EXISTS (
     SELECT 1
     FROM "daily_plans" AS "dp"
     LEFT JOIN "daily_plan_items" AS "dpi"
       ON "dpi"."daily_plan_id" = "dp"."id"
     WHERE "dp"."user_id" = "u"."id"
       AND ("dp"."completed_at" IS NOT NULL OR "dpi"."completed_at" IS NOT NULL)
   )
   OR EXISTS (
     SELECT 1
     FROM "review_logs" AS "rl"
     INNER JOIN "user_cards" AS "uc"
       ON "uc"."id" = "rl"."user_card_id"
     WHERE "uc"."user_id" = "u"."id"
   )
   OR EXISTS (
     SELECT 1
     FROM "interview_sessions" AS "is"
     WHERE "is"."user_id" = "u"."id"
       AND ("is"."completed" = true OR "is"."answers_completed" > 0)
   );
