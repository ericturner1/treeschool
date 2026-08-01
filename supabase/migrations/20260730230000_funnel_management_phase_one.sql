create table if not exists public.funnels (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  badge_label text,
  audience text not null default '',
  objective text not null default '',
  status text not null default 'draft'
    check (status in ('draft', 'live', 'paused', 'archived')),
  public_path text,
  created_by_user_id uuid references public.users(id) on delete set null,
  updated_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists funnels_status_updated_idx
  on public.funnels(status, updated_at);

create table if not exists public.funnel_steps (
  id uuid primary key default gen_random_uuid(),
  funnel_id uuid not null references public.funnels(id) on delete cascade,
  slug text not null,
  name text not null,
  description text not null default '',
  step_type text not null default 'landing'
    check (step_type in (
      'landing',
      'sales',
      'checkout',
      'order_bump',
      'upsell',
      'downsell',
      'thank_you',
      'redirect',
      'fulfillment'
    )),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'inactive')),
  source_type text not null default 'code'
    check (source_type in ('code', 'generated', 'external', 'runtime')),
  source_ref text,
  public_path text,
  preview_path text,
  link_label text,
  display_order integer not null default 0,
  is_top_of_funnel boolean not null default false,
  settings_json jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references public.users(id) on delete set null,
  updated_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint funnel_steps_funnel_slug_unique unique (funnel_id, slug)
);

create index if not exists funnel_steps_funnel_order_idx
  on public.funnel_steps(funnel_id, display_order);

create index if not exists funnel_steps_funnel_status_idx
  on public.funnel_steps(funnel_id, status);

create unique index if not exists funnel_steps_one_top_idx
  on public.funnel_steps(funnel_id)
  where is_top_of_funnel;

alter table public.funnels enable row level security;
alter table public.funnel_steps enable row level security;

comment on table public.funnels is
  'Administrative source of truth for Treeschool marketing and sales funnels.';
comment on table public.funnel_steps is
  'Ordered funnel steps. Phase one records existing code, runtime, and external steps without changing their public routes.';
comment on column public.funnel_steps.source_ref is
  'Stable implementation reference for code-backed, generated, external, or runtime steps.';
comment on column public.funnel_steps.settings_json is
  'Forward-compatible step configuration; customer routing remains code-backed during phase one.';

insert into public.funnels (
  slug,
  name,
  badge_label,
  audience,
  objective,
  status,
  public_path
)
values
  (
    'first-grade-curriculum',
    'First-grade curriculum',
    'Primary launch funnel',
    'Parents looking for a complete, printable first-grade curriculum.',
    'Sell the core curriculum once or convert the parent to a Treeschool membership.',
    'live',
    '/first-grade-curriculum'
  ),
  (
    'first-time-homeschooler',
    'First-time homeschooler',
    'Audience funnel',
    'Parents preparing to homeschool a first grader for the first time.',
    'Build confidence, explain the paper-based system, and lead the parent toward a Treeschool plan.',
    'live',
    '/first-grade-homeschool'
  ),
  (
    'switch-to-paper',
    'Switch to paper-based homeschool',
    'Audience funnel',
    'Families already homeschooling who want less screen time, a calmer routine, or a lower-cost alternative.',
    'Position Treeschool as the practical paper-based replacement for a screen-heavy homeschool platform.',
    'live',
    '/switch-to-paper-based-homeschool'
  ),
  (
    'no-subscription',
    'Homeschool without a subscription',
    'One-time purchase funnel',
    'Parents who want printable curriculum but do not want another recurring subscription.',
    'Sell standalone workbooks and bundles while introducing Treeschool''s broader paper-based approach.',
    'live',
    '/homeschool-without-a-subscription'
  )
on conflict (slug) do nothing;

insert into public.funnel_steps (
  funnel_id,
  slug,
  name,
  description,
  step_type,
  status,
  source_type,
  source_ref,
  public_path,
  preview_path,
  link_label,
  display_order,
  is_top_of_funnel
)
select
  f.id,
  seed.step_slug,
  seed.step_name,
  seed.description,
  seed.step_type,
  'active',
  seed.source_type,
  seed.source_ref,
  seed.public_path,
  seed.preview_path,
  seed.link_label,
  seed.display_order,
  seed.is_top
from public.funnels f
join (
  values
    (
      'first-grade-curriculum', 'live-ab-landing-page', 'Live A/B landing page',
      'Assigns each new visitor persistently to one of two sales-page variants and carries that assignment through checkout.',
      'landing', 'code', 'first_grade_curriculum_experiment',
      '/first-grade-curriculum', '/first-grade-curriculum', 'Open live experiment', 10, true
    ),
    (
      'first-grade-curriculum', 'variant-a-concise-visual-page', 'Variant A · concise visual page',
      'The shorter, highly visual control page leads with the complete offer, actual workbooks, subject coverage, and fast answers.',
      'sales', 'code', 'first_grade_curriculum_variant_a',
      null, '/first-grade-curriculum?preview_variant=a', 'Preview Variant A', 20, false
    ),
    (
      'first-grade-curriculum', 'variant-b-direct-response-page', 'Variant B · direct-response page',
      'The longer challenger page develops the parent''s planning and screen-time problems before presenting the same curriculum and checkout.',
      'sales', 'code', 'first_grade_curriculum_variant_b',
      null, '/first-grade-curriculum?preview_variant=b', 'Preview Variant B', 30, false
    ),
    (
      'first-grade-curriculum', 'detailed-curriculum-page', 'Detailed curriculum page',
      'Gives parents who want more detail the complete workbook list, curriculum coverage, and a fuller product comparison.',
      'sales', 'code', 'first_grade_homeschool_curriculum_detail',
      '/first-grade-homeschool-curriculum', '/first-grade-homeschool-curriculum', 'Open detailed page', 40, false
    ),
    (
      'first-grade-curriculum', 'purchase-choice', 'Purchase choice',
      'An order-bump dialog asks whether the parent wants the curriculum alone or the curriculum with Treeschool planning and records.',
      'order_bump', 'code', 'first_grade_curriculum_checkout_choice',
      '/first-grade-curriculum', '/first-grade-curriculum', 'Open offer page', 50, false
    ),
    (
      'first-grade-curriculum', 'stripe-checkout', 'Stripe checkout',
      'Stripe securely completes either the one-time curriculum purchase or the selected membership checkout.',
      'checkout', 'external', 'stripe_checkout',
      null, null, null, 60, false
    ),
    (
      'first-grade-curriculum', 'beginner-japanese-upsell', 'Beginner Japanese upsell',
      'Offers the complete Beginner Japanese PDF workbook bundle as a separate one-time addition.',
      'upsell', 'code', 'first_grade_japanese_upsell',
      '/offers/us/first-grade-japanese', '/admin/funnels/first-grade-curriculum/upsell', 'Preview upsell', 70, false
    ),
    (
      'first-grade-curriculum', 'japanese-a-downsell', 'Japanese A downsell',
      'If the bundle is declined, offers the first Japanese workbook by itself at a lower entry price.',
      'downsell', 'code', 'first_grade_japanese_downsell',
      '/offers/ds/first-grade-japanese', '/admin/funnels/first-grade-curriculum/downsell', 'Preview downsell', 80, false
    ),
    (
      'first-grade-curriculum', 'thank-you-and-fulfillment', 'Thank you and fulfillment',
      'Confirms the order, emails secure PDF download links, grants account access, and starts membership setup when applicable.',
      'fulfillment', 'runtime', 'purchase_fulfillment',
      '/after-purchase', null, null, 90, false
    ),
    (
      'first-time-homeschooler', 'landing-page', 'Landing page',
      'Answers the beginner parent''s first questions and presents a clear way to begin first grade.',
      'landing', 'code', 'first_grade_homeschool_landing',
      '/first-grade-homeschool', '/first-grade-homeschool', 'Open landing page', 10, true
    ),
    (
      'first-time-homeschooler', 'plans', 'Plans',
      'Compares Single and Standard membership options and explains the introductory first month.',
      'sales', 'code', 'pricing',
      '/pricing', '/pricing', 'Open plans', 20, false
    ),
    (
      'first-time-homeschooler', 'stripe-checkout', 'Stripe checkout',
      'Collects payment details and creates the selected recurring membership.',
      'checkout', 'external', 'stripe_membership_checkout',
      null, null, null, 30, false
    ),
    (
      'first-time-homeschooler', 'account-setup', 'Account setup',
      'The parent signs in, adds a student, selects the curriculum, and begins building the school year.',
      'fulfillment', 'runtime', 'membership_account_setup',
      '/p/dashboard', null, null, 40, false
    ),
    (
      'switch-to-paper', 'landing-page', 'Landing page',
      'Names the screen-time problem and shows how printable workbooks and weekly plans change the daily experience.',
      'landing', 'code', 'switch_to_paper_landing',
      '/switch-to-paper-based-homeschool', '/switch-to-paper-based-homeschool', 'Open landing page', 10, true
    ),
    (
      'switch-to-paper', 'plans', 'Plans',
      'Lets the parent compare the student and teacher limits of the available memberships.',
      'sales', 'code', 'pricing',
      '/pricing', '/pricing', 'Open plans', 20, false
    ),
    (
      'switch-to-paper', 'stripe-checkout', 'Stripe checkout',
      'Completes the selected membership purchase securely.',
      'checkout', 'external', 'stripe_membership_checkout',
      null, null, null, 30, false
    ),
    (
      'switch-to-paper', 'move-the-school-year', 'Move the school year',
      'The parent adds Treeschool or existing PDF workbooks and creates a printable lesson plan without losing the paper-first routine.',
      'fulfillment', 'runtime', 'paper_plan_setup',
      '/p/dashboard', null, null, 40, false
    ),
    (
      'no-subscription', 'landing-page', 'Landing page',
      'Leads with ownership, printable PDFs, and the freedom to buy without beginning a membership.',
      'landing', 'code', 'no_subscription_landing',
      '/homeschool-without-a-subscription', '/homeschool-without-a-subscription', 'Open landing page', 10, true
    ),
    (
      'no-subscription', 'bookstore', 'Bookstore',
      'Lets the parent browse available grades, subjects, individual workbooks, and bundles.',
      'sales', 'code', 'bookstore',
      '/bookstore', '/bookstore', 'Open bookstore', 20, false
    ),
    (
      'no-subscription', 'product-detail', 'Product detail',
      'Explains the workbook or bundle, previews its pages, and collects the delivery email.',
      'sales', 'runtime', 'bookstore_product_detail',
      null, null, null, 30, false
    ),
    (
      'no-subscription', 'stripe-checkout', 'Stripe checkout',
      'Completes the one-time purchase without creating a recurring charge.',
      'checkout', 'external', 'stripe_bookstore_checkout',
      null, null, null, 40, false
    ),
    (
      'no-subscription', 'email-delivery', 'Email delivery',
      'Emails secure PDF download links and keeps owned workbooks available in the parent''s account.',
      'fulfillment', 'runtime', 'bookstore_delivery',
      '/bookstore/success', null, null, 50, false
    )
  ) as seed (
    funnel_slug,
    step_slug,
    step_name,
    description,
    step_type,
    source_type,
    source_ref,
    public_path,
    preview_path,
    link_label,
    display_order,
    is_top
  )
  on seed.funnel_slug = f.slug
on conflict (funnel_id, slug) do nothing;
