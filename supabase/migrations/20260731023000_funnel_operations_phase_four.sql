alter table public.funnel_events
  drop constraint if exists funnel_events_event_type_check;

alter table public.funnel_events
  add constraint funnel_events_event_type_check
  check (event_type in (
    'page_view',
    'lead_captured',
    'primary_cta_click',
    'secondary_cta_click',
    'checkout_started',
    'purchase',
    'thank_you_view'
  ));

create table if not exists public.funnel_leads (
  id uuid primary key default gen_random_uuid(),
  funnel_id uuid not null references public.funnels(id) on delete cascade,
  visitor_id uuid not null,
  email text not null,
  first_name text,
  status text not null default 'lead'
    check (status in ('lead', 'customer', 'unsubscribed')),
  first_funnel_step_id uuid references public.funnel_steps(id) on delete set null,
  first_funnel_page_id uuid references public.funnel_pages(id) on delete set null,
  last_funnel_step_id uuid references public.funnel_steps(id) on delete set null,
  last_funnel_page_id uuid references public.funnel_pages(id) on delete set null,
  experiment_id uuid references public.funnel_experiments(id) on delete set null,
  experiment_variant_id uuid references public.funnel_experiment_variants(id) on delete set null,
  tags_json jsonb not null default '[]'::jsonb,
  attribution_json jsonb not null default '{}'::jsonb,
  metadata_json jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  converted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint funnel_leads_funnel_visitor_unique unique (funnel_id, visitor_id)
);

create index if not exists funnel_leads_funnel_email_idx
  on public.funnel_leads(funnel_id, email);
create index if not exists funnel_leads_funnel_created_idx
  on public.funnel_leads(funnel_id, created_at);

create table if not exists public.funnel_sales (
  id uuid primary key default gen_random_uuid(),
  funnel_id uuid references public.funnels(id) on delete set null,
  funnel_slug text not null,
  funnel_name text not null,
  visitor_id uuid not null,
  funnel_step_id uuid references public.funnel_steps(id) on delete set null,
  funnel_page_id uuid references public.funnel_pages(id) on delete set null,
  funnel_page_revision_number integer
    check (funnel_page_revision_number is null or funnel_page_revision_number > 0),
  experiment_id uuid references public.funnel_experiments(id) on delete set null,
  experiment_variant_id uuid references public.funnel_experiment_variants(id) on delete set null,
  stripe_checkout_session_id text not null unique,
  stripe_payment_intent_id text,
  email text,
  order_kind text not null default 'unknown',
  amount_subtotal_cents integer
    check (amount_subtotal_cents is null or amount_subtotal_cents >= 0),
  amount_total_cents integer not null default 0
    check (amount_total_cents >= 0),
  currency text not null default 'USD'
    check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'paid'
    check (status in ('paid', 'refunded', 'partially_refunded')),
  metadata_json jsonb not null default '{}'::jsonb,
  purchased_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists funnel_sales_funnel_purchased_idx
  on public.funnel_sales(funnel_id, purchased_at);
create index if not exists funnel_sales_visitor_idx
  on public.funnel_sales(visitor_id);

create table if not exists public.funnel_automation_rules (
  id uuid primary key default gen_random_uuid(),
  funnel_id uuid not null references public.funnels(id) on delete cascade,
  name text not null,
  trigger_event text not null check (trigger_event in ('lead_captured', 'purchase')),
  action_type text not null check (action_type in ('add_tag')),
  action_config_json jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  display_order integer not null default 0,
  created_by_user_id uuid references public.users(id) on delete set null,
  updated_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists funnel_automation_rules_funnel_order_idx
  on public.funnel_automation_rules(funnel_id, display_order);

comment on table public.funnel_leads is
  'Durable funnel contacts keyed by visitor, with first/last touch attribution and automation tags.';
comment on table public.funnel_sales is
  'Immutable, idempotent Stripe-confirmed funnel sales with historical page and experiment attribution.';
comment on table public.funnel_automation_rules is
  'Small, deterministic funnel automations. Phase four supports tagging leads on capture or purchase.';

alter table public.funnel_leads enable row level security;
alter table public.funnel_sales enable row level security;
alter table public.funnel_automation_rules enable row level security;
