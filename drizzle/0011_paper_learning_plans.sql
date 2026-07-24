CREATE TABLE IF NOT EXISTS "learning_years" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "profile_id" uuid NOT NULL,
  "title" text NOT NULL,
  "total_weeks" integer DEFAULT 36 NOT NULL,
  "start_date" date,
  "status" text DEFAULT 'draft' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "content_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "learning_year_id" uuid NOT NULL,
  "label" text NOT NULL,
  "document_role" text DEFAULT 'student' NOT NULL,
  "original_filename" text NOT NULL,
  "object_path" text NOT NULL,
  "mime_type" text DEFAULT 'application/pdf' NOT NULL,
  "size_bytes" integer NOT NULL,
  "page_count" integer NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "analysis_status" text DEFAULT 'pending' NOT NULL,
  "analysis_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "weekly_plans" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "learning_year_id" uuid NOT NULL,
  "week_number" integer NOT NULL,
  "title" text NOT NULL,
  "summary" text,
  "status" text DEFAULT 'planned' NOT NULL,
  "grade" integer,
  "parent_notes" text,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "weekly_plans_learning_year_week_unique" UNIQUE("learning_year_id", "week_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "weekly_plan_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "weekly_plan_id" uuid NOT NULL,
  "document_id" uuid NOT NULL,
  "first_page_index" integer NOT NULL,
  "last_page_index" integer NOT NULL,
  "label" text NOT NULL,
  "day_label" text,
  "sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "learning_years" ADD CONSTRAINT "learning_years_profile_id_profiles_id_fk"
 FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "content_documents" ADD CONSTRAINT "content_documents_learning_year_id_learning_years_id_fk"
 FOREIGN KEY ("learning_year_id") REFERENCES "public"."learning_years"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "weekly_plans" ADD CONSTRAINT "weekly_plans_learning_year_id_learning_years_id_fk"
 FOREIGN KEY ("learning_year_id") REFERENCES "public"."learning_years"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "weekly_plan_items" ADD CONSTRAINT "weekly_plan_items_weekly_plan_id_weekly_plans_id_fk"
 FOREIGN KEY ("weekly_plan_id") REFERENCES "public"."weekly_plans"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "weekly_plan_items" ADD CONSTRAINT "weekly_plan_items_document_id_content_documents_id_fk"
 FOREIGN KEY ("document_id") REFERENCES "public"."content_documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
