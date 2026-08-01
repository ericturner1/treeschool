begin;

alter table public.funnel_events
  alter column funnel_page_id drop not null,
  alter column funnel_page_revision_number drop not null;

comment on column public.funnel_events.funnel_page_id is
  'Managed page attribution when the funnel step is database-rendered; null for code-backed funnel pages.';

comment on column public.funnel_events.funnel_page_revision_number is
  'Managed page revision when applicable; null for code-backed funnel pages.';

commit;
