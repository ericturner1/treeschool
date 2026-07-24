ALTER TABLE weekly_plan_pdf_assets
  ADD COLUMN quality_status text NOT NULL DEFAULT 'unverified',
  ADD COLUMN quality_report jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN quality_checked_at timestamptz;
