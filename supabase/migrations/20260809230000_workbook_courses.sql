-- Add the missing grade curriculum -> course -> workbook hierarchy.
-- A course owns subject-level scope. Locale and split-series variants remain
-- separate workbook projects beneath that course.

create table public.workbook_courses (
  id uuid primary key default gen_random_uuid(),
  curriculum_id uuid not null
    references public.workbook_curricula(id) on delete cascade,
  stable_key text not null,
  curriculum_subject_id uuid not null
    references public.curriculum_subjects(id) on delete restrict,
  status text not null default 'new'
    check (status in ('inherited', 'modified', 'new', 'retired')),
  academic_standard_override_key text
    references public.academic_standards(key) on delete restrict,
  standard_code text,
  standard_label text,
  theme_override_version_id uuid
    references public.workbook_theme_versions(id) on delete restrict,
  boundary_notes text,
  coverage_notes text,
  pipeline_key text,
  created_by_user_id uuid references public.users(id) on delete set null,
  updated_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workbook_courses_curriculum_stable_key_unique
    unique (curriculum_id, stable_key),
  constraint workbook_courses_curriculum_subject_unique
    unique (curriculum_id, curriculum_subject_id)
);

create index workbook_courses_curriculum_status_idx
  on public.workbook_courses(curriculum_id, status, updated_at);

comment on table public.workbook_courses is
  'A subject-level course required by one grade curriculum. Workbook projects are locale, level, or split-series implementations of the course.';
comment on column public.workbook_courses.academic_standard_override_key is
  'Optional country or school-system override. Null inherits the curriculum academic standard.';
comment on column public.workbook_courses.standard_code is
  'Optional framework override within the effective academic system, for example NGSS for a US Science course.';

-- Reject a subject chosen from the wrong academic-system dictionary. The
-- framework code is intentionally separate: NGSS remains within the US system.
create function public.validate_workbook_course_subject_standard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  curriculum_standard_key text;
  subject_standard_key text;
begin
  select academic_standard_key
  into curriculum_standard_key
  from public.workbook_curricula
  where id = new.curriculum_id;

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

-- Materialize existing project subjects as courses before replacing the old
-- denormalized project columns. Production had no project rows at migration
-- authoring time, but this makes local/test databases forward-compatible.
insert into public.workbook_courses (
  curriculum_id,
  stable_key,
  curriculum_subject_id,
  status,
  created_by_user_id,
  updated_by_user_id
)
select distinct on (project.curriculum_id, subject.id)
  project.curriculum_id,
  subject.key,
  subject.id,
  'new',
  project.created_by_user_id,
  project.updated_by_user_id
from public.workbook_projects project
join public.workbook_curricula curriculum on curriculum.id = project.curriculum_id
join public.curriculum_subjects subject
  on subject.academic_standard_key = curriculum.academic_standard_key
 and subject.key = project.subject_key
where project.curriculum_id is not null
on conflict (curriculum_id, curriculum_subject_id) do nothing;

-- Seed the real courses described by grade-2-curriculum-plan.md. These all
-- belong to the one English Grade 2 curriculum. Kokugo is a course with a
-- Japan-system override, not a separate grade curriculum.
insert into public.workbook_courses (
  id,
  curriculum_id,
  stable_key,
  curriculum_subject_id,
  status,
  academic_standard_override_key,
  standard_code,
  standard_label,
  boundary_notes,
  coverage_notes,
  pipeline_key
)
select
  seed.id::uuid,
  curriculum.id,
  seed.stable_key,
  subject.id,
  seed.status,
  nullif(seed.academic_standard_override_key, ''),
  nullif(seed.standard_code, ''),
  nullif(seed.standard_label, ''),
  nullif(seed.boundary_notes, ''),
  nullif(seed.coverage_notes, ''),
  seed.pipeline_key
from public.workbook_curricula curriculum
cross join (values
  (
    '43000000-0000-4000-8000-000000000001', 'mathematics', 'us', 'mathematics',
    'modified', '', 'CCSS', 'US Common Core',
    'Money arithmetic belongs here; Social Studies owns economic concepts without coin computation.',
    'Covers Grade 2 Operations and Algebraic Thinking, Base Ten, Measurement and Data, and Geometry, including locale-specific money and measurement variants.',
    'math'
  ),
  (
    '43000000-0000-4000-8000-000000000002', 'reading', 'us', 'reading',
    'modified', '', 'CCSS', 'US Common Core',
    'Reading owns comprehension of leveled texts; Phonics owns decoding and Writing & Grammar owns composition.',
    'Continues the Grade 1 Fountas and Pinnell progression with Levels J through M and Grade 2 RL/RI comprehension expectations.',
    'leveled-reader'
  ),
  (
    '43000000-0000-4000-8000-000000000003', 'phonics', 'us', 'phonics',
    'inherited', '', 'CCSS', 'US Common Core',
    'Phonics owns decoding; Reading owns comprehension; Spelling owns encoding of the same patterns.',
    'The existing Grade 1-2 Phonics B workbook spans this grade. Audit RF.2.3 details before deciding whether a replacement is needed.',
    'general'
  ),
  (
    '43000000-0000-4000-8000-000000000004', 'spelling', 'us', 'spelling',
    'modified', '', '', 'Typical US Grade 2 homeschool scope',
    'Spelling owns encoding, not decoding or composition and grammar instruction.',
    'Covers compound words, contractions, prefixes, suffixes, homophones, irregular plurals, and multisyllable spelling patterns.',
    'general'
  ),
  (
    '43000000-0000-4000-8000-000000000005', 'writing-and-grammar', 'us', 'writing-and-grammar',
    'modified', '', 'CCSS', 'US Common Core',
    'Excludes handwriting and spelling-pattern instruction, which belong to Phonics and Spelling.',
    'Covers Grade 2 grammar, mechanics, vocabulary strategies, opinion, informative, and narrative composition, plus guided revision.',
    'general'
  ),
  (
    '43000000-0000-4000-8000-000000000006', 'science', 'us', 'science',
    'modified', '', 'NGSS', 'Next Generation Science Standards',
    'Physical Earth-system processes belong here; Social Studies owns human geography and community map skills.',
    'Covers Grade 2 NGSS 2-PS1, 2-LS2, 2-LS4, 2-ESS1, and 2-ESS2.',
    'general'
  ),
  (
    '43000000-0000-4000-8000-000000000007', 'social-studies', 'us', 'social-studies',
    'modified', '', '', 'Typical US Grade 2 homeschool scope',
    'Owns economic concepts and human geography; Mathematics owns currency arithmetic and Science owns physical Earth processes.',
    'Covers communities and citizenship, map skills, economics, history, cultures, and symbols.',
    'general'
  ),
  (
    '43000000-0000-4000-8000-000000000008', 'kokugo', 'japan', 'kokugo',
    'modified', 'japan', 'MEXT', 'Japanese Course of Study (学習指導要領)',
    'Japanese native-language literacy is distinct from English Language Arts.',
    'Covers the Grade 2 allocation of 160 kyoiku-kanji and continued kana, sentence reading, and writing. The exact split-series workbook count remains a later course-planning decision.',
    'foreign-language'
  )
) as seed(
  id,
  stable_key,
  subject_standard_key,
  subject_key,
  status,
  academic_standard_override_key,
  standard_code,
  standard_label,
  boundary_notes,
  coverage_notes,
  pipeline_key
)
join public.curriculum_subjects subject
  on subject.academic_standard_key = seed.subject_standard_key
 and subject.key = seed.subject_key
where curriculum.slug = 'imported-us-grade-2-core'
on conflict (curriculum_id, curriculum_subject_id) do update set
  stable_key = excluded.stable_key,
  status = excluded.status,
  academic_standard_override_key = excluded.academic_standard_override_key,
  standard_code = excluded.standard_code,
  standard_label = excluded.standard_label,
  boundary_notes = excluded.boundary_notes,
  coverage_notes = excluded.coverage_notes,
  pipeline_key = excluded.pipeline_key,
  updated_at = now();

alter table public.workbook_projects add column course_id uuid;

update public.workbook_projects project
set course_id = course.id
from public.workbook_courses course
join public.curriculum_subjects subject on subject.id = course.curriculum_subject_id
where project.curriculum_id = course.curriculum_id
  and project.subject_key = subject.key;

-- If the unsupported Japan/Kokugo seed was used before this corrective
-- migration, retain those workbook projects by moving them under the real
-- Kokugo course before deleting the invented curriculum.
update public.workbook_projects project
set course_id = real_course.id
from public.workbook_curricula invented_curriculum
join public.workbook_courses invented_course
  on invented_course.curriculum_id = invented_curriculum.id
join public.curriculum_subjects invented_subject
  on invented_subject.id = invented_course.curriculum_subject_id
join public.workbook_curricula real_curriculum
  on real_curriculum.slug = 'imported-us-grade-2-core'
join public.workbook_courses real_course
  on real_course.curriculum_id = real_curriculum.id
join public.curriculum_subjects real_subject
  on real_subject.id = real_course.curriculum_subject_id
 and real_subject.academic_standard_key = 'japan'
 and real_subject.key = 'kokugo'
where invented_curriculum.slug = 'imported-japan-grade-2-kokugo'
  and project.curriculum_id = invented_curriculum.id
  and invented_subject.key = project.subject_key;

do $$
begin
  if exists (select 1 from public.workbook_projects where course_id is null) then
    raise exception 'Every Workbook Studio project must belong to a course before applying the course migration.';
  end if;
end
$$;

drop index if exists public.workbook_projects_curriculum_catalog_plan_key_unique;
drop index if exists public.workbook_projects_curriculum_status_idx;
alter table public.workbook_projects
  drop constraint if exists workbook_projects_curriculum_id_fkey,
  drop column curriculum_id,
  drop column subject_key,
  drop column subject_label,
  alter column course_id set not null,
  add constraint workbook_projects_course_id_fkey
    foreign key (course_id) references public.workbook_courses(id) on delete restrict;

create unique index workbook_projects_course_catalog_plan_key_unique
  on public.workbook_projects(course_id, catalog_plan_key)
  where catalog_plan_key is not null;
create index workbook_projects_course_status_idx
  on public.workbook_projects(course_id, status, updated_at);

-- Convert every legacy flat curriculum plan to schema v2, grouping workbook
-- variants under their materialized courses. Course rows are the current
-- relational identity; immutable revisions retain a full metadata snapshot.
update public.workbook_curriculum_revisions revision
set plan_json = (revision.plan_json - 'workbooks') || jsonb_build_object(
  'schemaVersion', 2,
  'courses', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'stableKey', course.stable_key,
        'curriculumSubjectId', course.curriculum_subject_id,
        'subjectKey', subject.key,
        'subjectLabel', subject.label,
        'status', course.status,
        'academicStandardOverrideKey', course.academic_standard_override_key,
        'standardCode', course.standard_code,
        'standardLabel', course.standard_label,
        'themeOverrideVersionId', course.theme_override_version_id,
        'boundaryNotes', coalesce(course.boundary_notes, ''),
        'coverageNotes', coalesce(course.coverage_notes, ''),
        'pipelineKey', course.pipeline_key,
        'workbooks', coalesce((
          select jsonb_agg(
            workbook - 'subjectKey' - 'subjectLabel'
            order by workbook->>'stableKey'
          )
          from jsonb_array_elements(
            coalesce(revision.plan_json->'workbooks', '[]'::jsonb)
          ) workbook
          where workbook->>'subjectKey' = subject.key
        ), '[]'::jsonb)
      )
      order by subject.display_order, subject.label
    )
    from public.workbook_courses course
    join public.curriculum_subjects subject
      on subject.id = course.curriculum_subject_id
    where course.curriculum_id = revision.curriculum_id
  ), '[]'::jsonb)
)
where revision.plan_json ? 'workbooks';

-- Remove the unsupported extrapolation. Revisions cascade, batches retain a
-- null curriculum reference, and any projects were moved above.
delete from public.workbook_curricula
where slug = 'imported-japan-grade-2-kokugo';

-- Give the three generation levels unambiguous names. "workbook_brief" is a
-- per-project scope brief; it is not the new Course entity.
alter table public.workbook_generation_prompts
  drop constraint if exists workbook_generation_prompts_kind_check;
update public.workbook_generation_prompts
set kind = 'workbook_brief'
where kind = 'curriculum';
alter table public.workbook_generation_prompts
  add constraint workbook_generation_prompts_kind_check
  check (kind in (
    'workflow', 'catalog_plan', 'workbook_brief', 'outline', 'lesson_content',
    'subject_overlay', 'layout_profile'
  ));

update public.workbook_generation_prompt_versions
set configuration_json = jsonb_set(
  configuration_json #- '{stagePromptVersionIds,curriculum}',
  '{stagePromptVersionIds,workbook_brief}',
  configuration_json #> '{stagePromptVersionIds,curriculum}',
  true
)
where configuration_json #> '{stagePromptVersionIds,curriculum}' is not null;

update public.workbook_generation_rule_versions
set stage = 'workbook_brief'
where stage = 'curriculum';

alter table public.workbook_studio_jobs
  drop constraint if exists workbook_studio_jobs_job_type_check;
update public.workbook_studio_jobs
set job_type = 'workbook_brief',
    result_json = case
      when result_json ? 'curriculum'
        then (result_json - 'curriculum') || jsonb_build_object('workbookBrief', result_json->'curriculum')
      else result_json
    end
where job_type = 'curriculum';
alter table public.workbook_studio_jobs
  add constraint workbook_studio_jobs_job_type_check
  check (job_type in (
    'catalog_plan', 'workbook_brief', 'outline', 'lesson_content',
    'validate', 'render', 'theme_cascade', 'release'
  ));

update public.workbook_generation_runs
set current_stage = 'workbook_brief'
where current_stage = 'curriculum';

alter table public.workbook_generation_batches
  drop constraint if exists workbook_generation_batches_kind_check;
update public.workbook_generation_batches
set kind = 'curriculum_fanout'
where kind = 'curriculum';
alter table public.workbook_generation_batches
  add constraint workbook_generation_batches_kind_check
  check (kind in (
    'single_workbook', 'grade_level', 'curriculum_fanout', 'theme_cascade'
  ));

-- Academic-system choice is explicit at the admin boundary. The DB default is
-- retained only for older integrations and defensive compatibility.
comment on column public.workbook_curricula.academic_standard_key is
  'Required academic-system profile. Admin creation must provide it explicitly; the US default is only a legacy DB safety net.';
