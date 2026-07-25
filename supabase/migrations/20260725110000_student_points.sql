create table if not exists public.student_point_settings (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  singular_name text not null default 'point',
  plural_name text not null default 'points',
  icon_key text not null default 'star',
  auto_award_lesson_completion boolean not null default false,
  updated_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_point_settings_singular_name_valid
    check (length(btrim(singular_name)) between 1 and 30),
  constraint student_point_settings_plural_name_valid
    check (length(btrim(plural_name)) between 1 and 30),
  constraint student_point_settings_icon_key_valid
    check (icon_key in ('star', 'spark', 'gem', 'leaf', 'heart', 'trophy'))
);

create table if not exists public.student_point_transactions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  amount integer not null,
  kind text not null,
  reason text not null,
  source_type text,
  source_key text,
  created_by_user_id uuid references public.users(id) on delete set null,
  reversed_at timestamptz,
  reversed_by_user_id uuid references public.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_point_transactions_amount_nonzero
    check (amount <> 0),
  constraint student_point_transactions_kind_valid
    check (kind in ('award', 'redemption', 'lesson_completion')),
  constraint student_point_transactions_reason_valid
    check (length(btrim(reason)) between 1 and 300),
  constraint student_point_transactions_source_pair
    check (
      (source_type is null and source_key is null)
      or
      (source_type is not null and source_key is not null)
    )
);

create index if not exists student_point_transactions_profile_created_idx
  on public.student_point_transactions (profile_id, created_at desc);

create unique index if not exists student_point_transactions_profile_source_unique
  on public.student_point_transactions (profile_id, source_type, source_key);

comment on table public.student_point_settings is
  'Per-student naming, icon, and automatic lesson-completion award preferences.';

comment on table public.student_point_transactions is
  'Auditable ledger of student point awards and redemptions. Reversed automatic awards remain recorded but do not affect balance.';
