update public.funnel_steps as container
set
  name = 'Sales Page A/B Test',
  updated_at = now()
where container.name = 'Live A/B landing page'
  and container.slug = 'live-ab-landing-page'
  and exists (
    select 1
    from public.funnel_steps as variant
    where variant.funnel_id = container.funnel_id
      and variant.settings_json ->> 'relationship' = 'experiment_variant'
      and variant.settings_json ->> 'parentStepSlug' = container.slug
      and variant.step_type = 'sales'
  );
