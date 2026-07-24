ALTER TABLE "content_documents"
  ADD COLUMN IF NOT EXISTS "subject_label" text;

ALTER TABLE "content_documents"
  ADD COLUMN IF NOT EXISTS "source_kind" text DEFAULT 'pdf' NOT NULL;
