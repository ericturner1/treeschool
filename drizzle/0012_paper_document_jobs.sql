ALTER TABLE "content_documents"
  ADD COLUMN IF NOT EXISTS "parent_notes" text;

CREATE TABLE IF NOT EXISTS "paper_document_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "document_id" uuid NOT NULL,
  "status" text DEFAULT 'queued' NOT NULL,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "available_at" timestamp with time zone DEFAULT now() NOT NULL,
  "claimed_at" timestamp with time zone,
  "heartbeat_at" timestamp with time zone,
  "worker_id" text,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "paper_document_jobs_document_unique" UNIQUE("document_id"),
  CONSTRAINT "paper_document_jobs_document_id_content_documents_id_fk"
    FOREIGN KEY ("document_id")
    REFERENCES "public"."content_documents"("id")
    ON DELETE cascade
    ON UPDATE no action
);
