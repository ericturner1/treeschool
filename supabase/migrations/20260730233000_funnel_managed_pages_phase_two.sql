create table if not exists public.funnel_pages (
  id uuid primary key default gen_random_uuid(),
  funnel_step_id uuid not null references public.funnel_steps(id) on delete cascade,
  slug text not null default 'control',
  name text not null,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  is_primary boolean not null default true,
  published_revision_number integer,
  created_by_user_id uuid references public.users(id) on delete set null,
  updated_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint funnel_pages_step_slug_unique unique (funnel_step_id, slug),
  constraint funnel_pages_published_revision_positive
    check (published_revision_number is null or published_revision_number > 0)
);

create index if not exists funnel_pages_step_status_idx
  on public.funnel_pages(funnel_step_id, status);

create unique index if not exists funnel_pages_one_primary_idx
  on public.funnel_pages(funnel_step_id)
  where is_primary;

create table if not exists public.funnel_page_revisions (
  id uuid primary key default gen_random_uuid(),
  funnel_page_id uuid not null references public.funnel_pages(id) on delete cascade,
  revision_number integer not null check (revision_number > 0),
  source text not null default 'manual'
    check (source in ('manual', 'ai', 'imported')),
  content_json jsonb not null default '{}'::jsonb,
  seo_json jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint funnel_page_revisions_page_revision_unique
    unique (funnel_page_id, revision_number)
);

create index if not exists funnel_page_revisions_page_created_idx
  on public.funnel_page_revisions(funnel_page_id, created_at);

alter table public.funnel_pages enable row level security;
alter table public.funnel_page_revisions enable row level security;

comment on table public.funnel_pages is
  'Managed variants for a funnel step. Phase two publishes only primary pages; later phases may route A/B variants.';
comment on table public.funnel_page_revisions is
  'Immutable structured funnel-page revisions used for safe preview, publishing, rollback, and future AI generation.';
comment on column public.funnel_pages.published_revision_number is
  'The immutable revision currently served publicly. Saving a newer draft never changes the live page.';
