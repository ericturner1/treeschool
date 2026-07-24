ALTER TABLE "content_documents"
  ADD COLUMN IF NOT EXISTS "subject_id" uuid;

DO $$ BEGIN
 ALTER TABLE "content_documents" ADD CONSTRAINT "content_documents_subject_id_curriculum_nodes_id_fk"
 FOREIGN KEY ("subject_id") REFERENCES "public"."curriculum_nodes"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "weekly_plan_subject_grades" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "weekly_plan_id" uuid NOT NULL,
  "subject_id" uuid,
  "subject_key" text NOT NULL,
  "subject_label" text NOT NULL,
  "grade" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "weekly_plan_subject_grades_week_subject_unique" UNIQUE("weekly_plan_id", "subject_key")
);

DO $$ BEGIN
 ALTER TABLE "weekly_plan_subject_grades" ADD CONSTRAINT "weekly_plan_subject_grades_weekly_plan_id_weekly_plans_id_fk"
 FOREIGN KEY ("weekly_plan_id") REFERENCES "public"."weekly_plans"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "weekly_plan_subject_grades" ADD CONSTRAINT "weekly_plan_subject_grades_subject_id_curriculum_nodes_id_fk"
 FOREIGN KEY ("subject_id") REFERENCES "public"."curriculum_nodes"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
