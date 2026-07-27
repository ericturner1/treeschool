begin;

alter table public.student_workbook_edition_unit_carryovers
  drop constraint if exists student_workbook_edition_carryovers_profile_target_unit_unique;

alter table public.student_workbook_edition_unit_carryovers
  add constraint student_workbook_edition_carryovers_profile_year_target_unit_unique
    unique (
      profile_id,
      source_learning_year_id,
      to_native_workbook_version_id,
      to_source_unit_id
    );

commit;
