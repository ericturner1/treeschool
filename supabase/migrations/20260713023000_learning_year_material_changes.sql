alter table public.learning_years
  add column if not exists materials_updated_at timestamptz not null default now(),
  add column if not exists last_planned_at timestamptz;

update public.learning_years ly
set materials_updated_at = coalesce(
  (select max(cd.created_at) from public.content_documents cd where cd.learning_year_id = ly.id),
  ly.created_at
);

update public.learning_years ly
set last_planned_at = (
  select max(wp.created_at)
  from public.weekly_plans wp
  where wp.learning_year_id = ly.id
)
where exists (
  select 1 from public.weekly_plans wp where wp.learning_year_id = ly.id
);
