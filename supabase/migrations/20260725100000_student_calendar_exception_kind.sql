alter table public.student_calendar_exceptions
  add column if not exists exception_kind text not null default 'other';

alter table public.student_calendar_exceptions
  drop constraint if exists student_calendar_exceptions_kind_valid;

alter table public.student_calendar_exceptions
  add constraint student_calendar_exceptions_kind_valid
  check (exception_kind in ('holiday', 'school_break', 'vacation', 'personal_day', 'other'));
