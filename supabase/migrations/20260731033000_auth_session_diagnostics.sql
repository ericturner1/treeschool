create table if not exists public.auth_session_diagnostics (
  id uuid primary key default gen_random_uuid(),
  trace_id uuid,
  event text not null
    check (event in (
      'idle_expired',
      'credentials_missing',
      'refresh_cookie_missing',
      'refresh_unavailable',
      'renewal_unavailable',
      'renewal_failed'
    )),
  reason text,
  path text,
  status_code integer,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists auth_session_diagnostics_trace_created_idx
  on public.auth_session_diagnostics(trace_id, created_at);

create index if not exists auth_session_diagnostics_event_created_idx
  on public.auth_session_diagnostics(event, created_at);

comment on table public.auth_session_diagnostics is
  'Token-free authentication failure telemetry retained for diagnosing unexpected parent sign-outs.';

alter table public.auth_session_diagnostics enable row level security;
