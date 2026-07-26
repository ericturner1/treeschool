alter table public.subscriptions
  add column if not exists introductory_offer_ends_at timestamptz;

update public.subscriptions
set introductory_offer_ends_at = current_period_end
where introductory_offer = 'first_month_6_usd'
  and status = 'trialing'
  and introductory_offer_ends_at is null;

comment on column public.subscriptions.introductory_offer_ends_at is
  'Fixed end of the paid introductory offer. Unlike the subscription period end, this does not advance on renewal.';
