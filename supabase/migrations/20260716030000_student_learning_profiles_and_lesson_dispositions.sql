create type public.lesson_disposition as enum (
  'include',
  'already_mastered',
  'save_for_later',
  'remove'
);

alter table public.profiles
  add column if not exists learning_profile_notes text,
  add column if not exists subject_strengths jsonb not null default '{}'::jsonb,
  add column if not exists learning_profile_updated_at timestamptz;

alter table public.weekly_plan_items
  add column if not exists base_included_in_packet boolean not null default true,
  add column if not exists lesson_disposition public.lesson_disposition not null default 'include';

update public.weekly_plan_items
set base_included_in_packet = included_in_packet;

create table if not exists public.student_lesson_dispositions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  learning_year_id uuid not null references public.learning_years(id) on delete cascade,
  document_id uuid not null references public.content_documents(id) on delete cascade,
  source_unit_key text not null,
  source_unit_id text,
  disposition public.lesson_disposition not null default 'include',
  concept_labels jsonb not null default '[]'::jsonb,
  selected_by_user_id uuid references public.users(id) on delete set null,
  selected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_lesson_dispositions_profile_document_unit_unique
    unique (profile_id, document_id, source_unit_key)
);

create index if not exists student_lesson_dispositions_learning_year_idx
  on public.student_lesson_dispositions(learning_year_id);

comment on column public.weekly_plan_items.base_included_in_packet is
  'Whether plan generation and quality control originally approved this range for printing.';
comment on column public.weekly_plan_items.lesson_disposition is
  'Parent-selected treatment of the containing lesson; separate from automatic page filtering.';
comment on table public.student_lesson_dispositions is
  'Durable parent lesson decisions reapplied when future weeks are regenerated.';
