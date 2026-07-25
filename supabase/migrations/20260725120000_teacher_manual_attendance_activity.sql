create unique index if not exists teacher_activity_events_manual_attendance_entry_unique
  on public.teacher_activity_events ((metadata ->> 'attendanceEntryId'))
  where event_type = 'attendance_manual'
    and metadata ? 'attendanceEntryId';

insert into public.teacher_activity_events (
  account_id,
  actor_user_id,
  actor_profile_id,
  student_profile_id,
  event_type,
  subject_key,
  subject_label,
  metadata,
  occurred_at
)
select
  student.account_id,
  attendance.created_by_user_id,
  actor.id,
  attendance.profile_id,
  'attendance_manual',
  attendance.subject_key,
  attendance.subject_label,
  jsonb_strip_nulls(jsonb_build_object(
    'attendanceEntryId', attendance.id,
    'attendanceDate', attendance.attendance_date,
    'activityType', attendance.activity_type,
    'activityTitle', attendance.title,
    'minutes', attendance.minutes
  )),
  attendance.created_at
from public.attendance_entries as attendance
join public.profiles as student
  on student.id = attendance.profile_id
join public.profiles as actor
  on actor.user_id = attendance.created_by_user_id
  and actor.account_id = student.account_id
  and actor.role = 'PARENT'
where attendance.entry_kind = 'manual'
  and attendance.created_by_user_id is not null
on conflict do nothing;
