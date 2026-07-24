ALTER TABLE attendance_entries
  DROP CONSTRAINT attendance_entries_kind_check;

ALTER TABLE attendance_entries
  ADD CONSTRAINT attendance_entries_kind_check
  CHECK (entry_kind IN ('plan_item', 'plan_day', 'manual'));
