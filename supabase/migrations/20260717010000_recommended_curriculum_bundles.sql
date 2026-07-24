ALTER TABLE public.native_workbook_bundles
  ADD COLUMN IF NOT EXISTS is_recommended_curriculum boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS native_workbook_bundles_recommendation_idx
  ON public.native_workbook_bundles(active, is_recommended_curriculum, created_at);

COMMENT ON COLUMN public.native_workbook_bundles.is_recommended_curriculum IS
  'Marks a published core bundle as Treeschool''s one-click recommended curriculum for matching student grades and language.';
