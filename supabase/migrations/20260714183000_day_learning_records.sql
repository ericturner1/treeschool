CREATE TABLE weekly_plan_day_subject_grades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  weekly_plan_id uuid NOT NULL REFERENCES weekly_plans(id) ON DELETE CASCADE,
  day_number integer NOT NULL CHECK (day_number BETWEEN 1 AND 7),
  subject_id uuid REFERENCES curriculum_nodes(id) ON DELETE SET NULL,
  subject_key text NOT NULL,
  subject_label text NOT NULL,
  title text,
  score integer NOT NULL CHECK (score BETWEEN 0 AND 100),
  assessment_recommended boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT weekly_plan_day_subject_grades_week_day_subject_unique
    UNIQUE (weekly_plan_id, day_number, subject_key)
);

CREATE INDEX weekly_plan_day_subject_grades_week_idx
  ON weekly_plan_day_subject_grades (weekly_plan_id, day_number);

ALTER TABLE attendance_entries
  ADD COLUMN weekly_plan_day_number integer CHECK (weekly_plan_day_number BETWEEN 1 AND 7);

ALTER TABLE attendance_entries
  ADD CONSTRAINT attendance_entries_plan_day_date_unique
  UNIQUE (profile_id, weekly_plan_id, weekly_plan_day_number, attendance_date);

CREATE TABLE attendance_entry_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_entry_id uuid NOT NULL REFERENCES attendance_entries(id) ON DELETE CASCADE,
  subject_key text NOT NULL,
  subject_label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_entry_subjects_entry_subject_unique
    UNIQUE (attendance_entry_id, subject_key)
);

CREATE INDEX attendance_entry_subjects_entry_idx
  ON attendance_entry_subjects (attendance_entry_id);

COMMENT ON TABLE weekly_plan_day_subject_grades IS
  'Optional assessments for one subject on one planned day. Missing rows mean ungraded, never zero.';

COMMENT ON TABLE attendance_entry_subjects IS
  'Subjects covered by one day-level attendance event.';
