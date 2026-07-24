COMMENT ON COLUMN public.native_workbook_bundles.is_recommended_curriculum IS
  'Marks a published core bundle as Treeschool''s one-click recommended curriculum for matching student grades and language.';

COMMENT ON TABLE public.student_workbook_unit_progress IS
  'Cross-year progress against canonical lessons in an exact pre-indexed Treeschool workbook version.';

COMMENT ON COLUMN public.native_workbook_versions.curriculum_coverage_profile IS
  'Evidence-backed, grade-specific mapping from indexed learning units to a versioned Treeschool curriculum rubric. Percentages are calculated deterministically from this profile.';

COMMENT ON COLUMN public.native_workbook_versions.curriculum_coverage_framework_version IS
  'Version of the Treeschool curriculum-coverage rubric used to produce the stored profile.';

COMMENT ON COLUMN public.profiles.account_role IS
  'Household permission role. Separate from profiles.role (parent/student) and profiles.is_admin (Treeschool system administrator).';

COMMENT ON TABLE public.curriculum_subjects IS
  'Curated Treeschool subject taxonomy. Subjects belong to a broad curriculum area and provide stable identifiers for catalog search, recommendations, and reporting.';
