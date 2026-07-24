CREATE TABLE plan_generation_diagnostics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learning_year_id uuid NOT NULL REFERENCES learning_years(id) ON DELETE CASCADE,
  weekly_plan_job_id uuid REFERENCES weekly_plan_jobs(id) ON DELETE SET NULL,
  plan_version_id uuid REFERENCES plan_versions(id) ON DELETE SET NULL,
  week_number integer,
  attempt_number integer,
  stage text NOT NULL,
  provider text,
  model text,
  error_name text,
  error_message text NOT NULL,
  error_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  will_retry boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX plan_generation_diagnostics_year_created_idx
  ON plan_generation_diagnostics (learning_year_id, created_at DESC);

CREATE INDEX plan_generation_diagnostics_job_idx
  ON plan_generation_diagnostics (weekly_plan_job_id);

CREATE INDEX plan_generation_diagnostics_version_week_idx
  ON plan_generation_diagnostics (plan_version_id, week_number);
