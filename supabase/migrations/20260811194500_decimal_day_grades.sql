alter table public.weekly_plan_day_subject_grades
  alter column score type numeric(5, 2) using score::numeric;

alter table public.teacher_activity_events
  alter column score type numeric(5, 2) using score::numeric;

comment on column public.weekly_plan_day_subject_grades.score is
  'Optional grade percentage from 0 through 100, supporting up to two decimal places.';
