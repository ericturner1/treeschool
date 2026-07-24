alter table public.native_workbooks
  add column if not exists prerequisite_workbook_id uuid
  references public.native_workbooks(id) on delete set null;

alter table public.native_workbooks
  drop constraint if exists native_workbooks_not_self_prerequisite;

alter table public.native_workbooks
  add constraint native_workbooks_not_self_prerequisite
  check (prerequisite_workbook_id is null or prerequisite_workbook_id <> id);

create index if not exists native_workbooks_prerequisite_idx
  on public.native_workbooks(prerequisite_workbook_id)
  where prerequisite_workbook_id is not null;
