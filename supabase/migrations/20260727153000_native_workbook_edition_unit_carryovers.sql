begin;

create table if not exists public.student_workbook_edition_unit_carryovers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  from_native_workbook_version_id uuid not null references public.native_workbook_versions(id) on delete restrict,
  from_source_unit_id text not null,
  to_native_workbook_version_id uuid not null references public.native_workbook_versions(id) on delete restrict,
  to_source_unit_id text not null,
  source_learning_year_id uuid references public.learning_years(id) on delete set null,
  source_weekly_plan_id uuid references public.weekly_plans(id) on delete set null,
  reason text not null,
  match_method text not null,
  created_at timestamptz not null default now(),
  constraint student_workbook_edition_carryovers_profile_target_unit_unique
    unique (profile_id, to_native_workbook_version_id, to_source_unit_id),
  constraint student_workbook_edition_carryovers_distinct_versions_check
    check (from_native_workbook_version_id <> to_native_workbook_version_id),
  constraint student_workbook_edition_carryovers_reason_check
    check (reason in ('preserved_week')),
  constraint student_workbook_edition_carryovers_match_method_check
    check (match_method in ('exact_id', 'exact_title'))
);

create index if not exists student_workbook_edition_carryovers_target_version_idx
  on public.student_workbook_edition_unit_carryovers (
    profile_id,
    to_native_workbook_version_id
  );

create index if not exists student_workbook_edition_carryovers_source_version_idx
  on public.student_workbook_edition_unit_carryovers (
    profile_id,
    from_native_workbook_version_id
  );

commit;
