alter table public.student_point_transactions
  add column if not exists balance_after integer;

with historical_balances as (
  select
    point_transaction.id,
    coalesce((
      select sum(prior_transaction.amount)
      from public.student_point_transactions as prior_transaction
      where prior_transaction.profile_id = point_transaction.profile_id
        and prior_transaction.created_at <= point_transaction.created_at
        and (
          prior_transaction.reversed_at is null
          or prior_transaction.reversed_at > point_transaction.created_at
        )
    ), 0)::integer as balance_after
  from public.student_point_transactions as point_transaction
)
update public.student_point_transactions as point_transaction
set balance_after = historical_balances.balance_after
from historical_balances
where point_transaction.id = historical_balances.id
  and point_transaction.balance_after is null;

create or replace function public.fill_student_point_balance_after()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  current_balance integer;
begin
  if new.balance_after is not null and not (
    tg_op = 'UPDATE'
    and old.reversed_at is not null
    and new.reversed_at is null
    and new.balance_after is not distinct from old.balance_after
  ) then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('student-points:' || new.profile_id::text));

  select coalesce(sum(point_transaction.amount), 0)::integer
  into current_balance
  from public.student_point_transactions as point_transaction
  where point_transaction.profile_id = new.profile_id
    and point_transaction.reversed_at is null
    and point_transaction.id is distinct from new.id;

  new.balance_after := current_balance + new.amount;
  return new;
end;
$$;

drop trigger if exists fill_student_point_balance_after
  on public.student_point_transactions;

create trigger fill_student_point_balance_after
before insert or update of reversed_at, created_at
on public.student_point_transactions
for each row
execute function public.fill_student_point_balance_after();

alter table public.student_point_transactions
  alter column balance_after set not null;

comment on column public.student_point_transactions.balance_after is
  'Student point balance immediately after this ledger action was recorded.';

comment on function public.fill_student_point_balance_after() is
  'Compatibility guard that calculates balance_after for older application revisions during rolling deployments.';
