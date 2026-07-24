alter table public.native_workbook_purchases
  drop constraint if exists native_workbook_purchases_stripe_checkout_session_id_key;

alter table public.native_workbook_purchases
  drop constraint if exists native_workbook_purchases_checkout_unique;

alter table public.native_workbook_purchases
  add constraint native_workbook_purchases_checkout_workbook_unique
  unique (stripe_checkout_session_id, workbook_id);
