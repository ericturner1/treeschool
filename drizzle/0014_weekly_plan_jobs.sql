CREATE TABLE IF NOT EXISTS "weekly_plan_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "learning_year_id" uuid NOT NULL,
  "week_number" integer NOT NULL,
  "status" text DEFAULT 'queued' NOT NULL,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "available_at" timestamp with time zone DEFAULT now() NOT NULL,
  "claimed_at" timestamp with time zone,
  "heartbeat_at" timestamp with time zone,
  "worker_id" text,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "weekly_plan_jobs_learning_year_week_unique" UNIQUE("learning_year_id", "week_number"),
  CONSTRAINT "weekly_plan_jobs_learning_year_id_learning_years_id_fk"
    FOREIGN KEY ("learning_year_id")
    REFERENCES "public"."learning_years"("id")
    ON DELETE cascade
    ON UPDATE no action
);
