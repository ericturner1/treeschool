alter table public.weekly_plan_subject_grades
  add column if not exists plan_title text;
