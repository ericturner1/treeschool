create unique index if not exists teacher_activity_events_point_transaction_unique
  on public.teacher_activity_events ((metadata ->> 'pointTransactionId'))
  where event_type in ('points_awarded', 'points_used')
    and metadata ? 'pointTransactionId';

insert into public.teacher_activity_events (
  account_id,
  actor_user_id,
  actor_profile_id,
  student_profile_id,
  event_type,
  metadata,
  occurred_at
)
select
  student.account_id,
  point_transaction.created_by_user_id,
  actor.id,
  point_transaction.profile_id,
  case
    when point_transaction.kind = 'award' then 'points_awarded'
    else 'points_used'
  end,
  jsonb_build_object(
    'pointTransactionId', point_transaction.id,
    'pointsAmount', abs(point_transaction.amount),
    'pointsReason', point_transaction.reason,
    'pointSingularName', coalesce(point_settings.singular_name, 'point'),
    'pointPluralName', coalesce(point_settings.plural_name, 'points')
  ),
  point_transaction.created_at
from public.student_point_transactions as point_transaction
join public.profiles as student
  on student.id = point_transaction.profile_id
join public.profiles as actor
  on actor.user_id = point_transaction.created_by_user_id
  and actor.account_id = student.account_id
  and actor.role = 'PARENT'
left join public.student_point_settings as point_settings
  on point_settings.profile_id = point_transaction.profile_id
where point_transaction.kind in ('award', 'redemption')
  and point_transaction.created_by_user_id is not null
on conflict do nothing;
