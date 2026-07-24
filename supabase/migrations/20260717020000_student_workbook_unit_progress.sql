create type public.workbook_unit_progress_status as enum (
  'completed',
  'mastered',
  'deferred'
);

create table public.student_workbook_unit_progress (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  native_workbook_version_id uuid not null references public.native_workbook_versions(id) on delete restrict,
  source_unit_id text not null,
  status public.workbook_unit_progress_status not null,
  source_learning_year_id uuid references public.learning_years(id) on delete set null,
  source_weekly_plan_id uuid references public.weekly_plans(id) on delete set null,
  selected_by_user_id uuid references public.users(id) on delete set null,
  recorded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_workbook_unit_progress_profile_version_unit_unique
    unique (profile_id, native_workbook_version_id, source_unit_id)
);

create index student_workbook_unit_progress_profile_status_idx
  on public.student_workbook_unit_progress(profile_id, status);
create index student_workbook_unit_progress_version_idx
  on public.student_workbook_unit_progress(native_workbook_version_id);

comment on table public.student_workbook_unit_progress is
  'Cross-year progress against canonical lessons in an exact pre-indexed Treeschool workbook version.';
comment on column public.student_workbook_unit_progress.source_unit_id is
  'Stable learningUnits[].id from the native workbook version analysis manifest.';

-- Preserve explicit Mastered and Later choices made before this durable ledger existed.
insert into public.student_workbook_unit_progress (
  profile_id,
  native_workbook_version_id,
  source_unit_id,
  status,
  source_learning_year_id,
  selected_by_user_id,
  recorded_at,
  updated_at
)
select
  disposition.profile_id,
  document.native_workbook_version_id,
  disposition.source_unit_id,
  case disposition.disposition
    when 'already_mastered' then 'mastered'::public.workbook_unit_progress_status
    else 'deferred'::public.workbook_unit_progress_status
  end,
  disposition.learning_year_id,
  disposition.selected_by_user_id,
  disposition.selected_at,
  disposition.updated_at
from public.student_lesson_dispositions disposition
join public.content_documents document on document.id = disposition.document_id
where document.native_workbook_version_id is not null
  and disposition.source_unit_id is not null
  and disposition.disposition in ('already_mastered', 'save_for_later')
on conflict (profile_id, native_workbook_version_id, source_unit_id)
do update set
  status = excluded.status,
  source_learning_year_id = excluded.source_learning_year_id,
  selected_by_user_id = excluded.selected_by_user_id,
  recorded_at = excluded.recorded_at,
  updated_at = excluded.updated_at;

-- A completed day/subject means every included canonical lesson in that block was done.
insert into public.student_workbook_unit_progress (
  profile_id,
  native_workbook_version_id,
  source_unit_id,
  status,
  source_learning_year_id,
  source_weekly_plan_id,
  selected_by_user_id,
  recorded_at,
  updated_at
)
select distinct on (
  year.profile_id,
  document.native_workbook_version_id,
  item.source_unit_id
)
  year.profile_id,
  document.native_workbook_version_id,
  item.source_unit_id,
  'completed'::public.workbook_unit_progress_status,
  year.id,
  week.id,
  attendance.created_by_user_id,
  attendance.created_at,
  attendance.created_at
from public.attendance_entries attendance
join public.attendance_entry_subjects attendance_subject
  on attendance_subject.attendance_entry_id = attendance.id
join public.weekly_plans week on week.id = attendance.weekly_plan_id
join public.learning_years year on year.id = week.learning_year_id
join public.weekly_plan_items item
  on item.weekly_plan_id = week.id
  and item.day_number = attendance.weekly_plan_day_number
join public.content_documents document on document.id = item.document_id
where attendance.entry_kind = 'plan_day'
  and document.native_workbook_version_id is not null
  and item.source_unit_id is not null
  and item.included_in_packet = true
  and attendance_subject.subject_key = case
    when document.subject_id is not null then 'system:' || document.subject_id::text
    else 'custom:' || coalesce(
      nullif(trim(both '-' from regexp_replace(lower(trim(coalesce(document.subject_label, document.label))), '[^a-z0-9]+', '-', 'g')), ''),
      'general'
    )
  end
order by
  year.profile_id,
  document.native_workbook_version_id,
  item.source_unit_id,
  attendance.created_at desc
on conflict (profile_id, native_workbook_version_id, source_unit_id)
do update set
  status = case
    when student_workbook_unit_progress.status = 'mastered' then student_workbook_unit_progress.status
    else excluded.status
  end,
  source_learning_year_id = excluded.source_learning_year_id,
  source_weekly_plan_id = excluded.source_weekly_plan_id,
  selected_by_user_id = excluded.selected_by_user_id,
  recorded_at = excluded.recorded_at,
  updated_at = excluded.updated_at;
