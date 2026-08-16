-- Let an elective Course own a multi-grade workbook series without pretending
-- it belongs to one grade-level Curriculum. Existing core courses retain their
-- Curriculum parent and receive explicit grade bounds copied from it.

alter table public.workbook_courses
  add column grade_min integer,
  add column grade_max integer,
  add column type public.billing_subject_type not null default 'core';

update public.workbook_courses course
set grade_min = curriculum.grade_level,
    grade_max = curriculum.grade_level
from public.workbook_curricula curriculum
where curriculum.id = course.curriculum_id;

alter table public.workbook_courses
  alter column grade_min set not null,
  alter column grade_max set not null,
  alter column curriculum_id drop not null,
  add constraint workbook_courses_grade_range_check
    check (grade_min between 0 and 20 and grade_max between grade_min and 20),
  add constraint workbook_courses_standalone_standard_check
    check (curriculum_id is not null or academic_standard_override_key is not null);

create unique index workbook_courses_standalone_stable_key_unique
  on public.workbook_courses(stable_key)
  where curriculum_id is null;

drop trigger if exists workbook_courses_subject_standard_check
  on public.workbook_courses;

create or replace function public.validate_workbook_course_subject_standard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  curriculum_standard_key text;
  subject_standard_key text;
begin
  if new.curriculum_id is not null then
    select academic_standard_key
    into curriculum_standard_key
    from public.workbook_curricula
    where id = new.curriculum_id;
  end if;

  select academic_standard_key
  into subject_standard_key
  from public.curriculum_subjects
  where id = new.curriculum_subject_id;

  if subject_standard_key is distinct from coalesce(
    new.academic_standard_override_key,
    curriculum_standard_key
  ) then
    raise exception 'The course subject must belong to its effective academic standard.';
  end if;
  return new;
end
$$;

create trigger workbook_courses_subject_standard_check
before insert or update of curriculum_id, curriculum_subject_id, academic_standard_override_key
on public.workbook_courses
for each row execute function public.validate_workbook_course_subject_standard();

comment on column public.workbook_courses.curriculum_id is
  'Nullable only for standalone elective series. Core grade-level courses retain a Curriculum parent.';
comment on column public.workbook_courses.grade_min is
  'Lowest intended learner grade for this course/series. Core courses are initially copied from their Curriculum grade.';
comment on column public.workbook_courses.grade_max is
  'Highest intended learner grade for this course/series.';
comment on column public.workbook_courses.type is
  'Core or elective classification for the entire course/series.';

alter table public.workbook_projects
  add column cover_image_object_path text,
  add column cover_image_alt text,
  add column cover_image_sha256 text;

comment on column public.workbook_projects.cover_image_object_path is
  'Private object path for the fixed cover-symbol image used by deterministic Workbook Studio rendering.';

alter table public.workbook_illustration_types
  add column wrapper_class text;

alter table public.workbook_illustration_types
  drop constraint if exists workbook_illustration_types_renderer_kind_check,
  add constraint workbook_illustration_types_renderer_kind_check
    check (renderer_kind in (
      'parameterized_svg', 'raw_svg', 'image_asset',
      'music_rhythm_boxes', 'music_guitar_chord', 'music_chord_chart'
    ));

comment on column public.workbook_illustration_types.wrapper_class is
  'Trusted renderer-owned CSS class used to preserve the layout semantics of a registered illustration family.';
