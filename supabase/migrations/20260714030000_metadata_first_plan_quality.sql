ALTER TABLE weekly_plan_items
  ADD COLUMN page_range_category text NOT NULL DEFAULT 'other',
  ADD COLUMN content_page_start integer,
  ADD COLUMN content_page_end integer;

ALTER TABLE weekly_plan_items
  ADD CONSTRAINT weekly_plan_items_page_range_category_check
    CHECK (page_range_category IN (
      'instruction',
      'guided_practice',
      'independent_practice',
      'review',
      'assessment',
      'reference',
      'teacher_support',
      'answer_key',
      'mixed',
      'other'
    )),
  ADD CONSTRAINT weekly_plan_items_pdf_page_indexes_check
    CHECK (first_page_index >= 0 AND last_page_index >= first_page_index),
  ADD CONSTRAINT weekly_plan_items_content_page_range_check
    CHECK (
      (content_page_start IS NULL AND content_page_end IS NULL)
      OR (
        content_page_start IS NOT NULL
        AND content_page_end IS NOT NULL
        AND content_page_start >= 0
        AND content_page_end >= content_page_start
      )
    ),
  ADD CONSTRAINT weekly_plan_items_sort_order_check CHECK (sort_order >= 0);

COMMENT ON COLUMN weekly_plan_items.first_page_index IS
  'Zero-based internal index of the physical PDF page. Admin manifests expose this as a one-based pdfPageNumber.';

COMMENT ON COLUMN weekly_plan_items.content_page_start IS
  'Optional first numeric page printed inside the source material, resolved from the document page-number mapping.';

ALTER TABLE plan_versions
  ADD COLUMN metadata_quality_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN metadata_quality_report jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN metadata_quality_checked_at timestamptz;

ALTER TABLE plan_versions
  ADD CONSTRAINT plan_versions_metadata_quality_status_check
    CHECK (metadata_quality_status IN ('pending', 'passed', 'failed'));
