-- Attendance master buckets are the curriculum subjects assigned to active
-- workbooks, not the broader reporting areas. Keep broad areas as metadata.

-- Repair the legacy free-text row that was incorrectly promoted to a custom
-- elective during the curriculum-area backfill. Its workbook master subject is
-- Japan / kokugo, whose parent-facing short label is the first native alias.
WITH kokugo_electives AS (
  SELECT DISTINCT
    elective.id AS elective_id,
    subject.academic_standard_key,
    subject.key AS subject_key,
    coalesce(subject.aliases[1], subject.label) AS subject_label,
    subject.curriculum_area_key
  FROM public.learning_year_custom_electives elective
  JOIN public.content_documents document
    ON document.learning_year_id = elective.learning_year_id
   AND document.document_role = 'student'
   AND document.removed_at IS NULL
  JOIN public.native_workbook_versions version
    ON version.id = document.native_workbook_version_id
  JOIN public.native_workbooks workbook
    ON workbook.id = version.workbook_id
  JOIN public.curriculum_subjects subject
    ON subject.id = workbook.curriculum_subject_id
   AND subject.academic_standard_key = 'japan'
   AND subject.key = 'kokugo'
  WHERE elective.normalized_label ~ '^カタカ(ナ|タ)[/／]漢字[/／]九九$'
)
UPDATE public.teacher_activity_events event
SET subject_key = 'master_subject:' || mapped.academic_standard_key || ':' || mapped.subject_key,
    subject_label = mapped.subject_label,
    metadata = (event.metadata - 'customElectiveId') || jsonb_build_object(
      'curriculumAreaKey', mapped.curriculum_area_key
    )
FROM kokugo_electives mapped
WHERE event.subject_key = 'custom_elective:' || mapped.elective_id::text;

WITH kokugo_electives AS (
  SELECT DISTINCT
    elective.id AS elective_id,
    subject.academic_standard_key,
    subject.key AS subject_key,
    coalesce(subject.aliases[1], subject.label) AS subject_label,
    subject.curriculum_area_key
  FROM public.learning_year_custom_electives elective
  JOIN public.content_documents document
    ON document.learning_year_id = elective.learning_year_id
   AND document.document_role = 'student'
   AND document.removed_at IS NULL
  JOIN public.native_workbook_versions version
    ON version.id = document.native_workbook_version_id
  JOIN public.native_workbooks workbook
    ON workbook.id = version.workbook_id
  JOIN public.curriculum_subjects subject
    ON subject.id = workbook.curriculum_subject_id
   AND subject.academic_standard_key = 'japan'
   AND subject.key = 'kokugo'
  WHERE elective.normalized_label ~ '^カタカ(ナ|タ)[/／]漢字[/／]九九$'
)
UPDATE public.attendance_entries attendance
SET subject_key = 'master_subject:' || mapped.academic_standard_key || ':' || mapped.subject_key,
    subject_label = mapped.subject_label,
    curriculum_area_key = mapped.curriculum_area_key
FROM kokugo_electives mapped
WHERE attendance.subject_key = 'custom_elective:' || mapped.elective_id::text;

WITH kokugo_electives AS (
  SELECT DISTINCT elective.id AS elective_id
  FROM public.learning_year_custom_electives elective
  JOIN public.content_documents document
    ON document.learning_year_id = elective.learning_year_id
   AND document.document_role = 'student'
   AND document.removed_at IS NULL
  JOIN public.native_workbook_versions version
    ON version.id = document.native_workbook_version_id
  JOIN public.native_workbooks workbook
    ON workbook.id = version.workbook_id
  JOIN public.curriculum_subjects subject
    ON subject.id = workbook.curriculum_subject_id
   AND subject.academic_standard_key = 'japan'
   AND subject.key = 'kokugo'
  WHERE elective.normalized_label ~ '^カタカ(ナ|タ)[/／]漢字[/／]九九$'
)
UPDATE public.learning_year_custom_electives elective
SET active = false,
    updated_at = now()
FROM kokugo_electives mapped
WHERE elective.id = mapped.elective_id;

-- Older manual entries were stored only against a broad area. When exactly one
-- active workbook master subject exists in that area for the school year, the
-- relationship is unambiguous and can be upgraded safely.
WITH active_subjects AS (
  SELECT DISTINCT
    document.learning_year_id,
    subject.academic_standard_key,
    subject.key AS subject_key,
    coalesce(
      CASE WHEN subject.academic_standard_key = 'japan' THEN subject.aliases[1] END,
      subject.label
    ) AS subject_label,
    subject.curriculum_area_key
  FROM public.content_documents document
  JOIN public.native_workbook_versions version
    ON version.id = document.native_workbook_version_id
  JOIN public.native_workbooks workbook
    ON workbook.id = version.workbook_id
  JOIN public.curriculum_subjects subject
    ON subject.id = workbook.curriculum_subject_id
   AND subject.active = true
  WHERE document.document_role = 'student'
    AND document.removed_at IS NULL
),
unique_area_subjects AS (
  SELECT
    learning_year_id,
    curriculum_area_key,
    min(academic_standard_key) AS academic_standard_key,
    min(subject_key) AS subject_key,
    min(subject_label) AS subject_label
  FROM active_subjects
  GROUP BY learning_year_id, curriculum_area_key
  HAVING count(*) = 1
)
UPDATE public.attendance_entries attendance
SET subject_key = 'master_subject:' || mapped.academic_standard_key || ':' || mapped.subject_key,
    subject_label = mapped.subject_label
FROM unique_area_subjects mapped
WHERE attendance.entry_kind = 'manual'
  AND attendance.learning_year_id = mapped.learning_year_id
  AND attendance.curriculum_area_key = mapped.curriculum_area_key
  AND (
    attendance.subject_key IS NULL
    OR attendance.subject_key = 'area:' || mapped.curriculum_area_key
  );

UPDATE public.teacher_activity_events event
SET subject_key = attendance.subject_key,
    subject_label = attendance.subject_label,
    metadata = (event.metadata - 'customElectiveId') || jsonb_build_object(
      'curriculumAreaKey', attendance.curriculum_area_key
    )
FROM public.attendance_entries attendance
WHERE attendance.entry_kind = 'manual'
  AND attendance.subject_key LIKE 'master_subject:%'
  AND event.event_type = 'attendance_manual'
  AND event.metadata->>'attendanceEntryId' = attendance.id::text;

COMMENT ON COLUMN public.attendance_entries.subject_key IS
  'Stable attendance subject identity. Workbook master buckets use master_subject:<academic-standard>:<curriculum-subject>; custom electives use custom_elective:<uuid>.';
