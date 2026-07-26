do $$
begin
  create type public.subscription_plan_tier as enum ('single', 'standard');
exception
  when duplicate_object then null;
end
$$;

alter table public.subscriptions
  add column if not exists plan_tier public.subscription_plan_tier;

update public.subscriptions
set plan_tier = 'standard'
where plan_tier is null;

alter table public.subscriptions
  alter column plan_tier set default 'standard',
  alter column plan_tier set not null;

comment on column public.subscriptions.plan_tier is
  'Paid membership capacity. Single includes one student; Standard includes up to three before additional student seats.';
