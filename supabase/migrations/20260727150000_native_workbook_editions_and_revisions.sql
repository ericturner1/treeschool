begin;

create table if not exists public.native_workbook_editions (
  id uuid primary key default gen_random_uuid(),
  workbook_id uuid not null references public.native_workbooks(id) on delete cascade,
  edition_number integer not null check (edition_number > 0),
  edition_label text not null,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'superseded', 'retired')),
  current_revision_id uuid,
  change_notes text,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  retired_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint native_workbook_editions_workbook_edition_unique
    unique (workbook_id, edition_number)
);

create index if not exists native_workbook_editions_status_idx
  on public.native_workbook_editions(workbook_id, status, edition_number);

alter table public.native_workbooks
  add column if not exists latest_edition_id uuid;

alter table public.native_workbook_versions
  add column if not exists edition_id uuid,
  add column if not exists revision_number integer,
  add column if not exists release_status text not null default 'draft',
  add column if not exists supersedes_version_id uuid,
  add column if not exists change_notes text,
  add column if not exists compatibility_report jsonb not null default '{}'::jsonb;

with edition_groups as (
  select
    workbook_id,
    coalesce(nullif(trim(edition_label), ''), '1st edition') as edition_label,
    dense_rank() over (
      partition by workbook_id
      order by min(created_at), coalesce(nullif(trim(edition_label), ''), '1st edition')
    )::integer as edition_number,
    min(created_at) as created_at,
    min(created_by_user_id::text)::uuid as created_by_user_id
  from public.native_workbook_versions
  group by workbook_id, coalesce(nullif(trim(edition_label), ''), '1st edition')
)
insert into public.native_workbook_editions (
  workbook_id,
  edition_number,
  edition_label,
  status,
  created_by_user_id,
  created_at,
  updated_at
)
select
  workbook_id,
  edition_number,
  edition_label,
  'draft',
  created_by_user_id,
  created_at,
  now()
from edition_groups
on conflict (workbook_id, edition_number) do nothing;

update public.native_workbook_versions version
set edition_id = edition.id
from public.native_workbook_editions edition
where edition.workbook_id = version.workbook_id
  and edition.edition_label = coalesce(nullif(trim(version.edition_label), ''), '1st edition')
  and version.edition_id is null;

with revision_numbers as (
  select
    id,
    row_number() over (
      partition by edition_id
      order by version_number, created_at, id
    )::integer as revision_number
  from public.native_workbook_versions
)
update public.native_workbook_versions version
set revision_number = numbered.revision_number
from revision_numbers numbered
where numbered.id = version.id
  and version.revision_number is null;

update public.native_workbook_versions version
set
  release_status = case
    when workbook.active_version_id = version.id then 'published'
    when version.analysis_status = 'ready' and version.published_at is not null then 'superseded'
    else 'draft'
  end
from public.native_workbooks workbook
where workbook.id = version.workbook_id;

update public.native_workbook_editions edition
set
  current_revision_id = workbook.active_version_id,
  status = case when workbook.active then 'published' else 'superseded' end,
  published_at = coalesce(active_version.published_at, active_version.indexed_at, active_version.created_at),
  updated_at = now()
from public.native_workbooks workbook
join public.native_workbook_versions active_version
  on active_version.id = workbook.active_version_id
where edition.id = active_version.edition_id;

update public.native_workbook_editions edition
set status = 'superseded', updated_at = now()
where status = 'draft'
  and exists (
    select 1
    from public.native_workbook_versions version
    where version.edition_id = edition.id
      and version.analysis_status = 'ready'
  );

update public.native_workbooks workbook
set latest_edition_id = version.edition_id
from public.native_workbook_versions version
where version.id = workbook.active_version_id
  and workbook.latest_edition_id is null;

alter table public.native_workbook_versions
  alter column edition_id set not null,
  alter column revision_number set not null;

alter table public.native_workbook_versions
  add constraint native_workbook_versions_edition_id_fkey
    foreign key (edition_id) references public.native_workbook_editions(id) on delete restrict,
  add constraint native_workbook_versions_supersedes_version_id_fkey
    foreign key (supersedes_version_id) references public.native_workbook_versions(id) on delete set null,
  add constraint native_workbook_versions_revision_number_check
    check (revision_number > 0),
  add constraint native_workbook_versions_release_status_check
    check (release_status in ('draft', 'published', 'superseded', 'rejected')),
  add constraint native_workbook_versions_edition_revision_unique
    unique (edition_id, revision_number);

alter table public.native_workbook_editions
  add constraint native_workbook_editions_current_revision_id_fkey
    foreign key (current_revision_id) references public.native_workbook_versions(id) on delete set null;

alter table public.native_workbooks
  add constraint native_workbooks_latest_edition_id_fkey
    foreign key (latest_edition_id) references public.native_workbook_editions(id) on delete set null;

create table if not exists public.weekly_plan_download_events (
  id uuid primary key default gen_random_uuid(),
  weekly_plan_id uuid not null references public.weekly_plans(id) on delete cascade,
  downloaded_by_user_id uuid references public.users(id) on delete set null,
  format text not null check (format in ('week', 'days')),
  layout text not null default 'standard' check (layout in ('standard', 'two-up')),
  source_fingerprint text,
  downloaded_at timestamptz not null default now()
);

create index if not exists weekly_plan_download_events_week_idx
  on public.weekly_plan_download_events(weekly_plan_id, downloaded_at);

create index if not exists weekly_plan_download_events_user_idx
  on public.weekly_plan_download_events(downloaded_by_user_id, downloaded_at);

comment on table public.native_workbook_editions is
  'Major workbook releases. Existing purchases and lesson plans remain pinned to their selected edition revision.';
comment on table public.native_workbook_versions is
  'Immutable workbook revisions. A compatible PDF correction creates a revision inside an edition; structural changes create a new edition.';
comment on table public.weekly_plan_download_events is
  'Immutable audit events used to freeze already-delivered weekly lesson content during edition upgrades and replanning.';

commit;
