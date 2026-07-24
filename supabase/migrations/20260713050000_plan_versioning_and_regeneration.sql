ALTER TABLE content_documents
  ADD COLUMN removed_at timestamptz,
  ADD COLUMN retained_until timestamptz;

CREATE TABLE plan_generation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  learning_year_id uuid NOT NULL REFERENCES learning_years(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'initial' CHECK (kind IN ('initial', 'replan')),
  allowance_source text NOT NULL DEFAULT 'initial' CHECK (allowance_source IN ('initial', 'subscription', 'plan_pack')),
  period_key text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'completed', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX plan_generation_events_allowance_idx
  ON plan_generation_events(account_id, allowance_source, period_key, status, created_at DESC);

CREATE TABLE plan_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learning_year_id uuid NOT NULL REFERENCES learning_years(id) ON DELETE CASCADE,
  generation_event_id uuid REFERENCES plan_generation_events(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'generating' CHECK (status IN ('generating', 'active', 'recoverable', 'failed', 'expired')),
  source_document_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  restore_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz
);

CREATE INDEX plan_versions_year_status_idx
  ON plan_versions(learning_year_id, status, created_at DESC);

CREATE TABLE plan_version_weeks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_version_id uuid NOT NULL REFERENCES plan_versions(id) ON DELETE CASCADE,
  week_number integer NOT NULL,
  week_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plan_version_weeks_version_week_unique UNIQUE (plan_version_id, week_number)
);

ALTER TABLE weekly_plan_jobs
  ADD COLUMN plan_version_id uuid REFERENCES plan_versions(id) ON DELETE CASCADE;

CREATE TABLE weekly_plan_pdf_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  weekly_plan_id uuid NOT NULL REFERENCES weekly_plans(id) ON DELETE CASCADE,
  object_path text NOT NULL,
  filename text NOT NULL,
  size_bytes integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT weekly_plan_pdf_assets_weekly_plan_unique UNIQUE (weekly_plan_id)
);

CREATE INDEX content_documents_retention_idx
  ON content_documents(learning_year_id, removed_at, retained_until);
