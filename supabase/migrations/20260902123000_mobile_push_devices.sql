create table if not exists public.mobile_push_devices (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  token text not null,
  platform text not null default 'ios'
    check (platform in ('ios')),
  environment text not null default 'production'
    check (environment in ('sandbox', 'production')),
  bundle_id text not null default 'com.treehomeschool.app',
  disabled_at timestamptz,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mobile_push_devices_token_environment_unique
    unique (token, environment, bundle_id)
);

create index if not exists mobile_push_devices_account_enabled_idx
  on public.mobile_push_devices(account_id, disabled_at);

create index if not exists mobile_push_devices_user_idx
  on public.mobile_push_devices(user_id);

alter table public.mobile_push_devices enable row level security;
revoke all privileges on public.mobile_push_devices from anon, authenticated;

comment on table public.mobile_push_devices is
  'APNs device registrations managed only through authenticated Treeschool server endpoints.';
