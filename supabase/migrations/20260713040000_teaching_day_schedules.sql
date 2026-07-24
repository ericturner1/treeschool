ALTER TABLE learning_years
  ADD COLUMN teaching_days_per_week integer;

ALTER TABLE learning_years
  ALTER COLUMN teaching_days_per_week SET DEFAULT 5;

ALTER TABLE learning_years
  ADD CONSTRAINT learning_years_teaching_days_per_week_check
  CHECK (teaching_days_per_week IS NULL OR teaching_days_per_week BETWEEN 1 AND 7);

CREATE TABLE learning_year_subject_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learning_year_id uuid NOT NULL REFERENCES learning_years(id) ON DELETE CASCADE,
  subject_id uuid REFERENCES curriculum_nodes(id) ON DELETE SET NULL,
  subject_key text NOT NULL,
  subject_label text NOT NULL,
  days_per_week integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT learning_year_subject_preferences_days_per_week_check
    CHECK (days_per_week IS NULL OR days_per_week BETWEEN 1 AND 7),
  CONSTRAINT learning_year_subject_preferences_year_subject_unique
    UNIQUE (learning_year_id, subject_key)
);

ALTER TABLE weekly_plan_items
  ADD COLUMN day_number integer;

ALTER TABLE weekly_plan_items
  ADD CONSTRAINT weekly_plan_items_day_number_check
  CHECK (day_number IS NULL OR day_number BETWEEN 1 AND 7);
