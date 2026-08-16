create table if not exists public.sale_email_notifications (
  id uuid primary key default gen_random_uuid(),
  notification_key text not null unique,
  stripe_event_id text not null,
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  recipient_email text not null,
  purchaser_email text,
  sale_source text not null,
  amount_total_cents integer not null default 0,
  currency text not null default 'USD',
  items_json jsonb not null default '[]'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'failed')),
  attempts integer not null default 1 check (attempts > 0),
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sale_email_notifications_status_updated_idx
  on public.sale_email_notifications(status, updated_at);

alter table public.sale_email_notifications enable row level security;

comment on table public.sale_email_notifications is
  'Idempotency and delivery audit records for internal merchant sale emails.';
