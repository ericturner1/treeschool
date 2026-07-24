create table if not exists public.teacher_activity_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  actor_user_id uuid references public.users(id) on delete set null,
  actor_profile_id uuid references public.profiles(id) on delete set null,
  student_profile_id uuid references public.profiles(id) on delete set null,
  weekly_plan_id uuid references public.weekly_plans(id) on delete set null,
  event_type text not null,
  subject_key text,
  subject_label text,
  score integer,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  constraint teacher_activity_events_score_check
    check (score is null or (score >= 0 and score <= 100))
);

create index if not exists teacher_activity_events_account_actor_date_idx
  on public.teacher_activity_events(account_id, actor_profile_id, occurred_at);

create index if not exists teacher_activity_events_student_date_idx
  on public.teacher_activity_events(student_profile_id, occurred_at);
