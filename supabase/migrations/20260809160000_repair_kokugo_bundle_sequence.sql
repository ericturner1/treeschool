-- 国語D was accidentally linked to the legacy US-catalog workbook "Japanese C".
-- Repair the catalog chain and any active learning-year attachments where both
-- 国語C and 国語D are present. Existing plans remain untouched until the parent
-- explicitly approves a replan.

update native_workbooks as dependent
set prerequisite_workbook_id = prerequisite.id,
    updated_at = now()
from native_workbooks as prerequisite
where dependent.slug = 'grade-1-core-国語d-workbook-ja'
  and prerequisite.slug = 'grade-1-core-国語c-workbook-ja'
  and dependent.prerequisite_workbook_id is distinct from prerequisite.id;

with dependent_attachments as (
  select
    document.learning_year_id,
    document.material_set_id
  from content_documents as document
  inner join native_workbook_versions as version
    on version.id = document.native_workbook_version_id
  inner join native_workbooks as workbook
    on workbook.id = version.workbook_id
  where workbook.slug = 'grade-1-core-国語d-workbook-ja'
    and document.removed_at is null
), prerequisite_attachments as (
  select
    document.learning_year_id,
    document.material_set_id
  from content_documents as document
  inner join native_workbook_versions as version
    on version.id = document.native_workbook_version_id
  inner join native_workbooks as workbook
    on workbook.id = version.workbook_id
  where workbook.slug = 'grade-1-core-国語c-workbook-ja'
    and document.removed_at is null
), repaired as (
  update learning_year_material_sets as material_set
  set prerequisite_material_set_id = prerequisite.material_set_id,
      updated_at = now()
  from dependent_attachments as dependent
  inner join prerequisite_attachments as prerequisite
    on prerequisite.learning_year_id = dependent.learning_year_id
  where material_set.id = dependent.material_set_id
    and material_set.prerequisite_material_set_id is distinct from prerequisite.material_set_id
  returning dependent.learning_year_id
)
update learning_years as learning_year
set materials_updated_at = now(),
    curriculum_completeness_input_fingerprint = null,
    curriculum_completeness_reviewed_at = null,
    updated_at = now()
where learning_year.id in (select learning_year_id from repaired);
