ALTER TABLE public.native_workbook_versions
  ADD COLUMN IF NOT EXISTS curriculum_coverage_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS curriculum_coverage_framework_version text,
  ADD COLUMN IF NOT EXISTS curriculum_coverage_profiled_at timestamptz;

CREATE INDEX IF NOT EXISTS native_workbook_versions_coverage_framework_idx
  ON public.native_workbook_versions(curriculum_coverage_framework_version)
  WHERE curriculum_coverage_profiled_at IS NOT NULL;

COMMENT ON COLUMN public.native_workbook_versions.curriculum_coverage_profile IS
  'Evidence-backed, grade-specific mapping from indexed learning units to a versioned Treeschool curriculum rubric. Percentages are calculated deterministically from this profile.';

COMMENT ON COLUMN public.native_workbook_versions.curriculum_coverage_framework_version IS
  'Version of the Treeschool curriculum-coverage rubric used to produce the stored profile.';
