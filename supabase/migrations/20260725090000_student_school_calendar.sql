create table if not exists public.student_calendar_exceptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  label text not null,
  start_date date not null,
  end_date date not null,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_calendar_exceptions_label_not_blank
    check (length(btrim(label)) > 0),
  constraint student_calendar_exceptions_date_order
    check (end_date >= start_date)
);

create index if not exists student_calendar_exceptions_profile_date_idx
  on public.student_calendar_exceptions (profile_id, start_date, end_date);

create index if not exists learning_activity_events_profile_occurred_at_idx
  on public.learning_activity_events (profile_id, occurred_at);

comment on table public.student_calendar_exceptions is
  'Named holidays and planned days off that do not interrupt a Treeschool learning streak.';
