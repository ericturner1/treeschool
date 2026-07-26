alter table public.post_checkout_offers
  add column if not exists stripe_checkout_session_id text;
