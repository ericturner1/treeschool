alter table public.student_point_settings
  add column if not exists bank_interest_rate_basis_points integer not null default 100,
  add column if not exists bank_compounding_interval text not null default 'daily',
  add column if not exists bank_interest_remainder_micropoints integer not null default 0,
  add column if not exists bank_last_accrual_date date,
  add column if not exists bank_interest_anchor_day integer;

alter table public.student_point_settings
  drop constraint if exists student_point_settings_bank_interest_rate_valid,
  add constraint student_point_settings_bank_interest_rate_valid
    check (bank_interest_rate_basis_points between 1 and 1000),
  drop constraint if exists student_point_settings_bank_compounding_interval_valid,
  add constraint student_point_settings_bank_compounding_interval_valid
    check (bank_compounding_interval in ('daily', 'weekly', 'monthly')),
  drop constraint if exists student_point_settings_bank_interest_remainder_valid,
  add constraint student_point_settings_bank_interest_remainder_valid
    check (bank_interest_remainder_micropoints between 0 and 999999),
  drop constraint if exists student_point_settings_bank_interest_anchor_day_valid,
  add constraint student_point_settings_bank_interest_anchor_day_valid
    check (bank_interest_anchor_day is null or bank_interest_anchor_day between 1 and 31);

create table if not exists public.student_point_bank_transactions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  amount integer not null,
  kind text not null,
  reason text not null,
  source_type text,
  source_key text,
  created_by_user_id uuid references public.users(id) on delete set null,
  balance_after integer not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_point_bank_transactions_amount_nonzero check (amount <> 0),
  constraint student_point_bank_transactions_kind_valid check (kind in ('deposit', 'withdrawal', 'interest')),
  constraint student_point_bank_transactions_reason_valid check (length(btrim(reason)) between 1 and 300),
  constraint student_point_bank_transactions_source_pair check (
    (source_type is null and source_key is null)
    or
    (source_type is not null and source_key is not null)
  )
);

create index if not exists student_point_bank_transactions_profile_created_idx
  on public.student_point_bank_transactions (profile_id, created_at desc);

create unique index if not exists student_point_bank_transactions_profile_source_unique
  on public.student_point_bank_transactions (profile_id, source_type, source_key);

alter table public.student_point_transactions
  drop constraint if exists student_point_transactions_kind_valid;

alter table public.student_point_transactions
  add constraint student_point_transactions_kind_valid
    check (kind in ('award', 'redemption', 'lesson_completion', 'bank_deposit', 'bank_withdrawal'));

comment on column public.student_point_settings.bank_interest_rate_basis_points is
  'Interest rate per compounding period in basis points. 100 basis points equals 1 percent.';

comment on column public.student_point_settings.bank_compounding_interval is
  'How often banked points compound: daily, weekly, or monthly.';

comment on column public.student_point_settings.bank_interest_remainder_micropoints is
  'Fractional interest carried forward at one-millionth-of-a-point precision.';

comment on column public.student_point_settings.bank_last_accrual_date is
  'Last local student calendar date processed by the idempotent interest worker.';

comment on table public.student_point_bank_transactions is
  'Auditable ledger for points deposited into the bank, withdrawn, and earned as compound interest.';
