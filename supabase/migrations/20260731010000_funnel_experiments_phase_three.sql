create table if not exists public.funnel_experiments (
  id uuid primary key default gen_random_uuid(),
  funnel_step_id uuid not null references public.funnel_steps(id) on delete cascade,
  name text not null,
  status text not null default 'draft'
    check (status in ('draft', 'running', 'paused', 'completed')),
  goal_event text not null default 'primary_cta_click'
    check (goal_event in (
      'primary_cta_click',
      'secondary_cta_click',
      'checkout_started',
      'purchase',
      'thank_you_view'
    )),
  started_at timestamptz,
  ended_at timestamptz,
  created_by_user_id uuid references public.users(id) on delete set null,
  updated_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists funnel_experiments_step_status_idx
  on public.funnel_experiments(funnel_step_id, status);

create unique index if not exists funnel_experiments_one_running_per_step_idx
  on public.funnel_experiments(funnel_step_id)
  where status = 'running';

create table if not exists public.funnel_experiment_variants (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references public.funnel_experiments(id) on delete cascade,
  funnel_page_id uuid not null references public.funnel_pages(id) on delete cascade,
  weight integer not null default 50 check (weight between 1 and 100),
  is_control boolean not null default false,
  created_at timestamptz not null default now(),
  constraint funnel_experiment_variants_experiment_page_unique
    unique (experiment_id, funnel_page_id)
);

create index if not exists funnel_experiment_variants_experiment_idx
  on public.funnel_experiment_variants(experiment_id);

create table if not exists public.funnel_visitor_assignments (
  id uuid primary key default gen_random_uuid(),
  experiment_id uuid not null references public.funnel_experiments(id) on delete cascade,
  experiment_variant_id uuid not null
    references public.funnel_experiment_variants(id) on delete cascade,
  visitor_id uuid not null,
  assigned_at timestamptz not null default now(),
  constraint funnel_visitor_assignments_experiment_visitor_unique
    unique (experiment_id, visitor_id)
);

create index if not exists funnel_visitor_assignments_variant_idx
  on public.funnel_visitor_assignments(experiment_variant_id);

create table if not exists public.funnel_events (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique,
  funnel_id uuid not null references public.funnels(id) on delete cascade,
  funnel_step_id uuid not null references public.funnel_steps(id) on delete cascade,
  funnel_page_id uuid not null references public.funnel_pages(id) on delete cascade,
  funnel_page_revision_number integer not null check (funnel_page_revision_number > 0),
  experiment_id uuid references public.funnel_experiments(id) on delete set null,
  experiment_variant_id uuid
    references public.funnel_experiment_variants(id) on delete set null,
  visitor_id uuid not null,
  event_type text not null check (event_type in (
    'page_view',
    'primary_cta_click',
    'secondary_cta_click',
    'checkout_started',
    'purchase',
    'thank_you_view'
  )),
  value_cents integer check (value_cents is null or value_cents >= 0),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  metadata_json jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists funnel_events_funnel_occurred_idx
  on public.funnel_events(funnel_id, occurred_at);
create index if not exists funnel_events_experiment_occurred_idx
  on public.funnel_events(experiment_id, occurred_at);
create index if not exists funnel_events_visitor_idx
  on public.funnel_events(visitor_id);

create table if not exists public.funnel_page_generation_runs (
  id uuid primary key default gen_random_uuid(),
  funnel_step_id uuid not null references public.funnel_steps(id) on delete cascade,
  funnel_page_id uuid references public.funnel_pages(id) on delete set null,
  requested_by_user_id uuid references public.users(id) on delete set null,
  provider text not null,
  model text not null,
  mode text not null check (mode in ('create', 'rewrite', 'optimize', 'variant')),
  status text not null default 'running'
    check (status in ('running', 'succeeded', 'failed')),
  prompt text not null,
  provider_request_id text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  total_tokens integer not null default 0,
  duration_ms integer,
  output_revision_number integer,
  error_message text,
  provider_usage_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists funnel_page_generation_runs_step_created_idx
  on public.funnel_page_generation_runs(funnel_step_id, created_at);

alter table public.funnel_experiments enable row level security;
alter table public.funnel_experiment_variants enable row level security;
alter table public.funnel_visitor_assignments enable row level security;
alter table public.funnel_events enable row level security;
alter table public.funnel_page_generation_runs enable row level security;
