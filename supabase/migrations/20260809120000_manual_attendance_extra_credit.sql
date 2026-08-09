alter table public.attendance_entries
  add column if not exists extra_credit_points integer;

alter table public.attendance_entries
  drop constraint if exists attendance_entries_extra_credit_points_check;

alter table public.attendance_entries
  add constraint attendance_entries_extra_credit_points_check
  check (extra_credit_points is null or extra_credit_points between 1 and 100);

comment on column public.attendance_entries.extra_credit_points is
  'Optional gradebook bonus points awarded for a manual other-learning record.';
