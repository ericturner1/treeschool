CREATE TABLE IF NOT EXISTS public.learning_year_custom_electives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learning_year_id uuid NOT NULL
    REFERENCES public.learning_years(id) ON DELETE CASCADE,
  label text NOT NULL,
  normalized_label text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT learning_year_custom_electives_label_check
    CHECK (length(trim(label)) > 0 AND length(trim(normalized_label)) > 0),
  CONSTRAINT learning_year_custom_electives_year_label_unique
    UNIQUE (learning_year_id, normalized_label)
);

CREATE INDEX IF NOT EXISTS learning_year_custom_electives_year_active_idx
  ON public.learning_year_custom_electives(learning_year_id, active, label);

ALTER TABLE public.learning_year_custom_electives ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON public.learning_year_custom_electives FROM anon, authenticated;

ALTER TABLE public.attendance_entries
  ADD COLUMN IF NOT EXISTS curriculum_area_key text;

ALTER TABLE public.attendance_entry_subjects
  ADD COLUMN IF NOT EXISTS curriculum_area_key text;

-- Prefer the catalog assignment for completed native-workbook lessons.
UPDATE public.attendance_entries AS attendance
SET curriculum_area_key = workbook.curriculum_area_key
FROM public.weekly_plan_items AS item
JOIN public.content_documents AS document ON document.id = item.document_id
JOIN public.native_workbook_versions AS version ON version.id = document.native_workbook_version_id
JOIN public.native_workbooks AS workbook ON workbook.id = version.workbook_id
WHERE attendance.weekly_plan_item_id = item.id
  AND attendance.curriculum_area_key IS NULL;

UPDATE public.attendance_entry_subjects AS entry_subject
SET curriculum_area_key = matched.curriculum_area_key
FROM (
  SELECT DISTINCT ON (entry_subject_inner.id)
    entry_subject_inner.id,
    workbook.curriculum_area_key
  FROM public.attendance_entry_subjects AS entry_subject_inner
  JOIN public.attendance_entries AS attendance
    ON attendance.id = entry_subject_inner.attendance_entry_id
  JOIN public.weekly_plan_items AS item
    ON item.weekly_plan_id = attendance.weekly_plan_id
   AND item.day_number = attendance.weekly_plan_day_number
  JOIN public.content_documents AS document ON document.id = item.document_id
  JOIN public.native_workbook_versions AS version ON version.id = document.native_workbook_version_id
  JOIN public.native_workbooks AS workbook ON workbook.id = version.workbook_id
  WHERE entry_subject_inner.curriculum_area_key IS NULL
    AND (
      lower(entry_subject_inner.subject_label) = lower(coalesce(document.subject_label, document.label))
      OR entry_subject_inner.subject_key = 'system:' || document.subject_id::text
    )
  ORDER BY entry_subject_inner.id, item.sort_order
) AS matched
WHERE entry_subject.id = matched.id;

-- Normalize legacy free-text subjects. The catalog-derived values above win.
UPDATE public.attendance_entries
SET curriculum_area_key = CASE
  WHEN lower(coalesce(subject_label, '')) ~ '(agriculture|farming|horticulture)' THEN 'agriculture'
  WHEN lower(coalesce(subject_label, '')) ~ '(business|entrepreneur|commerce|marketing)' THEN 'business_and_entrepreneurship'
  WHEN lower(coalesce(subject_label, '')) ~ '(religion|religious|bible|theology|faith)' THEN 'religious_studies'
  WHEN coalesce(subject_label, '') ~ '国語' OR lower(coalesce(subject_label, '')) ~ '(kokugo|language arts|reading|phonics|spelling|writing|grammar|english|literature|handwriting|cursive|composition|vocabulary)' THEN 'language_arts'
  WHEN coalesce(subject_label, '') ~ '(算数|数学)' OR lower(coalesce(subject_label, '')) ~ '(math|mathematics|arithmetic|algebra|geometry|calculus)' THEN 'mathematics'
  WHEN coalesce(subject_label, '') ~ '理科' OR lower(coalesce(subject_label, '')) ~ '(science|biology|chemistry|physics|earth science|astronomy)' THEN 'science'
  WHEN coalesce(subject_label, '') ~ '社会' OR lower(coalesce(subject_label, '')) ~ '(social studies|history|geography|civics|economics)' THEN 'social_studies'
  WHEN lower(coalesce(subject_label, '')) ~ '(japanese|spanish|french|german|mandarin|chinese|latin|world language|foreign language)' THEN 'world_languages'
  WHEN coalesce(subject_label, '') ~ '(音楽|美術|図工)' OR lower(coalesce(subject_label, '')) ~ '(art|music|dance|drama|theater|theatre)' THEN 'arts_and_music'
  WHEN coalesce(subject_label, '') ~ '(体育|保健)' OR lower(coalesce(subject_label, '')) ~ '(physical education|health|fitness|sport|wellness|nutrition)' THEN 'physical_education_and_health'
  WHEN coalesce(subject_label, '') ~ '(技術|家庭)' OR lower(coalesce(subject_label, '')) ~ '(technology|computer|coding|programming|robotics|engineering|life skills|home economics|financial literacy)' THEN 'technology_and_practical_skills'
  ELSE 'other'
END
WHERE curriculum_area_key IS NULL
  AND entry_kind IN ('manual', 'plan_item');

-- Legacy free-text subjects that did not map to a master area become stable,
-- reusable custom electives for that student's school year.
INSERT INTO public.learning_year_custom_electives (
  learning_year_id,
  label,
  normalized_label,
  created_by_user_id
)
SELECT DISTINCT ON (legacy.learning_year_id, legacy.normalized_label)
  legacy.learning_year_id,
  legacy.label,
  legacy.normalized_label,
  legacy.created_by_user_id
FROM (
  SELECT
    attendance.learning_year_id,
    trim(attendance.subject_label) AS label,
    regexp_replace(
      lower(trim(attendance.subject_label)),
      '[[:space:]]+',
      ' ',
      'g'
    ) AS normalized_label,
    attendance.created_by_user_id,
    attendance.created_at
  FROM public.attendance_entries AS attendance
  WHERE attendance.entry_kind = 'manual'
    AND attendance.learning_year_id IS NOT NULL
    AND attendance.curriculum_area_key = 'other'
    AND nullif(trim(attendance.subject_label), '') IS NOT NULL
    AND lower(trim(attendance.subject_label)) NOT IN ('other', 'uncategorized')
) AS legacy
ORDER BY legacy.learning_year_id, legacy.normalized_label, legacy.created_at
ON CONFLICT (learning_year_id, normalized_label) DO UPDATE
SET active = true,
    updated_at = now();

UPDATE public.attendance_entries AS attendance
SET subject_key = 'custom_elective:' || elective.id::text,
    subject_label = elective.label,
    curriculum_area_key = NULL
FROM public.learning_year_custom_electives AS elective
WHERE attendance.entry_kind = 'manual'
  AND attendance.learning_year_id = elective.learning_year_id
  AND attendance.curriculum_area_key = 'other'
  AND regexp_replace(
    lower(trim(attendance.subject_label)),
    '[[:space:]]+',
    ' ',
    'g'
  ) = elective.normalized_label;

UPDATE public.attendance_entry_subjects
SET curriculum_area_key = CASE
  WHEN lower(subject_label) ~ '(agriculture|farming|horticulture)' THEN 'agriculture'
  WHEN lower(subject_label) ~ '(business|entrepreneur|commerce|marketing)' THEN 'business_and_entrepreneurship'
  WHEN lower(subject_label) ~ '(religion|religious|bible|theology|faith)' THEN 'religious_studies'
  WHEN subject_label ~ '国語' OR lower(subject_label) ~ '(kokugo|language arts|reading|phonics|spelling|writing|grammar|english|literature|handwriting|cursive|composition|vocabulary)' THEN 'language_arts'
  WHEN subject_label ~ '(算数|数学)' OR lower(subject_label) ~ '(math|mathematics|arithmetic|algebra|geometry|calculus)' THEN 'mathematics'
  WHEN subject_label ~ '理科' OR lower(subject_label) ~ '(science|biology|chemistry|physics|earth science|astronomy)' THEN 'science'
  WHEN subject_label ~ '社会' OR lower(subject_label) ~ '(social studies|history|geography|civics|economics)' THEN 'social_studies'
  WHEN lower(subject_label) ~ '(japanese|spanish|french|german|mandarin|chinese|latin|world language|foreign language)' THEN 'world_languages'
  WHEN subject_label ~ '(音楽|美術|図工)' OR lower(subject_label) ~ '(art|music|dance|drama|theater|theatre)' THEN 'arts_and_music'
  WHEN subject_label ~ '(体育|保健)' OR lower(subject_label) ~ '(physical education|health|fitness|sport|wellness|nutrition)' THEN 'physical_education_and_health'
  WHEN subject_label ~ '(技術|家庭)' OR lower(subject_label) ~ '(technology|computer|coding|programming|robotics|engineering|life skills|home economics|financial literacy)' THEN 'technology_and_practical_skills'
  ELSE 'other'
END
WHERE curriculum_area_key IS NULL;

ALTER TABLE public.attendance_entry_subjects
  ALTER COLUMN curriculum_area_key SET DEFAULT 'other',
  ALTER COLUMN curriculum_area_key SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'attendance_entries_curriculum_area_key_check'
  ) THEN
    ALTER TABLE public.attendance_entries
      ADD CONSTRAINT attendance_entries_curriculum_area_key_check
      CHECK (
        curriculum_area_key IS NULL OR curriculum_area_key IN (
          'language_arts',
          'mathematics',
          'science',
          'social_studies',
          'world_languages',
          'arts_and_music',
          'physical_education_and_health',
          'technology_and_practical_skills',
          'agriculture',
          'business_and_entrepreneurship',
          'religious_studies',
          'other'
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'attendance_entry_subjects_curriculum_area_key_check'
  ) THEN
    ALTER TABLE public.attendance_entry_subjects
      ADD CONSTRAINT attendance_entry_subjects_curriculum_area_key_check
      CHECK (curriculum_area_key IN (
        'language_arts',
        'mathematics',
        'science',
        'social_studies',
        'world_languages',
        'arts_and_music',
        'physical_education_and_health',
        'technology_and_practical_skills',
        'agriculture',
        'business_and_entrepreneurship',
        'religious_studies',
        'other'
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS attendance_entries_profile_area_date_idx
  ON public.attendance_entries(profile_id, curriculum_area_key, attendance_date);

CREATE INDEX IF NOT EXISTS attendance_entry_subjects_area_idx
  ON public.attendance_entry_subjects(curriculum_area_key);

COMMENT ON COLUMN public.attendance_entries.curriculum_area_key IS
  'Canonical broad subject area for a single-subject attendance record. Plan-day records use attendance_entry_subjects because they may contain multiple subjects.';

COMMENT ON COLUMN public.attendance_entry_subjects.curriculum_area_key IS
  'Canonical broad subject area used to combine workbook lessons and other learning in attendance reporting.';

COMMENT ON TABLE public.learning_year_custom_electives IS
  'Account-defined reusable electives scoped to one student school year.';
