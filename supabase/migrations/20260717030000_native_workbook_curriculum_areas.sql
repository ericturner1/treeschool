ALTER TABLE public.native_workbooks
  ADD COLUMN IF NOT EXISTS curriculum_area_key text NOT NULL DEFAULT 'other';

UPDATE public.native_workbooks
SET curriculum_area_key = CASE
  WHEN lower(subject_key) ~ '(reading|phonics|spelling|writing|grammar|english|language-arts|handwriting|cursive|literature)'
    THEN 'language_arts'
  WHEN lower(subject_key) ~ '(math|arithmetic|algebra|geometry)'
    THEN 'mathematics'
  WHEN lower(subject_key) ~ '(science|biology|chemistry|physics|earth-science)'
    THEN 'science'
  WHEN lower(subject_key) ~ '(social|history|geography|civics|economics)'
    THEN 'social_studies'
  WHEN lower(subject_key) ~ '(japanese|spanish|french|german|mandarin|chinese|latin|world-language|foreign-language)'
    THEN 'world_languages'
  WHEN lower(subject_key) ~ '(art|music|dance|drama|theater|theatre)'
    THEN 'arts_and_music'
  WHEN lower(subject_key) ~ '(physical-education|health|fitness|sports)'
    THEN 'physical_education_and_health'
  WHEN lower(subject_key) ~ '(technology|computer|coding|programming|life-skills|home-economics|financial-literacy)'
    THEN 'technology_and_practical_skills'
  WHEN lower(subject_key) ~ '(religion|religious|bible|theology|faith)'
    THEN 'religious_studies'
  ELSE 'other'
END;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'native_workbooks_curriculum_area_key_check'
  ) THEN
    ALTER TABLE public.native_workbooks
      ADD CONSTRAINT native_workbooks_curriculum_area_key_check
      CHECK (curriculum_area_key IN (
        'language_arts',
        'mathematics',
        'science',
        'social_studies',
        'world_languages',
        'arts_and_music',
        'physical_education_and_health',
        'technology_and_practical_skills',
        'religious_studies',
        'other'
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS native_workbooks_curriculum_area_idx
  ON public.native_workbooks(active, curriculum_area_key, grade_min, grade_max);

COMMENT ON COLUMN public.native_workbooks.curriculum_area_key IS
  'Canonical broad curriculum area used for bookstore browsing, academic completeness checks, and reporting. The more specific subject remains in subject_key and subject_label.';
