create table if not exists public.mobile_push_reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  reminder_date date not null,
  reminder_kind text not null,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed')),
  attempt_count integer not null default 1,
  claimed_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mobile_push_reminder_deliveries_profile_date_kind_unique
    unique (profile_id, reminder_date, reminder_kind)
);

create index if not exists mobile_push_reminder_deliveries_status_claimed_idx
  on public.mobile_push_reminder_deliveries(status, claimed_at);

create index if not exists mobile_push_reminder_deliveries_account_date_idx
  on public.mobile_push_reminder_deliveries(account_id, reminder_date);

alter table public.mobile_push_reminder_deliveries enable row level security;
revoke all privileges on public.mobile_push_reminder_deliveries from anon, authenticated;

comment on table public.mobile_push_reminder_deliveries is
  'Durable delivery claims for scheduled mobile push reminders.';
