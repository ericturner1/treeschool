alter table public.native_workbook_versions
  add column if not exists edition_label text not null default '1st edition';
