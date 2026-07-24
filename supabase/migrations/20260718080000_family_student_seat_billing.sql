ALTER TABLE subscriptions
  ADD COLUMN billing_interval text CHECK (billing_interval IN ('monthly', 'yearly')),
  ADD COLUMN introductory_offer text,
  ADD COLUMN stripe_additional_student_item_id text,
  ADD COLUMN additional_student_quantity integer NOT NULL DEFAULT 0
    CHECK (additional_student_quantity >= 0);

CREATE TABLE student_profile_checkouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  requested_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  planned_profile_id uuid NOT NULL,
  profile_data jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'expired')),
  amount_in_cents integer NOT NULL CHECK (amount_in_cents >= 50),
  recurring_amount_in_cents integer NOT NULL CHECK (recurring_amount_in_cents > 0),
  recurring_interval text NOT NULL CHECK (recurring_interval IN ('month', 'year')),
  target_additional_student_quantity integer NOT NULL
    CHECK (target_additional_student_quantity > 0),
  stripe_checkout_session_id text UNIQUE,
  checkout_url text,
  expires_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX student_profile_checkouts_account_status_idx
  ON student_profile_checkouts(account_id, status, created_at);

ALTER TABLE plan_generation_events
  DROP CONSTRAINT IF EXISTS plan_generation_events_allowance_source_check;

ALTER TABLE plan_generation_events
  ADD CONSTRAINT plan_generation_events_allowance_source_check
  CHECK (allowance_source IN ('initial', 'subscription_intro', 'subscription', 'plan_pack'));
