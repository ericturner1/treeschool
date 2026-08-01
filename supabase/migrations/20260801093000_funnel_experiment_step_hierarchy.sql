update public.funnel_steps as variant
set settings_json = coalesce(variant.settings_json, '{}'::jsonb) || jsonb_build_object(
  'relationship', 'experiment_variant',
  'parentStepSlug', 'live-ab-landing-page'
)
from public.funnels as funnel
where variant.funnel_id = funnel.id
  and funnel.slug = 'first-grade-curriculum'
  and variant.slug in (
    'variant-a-concise-visual-page',
    'variant-b-direct-response-page'
  );

comment on column public.funnel_steps.settings_json is
  'Forward-compatible step configuration, including parentStepSlug and relationship=experiment_variant for display hierarchy.';
