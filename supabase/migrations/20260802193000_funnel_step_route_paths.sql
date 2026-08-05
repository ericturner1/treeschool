alter table public.funnel_steps
  add column if not exists route_path text;

-- Managed pages used public_path before route ownership was separated from
-- legacy/code destinations. Preserve those existing public addresses.
update public.funnel_steps as step
set route_path = step.public_path
where step.route_path is null
  and step.public_path is not null
  and step.public_path like '/%'
  and exists (
    select 1
    from public.funnel_pages as page
    where page.funnel_step_id = step.id
  );

alter table public.funnel_steps
  drop constraint if exists funnel_steps_route_path_unique;

alter table public.funnel_steps
  add constraint funnel_steps_route_path_unique unique (route_path);

comment on column public.funnel_steps.route_path is
  'Globally unique, site-relative URL owned by this managed funnel step. Kept separate from legacy or external public_path destinations.';
