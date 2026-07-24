ALTER TABLE plan_pack_intakes
  ADD COLUMN premium_trial_started_at timestamptz,
  ADD COLUMN premium_trial_ends_at timestamptz;

UPDATE plan_pack_intakes
SET
  premium_trial_started_at = now(),
  premium_trial_ends_at = now() + interval '7 days'
WHERE status = 'ready'
  AND stripe_checkout_session_id IS NOT NULL;

CREATE TABLE attendance_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  learning_year_id uuid REFERENCES learning_years(id) ON DELETE SET NULL,
  weekly_plan_id uuid REFERENCES weekly_plans(id) ON DELETE SET NULL,
  weekly_plan_item_id uuid REFERENCES weekly_plan_items(id) ON DELETE SET NULL,
  attendance_date date NOT NULL,
  entry_kind text NOT NULL DEFAULT 'manual',
  activity_type text NOT NULL DEFAULT 'lesson',
  subject_key text,
  subject_label text,
  title text NOT NULL,
  notes text,
  minutes integer,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_entries_minutes_check
    CHECK (minutes IS NULL OR minutes BETWEEN 1 AND 1440),
  CONSTRAINT attendance_entries_kind_check
    CHECK (entry_kind IN ('plan_item', 'manual')),
  CONSTRAINT attendance_entries_plan_item_date_unique
    UNIQUE (profile_id, weekly_plan_item_id, attendance_date)
);

CREATE INDEX attendance_entries_profile_date_idx
  ON attendance_entries(profile_id, attendance_date DESC);
