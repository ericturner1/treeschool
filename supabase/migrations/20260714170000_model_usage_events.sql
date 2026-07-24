CREATE TABLE model_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  learning_year_id uuid REFERENCES learning_years(id) ON DELETE SET NULL,
  plan_generation_event_id uuid REFERENCES plan_generation_events(id) ON DELETE SET NULL,
  plan_version_id uuid REFERENCES plan_versions(id) ON DELETE SET NULL,
  content_document_id uuid REFERENCES content_documents(id) ON DELETE SET NULL,
  paper_document_job_id uuid REFERENCES paper_document_jobs(id) ON DELETE SET NULL,
  weekly_plan_job_id uuid REFERENCES weekly_plan_jobs(id) ON DELETE SET NULL,
  feature text NOT NULL DEFAULT 'lesson_plan',
  operation text NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  status text NOT NULL DEFAULT 'succeeded',
  provider_request_id text,
  input_tokens integer NOT NULL DEFAULT 0 CHECK (input_tokens >= 0),
  cached_input_tokens integer NOT NULL DEFAULT 0 CHECK (cached_input_tokens >= 0),
  output_tokens integer NOT NULL DEFAULT 0 CHECK (output_tokens >= 0),
  reasoning_tokens integer NOT NULL DEFAULT 0 CHECK (reasoning_tokens >= 0),
  tool_tokens integer NOT NULL DEFAULT 0 CHECK (tool_tokens >= 0),
  total_tokens integer NOT NULL DEFAULT 0 CHECK (total_tokens >= 0),
  duration_ms integer CHECK (duration_ms IS NULL OR duration_ms >= 0),
  error_code text,
  provider_usage_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX model_usage_events_generation_event_created_idx
  ON model_usage_events (plan_generation_event_id, created_at);

CREATE INDEX model_usage_events_learning_year_created_idx
  ON model_usage_events (learning_year_id, created_at);

CREATE INDEX model_usage_events_account_created_idx
  ON model_usage_events (account_id, created_at);

CREATE INDEX model_usage_events_provider_model_created_idx
  ON model_usage_events (provider, model, created_at);

COMMENT ON TABLE model_usage_events IS
  'Vendor-neutral usage ledger for generative-model calls made while indexing and planning lesson plans.';

COMMENT ON COLUMN model_usage_events.provider_usage_json IS
  'Unmodified provider usage metadata. Prompts and generated content are intentionally excluded.';
