-- Stripe Checkout is an external payment destination, not a Treeschool page.
-- Order bumps belong to an on-site order form instead of occupying journey steps.

alter table public.funnel_steps
  drop constraint if exists funnel_steps_step_type_check;

-- The first-grade purchase-choice page is already the real on-site order form.
update public.funnel_steps
set
  step_type = 'order_form',
  name = 'Order form',
  description = 'Confirms the primary offer and any optional additions before opening Stripe''s secure hosted checkout.',
  route_path = coalesce(route_path, '/first-grade-curriculum/choose'),
  public_path = coalesce(public_path, '/first-grade-curriculum/choose'),
  preview_path = coalesce(preview_path, '/first-grade-curriculum/choose?preview=1'),
  settings_json = coalesce(settings_json, '{}'::jsonb) || jsonb_build_object(
    'journeyNextAction', 'button',
    'orderForm', jsonb_build_object(
      'primaryProductId', (
        select id::text
        from public.native_workbook_bundles
        where active = true
          and is_recommended_curriculum = true
          and recommended_grade_level = 1
        order by created_at desc
        limit 1
      ),
      'orderBumpProductIds', coalesce((
        select jsonb_agg(id::text order by created_at desc)
        from public.native_workbook_bundles
        where active = true
          and title ilike '%beginner japanese%'
      ), '[]'::jsonb),
      'submitLabel', 'Continue to secure checkout'
    )
  ),
  updated_at = now()
where funnel_id = (select id from public.funnels where slug = 'first-grade-curriculum')
  and slug = 'purchase-choice';

-- The former external Stripe node duplicated the order form and is not a page.
delete from public.funnel_steps
where funnel_id = (select id from public.funnels where slug = 'first-grade-curriculum')
  and slug = 'stripe-checkout';

-- Other seeded checkout placeholders become editable on-site order forms.
update public.funnel_steps
set
  step_type = 'order_form',
  slug = regexp_replace(slug, '^stripe-checkout$', 'order-form'),
  name = case when lower(name) like '%stripe%' then 'Order form' else name end,
  description = 'Confirms the selected offer and optional additions before opening Stripe''s secure hosted checkout.',
  source_type = case when source_type = 'external' then 'generated' else source_type end,
  source_ref = case when source_ref like 'stripe_%' then null else source_ref end,
  settings_json = coalesce(settings_json, '{}'::jsonb) || jsonb_build_object(
    'journeyNextAction', 'button',
    'orderForm', jsonb_build_object(
      'primaryProductId', null,
      'orderBumpProductIds', '[]'::jsonb,
      'submitLabel', 'Continue to secure checkout'
    )
  ),
  updated_at = now()
where step_type = 'checkout';

-- Any older standalone bump is now an order form configuration surface.
update public.funnel_steps
set step_type = 'order_form', updated_at = now()
where step_type = 'order_bump';

alter table public.funnel_steps
  add constraint funnel_steps_step_type_check
  check (step_type in (
    'landing',
    'sales',
    'order_form',
    'upsell',
    'downsell',
    'thank_you',
    'redirect',
    'fulfillment'
  ));

comment on column public.funnel_steps.step_type is
  'Treeschool-owned journey page type. Stripe Checkout is an external destination; order bumps are configured inside order_form settings.';
