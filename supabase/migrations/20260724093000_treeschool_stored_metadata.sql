DO $$
DECLARE
  target record;
BEGIN
  FOR target IN
    SELECT *
    FROM (
      VALUES
        ('content_documents', 'analysis_json'),
        ('learning_years', 'curriculum_completeness_result'),
        ('native_workbook_versions', 'analysis_json'),
        ('native_workbook_versions', 'curriculum_coverage_profile'),
        ('plan_generation_diagnostics', 'error_details'),
        ('plan_pack_intakes', 'metadata_json'),
        ('plan_version_weeks', 'week_json'),
        ('plan_versions', 'snapshot_json'),
        ('plan_versions', 'metadata_quality_report'),
        ('weekly_plan_day_pdf_assets', 'quality_report'),
        ('weekly_plan_items', 'page_selection_audit'),
        ('weekly_plan_pdf_assets', 'quality_report')
    ) AS columns_to_update(table_name, column_name)
  LOOP
    EXECUTE format(
      'UPDATE public.%I
         SET %I = replace(
           replace(
             replace(%I::text, ''TreeSkool'', ''Treeschool''),
             ''Treeskool'',
             ''Treeschool''
           ),
           ''treeskool'',
           ''treeschool''
         )::jsonb
       WHERE %I::text ILIKE ''%%treeskool%%''',
      target.table_name,
      target.column_name,
      target.column_name,
      target.column_name
    );
  END LOOP;
END
$$;

UPDATE public.blog_post_revisions
SET
  title = replace(replace(replace(title, 'TreeSkool', 'Treeschool'), 'Treeskool', 'Treeschool'), 'treeskool', 'treeschool'),
  excerpt = replace(replace(replace(excerpt, 'TreeSkool', 'Treeschool'), 'Treeskool', 'Treeschool'), 'treeskool', 'treeschool'),
  content_html = replace(replace(replace(content_html, 'TreeSkool', 'Treeschool'), 'Treeskool', 'Treeschool'), 'treeskool', 'treeschool'),
  content_text = replace(replace(replace(content_text, 'TreeSkool', 'Treeschool'), 'Treeskool', 'Treeschool'), 'treeskool', 'treeschool'),
  seo_title = replace(replace(replace(seo_title, 'TreeSkool', 'Treeschool'), 'Treeskool', 'Treeschool'), 'treeskool', 'treeschool'),
  meta_description = replace(replace(replace(meta_description, 'TreeSkool', 'Treeschool'), 'Treeskool', 'Treeschool'), 'treeskool', 'treeschool'),
  canonical_url = replace(
    replace(canonical_url, 'www.treeskool.com', 'www.treehomeschool.com'),
    'treeskool',
    'treeschool'
  ),
  featured_image_alt = replace(
    replace(
      replace(featured_image_alt, 'TreeSkool', 'Treeschool'),
      'Treeskool',
      'Treeschool'
    ),
    'treeskool',
    'treeschool'
  )
WHERE concat_ws(
  ' ',
  title,
  excerpt,
  content_html,
  content_text,
  seo_title,
  meta_description,
  canonical_url,
  featured_image_alt
) ILIKE '%treeskool%';

UPDATE public.native_workbooks
SET
  title = replace(replace(replace(title, 'TreeSkool', 'Treeschool'), 'Treeskool', 'Treeschool'), 'treeskool', 'treeschool'),
  description = replace(replace(replace(description, 'TreeSkool', 'Treeschool'), 'Treeskool', 'Treeschool'), 'treeskool', 'treeschool')
WHERE concat_ws(' ', title, description) ILIKE '%treeskool%';

UPDATE public.native_workbook_bundles
SET
  title = replace(replace(replace(title, 'TreeSkool', 'Treeschool'), 'Treeskool', 'Treeschool'), 'treeskool', 'treeschool'),
  description = replace(replace(replace(description, 'TreeSkool', 'Treeschool'), 'Treeskool', 'Treeschool'), 'treeskool', 'treeschool')
WHERE concat_ws(' ', title, description) ILIKE '%treeskool%';
