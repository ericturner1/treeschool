create table if not exists public.native_workbooks (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  subject_key text not null,
  subject_label text not null,
  grade_min integer not null check (grade_min between 0 and 12),
  grade_max integer not null check (grade_max between 0 and 12 and grade_max >= grade_min),
  language_code text not null default 'en',
  description text not null,
  coverage_tags text[] not null default array[]::text[],
  type billing_subject_type not null default 'core',
  price_in_cents integer not null check (price_in_cents >= 0),
  currency_code varchar(3) not null references public.currencies(code) on delete restrict,
  thumbnail_object_path text not null,
  status text not null default 'draft',
  active_version_id uuid,
  stripe_product_id text,
  stripe_price_id text,
  active boolean not null default false,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists native_workbooks_browse_idx
  on public.native_workbooks(active, grade_min, subject_key);

create table if not exists public.native_workbook_versions (
  id uuid primary key default gen_random_uuid(),
  workbook_id uuid not null references public.native_workbooks(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  original_filename text not null,
  object_path text not null,
  mime_type text not null default 'application/pdf',
  size_bytes integer not null check (size_bytes > 0),
  page_count integer not null default 0 check (page_count >= 0),
  content_fingerprint text,
  analysis_status text not null default 'queued',
  analysis_json jsonb not null default '{}'::jsonb,
  last_error text,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  indexed_at timestamptz,
  published_at timestamptz,
  constraint native_workbook_versions_workbook_version_unique unique (workbook_id, version_number)
);

create index if not exists native_workbook_versions_status_idx
  on public.native_workbook_versions(analysis_status);

alter table public.native_workbooks
  add constraint native_workbooks_active_version_fk
  foreign key (active_version_id)
  references public.native_workbook_versions(id)
  on delete set null;

create table if not exists public.native_workbook_jobs (
  id uuid primary key default gen_random_uuid(),
  workbook_version_id uuid not null unique references public.native_workbook_versions(id) on delete cascade,
  status text not null default 'queued',
  attempt_count integer not null default 0,
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  heartbeat_at timestamptz,
  worker_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists native_workbook_jobs_queue_idx
  on public.native_workbook_jobs(status, available_at);

create table if not exists public.native_workbook_purchases (
  id uuid primary key default gen_random_uuid(),
  workbook_id uuid not null references public.native_workbooks(id) on delete restrict,
  workbook_version_id uuid not null references public.native_workbook_versions(id) on delete restrict,
  account_id uuid references public.accounts(id) on delete set null,
  email text not null,
  stripe_checkout_session_id text not null unique,
  stripe_payment_intent_id text,
  amount_in_cents integer not null check (amount_in_cents >= 0),
  currency_code varchar(3) not null,
  status text not null default 'paid',
  delivery_status text not null default 'pending',
  delivery_error text,
  purchased_at timestamptz not null default now(),
  refunded_at timestamptz
);

create index if not exists native_workbook_purchases_account_idx
  on public.native_workbook_purchases(account_id, purchased_at);
create index if not exists native_workbook_purchases_email_idx
  on public.native_workbook_purchases(lower(email));

create table if not exists public.native_workbook_download_links (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references public.native_workbook_purchases(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  download_count integer not null default 0,
  last_downloaded_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists native_workbook_download_links_purchase_idx
  on public.native_workbook_download_links(purchase_id);

alter table public.content_documents
  add column if not exists native_workbook_version_id uuid
  references public.native_workbook_versions(id) on delete restrict;

create unique index if not exists content_documents_learning_year_native_workbook_unique
  on public.content_documents(learning_year_id, native_workbook_version_id)
  where native_workbook_version_id is not null and removed_at is null;

alter table public.model_usage_events
  add column if not exists native_workbook_version_id uuid
  references public.native_workbook_versions(id) on delete set null;

alter table public.model_usage_events
  add column if not exists native_workbook_job_id uuid
  references public.native_workbook_jobs(id) on delete set null;

create index if not exists model_usage_events_native_workbook_version_idx
  on public.model_usage_events(native_workbook_version_id, created_at);
