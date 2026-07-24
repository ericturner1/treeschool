CREATE TABLE weekly_plan_day_pdf_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  weekly_plan_id uuid NOT NULL REFERENCES weekly_plans(id) ON DELETE CASCADE,
  day_number integer NOT NULL CHECK (day_number BETWEEN 1 AND 7),
  source_fingerprint text NOT NULL,
  object_path text NOT NULL,
  filename text NOT NULL,
  size_bytes integer NOT NULL CHECK (size_bytes > 0),
  quality_status text NOT NULL DEFAULT 'unverified',
  quality_report jsonb NOT NULL DEFAULT '{}'::jsonb,
  quality_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT weekly_plan_day_pdf_assets_week_day_unique UNIQUE (weekly_plan_id, day_number)
);

CREATE INDEX weekly_plan_day_pdf_assets_week_idx
  ON weekly_plan_day_pdf_assets (weekly_plan_id, day_number);

COMMENT ON TABLE weekly_plan_day_pdf_assets IS
  'Fingerprint-keyed, quality-checked daily PDFs reused to assemble both weekly PDFs and day-by-day ZIP downloads.';
