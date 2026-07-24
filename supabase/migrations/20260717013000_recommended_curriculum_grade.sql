ALTER TABLE public.native_workbook_bundles
  ADD COLUMN IF NOT EXISTS recommended_grade_level integer;

ALTER TABLE public.native_workbook_bundles
  DROP CONSTRAINT IF EXISTS native_workbook_bundles_recommendation_grade_check;

ALTER TABLE public.native_workbook_bundles
  ADD CONSTRAINT native_workbook_bundles_recommendation_grade_check
  CHECK (
    (is_recommended_curriculum = false AND recommended_grade_level IS NULL)
    OR
    (is_recommended_curriculum = true AND recommended_grade_level BETWEEN 0 AND 12)
  );

DROP INDEX IF EXISTS public.native_workbook_bundles_recommendation_idx;

CREATE INDEX native_workbook_bundles_recommendation_idx
  ON public.native_workbook_bundles(active, is_recommended_curriculum, recommended_grade_level, created_at);

COMMENT ON COLUMN public.native_workbook_bundles.recommended_grade_level IS
  'The exact student grade for which an administrator recommends this curriculum bundle.';
