create table if not exists public.post_checkout_offers (
  id uuid primary key default gen_random_uuid(),
  source_checkout_session_id text not null,
  source_checkout_kind text not null,
  offer_key text not null,
  account_id uuid references public.accounts(id) on delete set null,
  email text not null,
  stripe_customer_id text,
  stripe_payment_method_id text,
  state text not null default 'shown',
  selected_variant text,
  stripe_payment_intent_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint post_checkout_offers_source_offer_unique
    unique (source_checkout_session_id, offer_key),
  constraint post_checkout_offers_payment_intent_unique
    unique (stripe_payment_intent_id),
  constraint post_checkout_offers_state_check
    check (state in (
      'shown',
      'declined',
      'downsell_shown',
      'accepted',
      'downsell_accepted',
      'checkout_required',
      'failed'
    )),
  constraint post_checkout_offers_variant_check
    check (
      selected_variant is null
      or selected_variant in ('full', 'starter')
    )
);

create index if not exists post_checkout_offers_account_idx
  on public.post_checkout_offers (account_id, created_at);
