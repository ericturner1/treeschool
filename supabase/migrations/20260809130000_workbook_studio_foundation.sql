create table if not exists public.workbook_themes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null default '',
  status text not null default 'active'
    check (status in ('active', 'archived')),
  published_version_id uuid,
  created_by_user_id uuid references public.users(id) on delete set null,
  updated_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workbook_themes_status_idx
  on public.workbook_themes(status, updated_at);

create table if not exists public.workbook_theme_versions (
  id uuid primary key default gen_random_uuid(),
  theme_id uuid not null references public.workbook_themes(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  status text not null default 'draft'
    check (status in ('draft', 'published', 'retired')),
  color_ink text not null check (color_ink ~ '^#[0-9A-Fa-f]{6}$'),
  color_earth text not null check (color_earth ~ '^#[0-9A-Fa-f]{6}$'),
  color_leaf text not null check (color_leaf ~ '^#[0-9A-Fa-f]{6}$'),
  color_leaf_dark text not null check (color_leaf_dark ~ '^#[0-9A-Fa-f]{6}$'),
  color_cream text not null check (color_cream ~ '^#[0-9A-Fa-f]{6}$'),
  color_sand text not null check (color_sand ~ '^#[0-9A-Fa-f]{6}$'),
  color_canvas text not null check (color_canvas ~ '^#[0-9A-Fa-f]{6}$'),
  color_cover_accent text not null check (color_cover_accent ~ '^#[0-9A-Fa-f]{6}$'),
  color_cover_accent_soft text not null check (color_cover_accent_soft ~ '^#[0-9A-Fa-f]{6}$'),
  heading_font_family text not null,
  body_font_family text not null,
  page_size text not null default 'A4',
  page_margin_top_mm real not null check (page_margin_top_mm >= 0),
  page_margin_right_mm real not null check (page_margin_right_mm >= 0),
  page_margin_bottom_mm real not null check (page_margin_bottom_mm >= 0),
  page_margin_left_mm real not null check (page_margin_left_mm >= 0),
  first_page_margin_top_mm real not null check (first_page_margin_top_mm >= 0),
  first_page_margin_right_mm real not null check (first_page_margin_right_mm >= 0),
  first_page_margin_bottom_mm real not null check (first_page_margin_bottom_mm >= 0),
  first_page_margin_left_mm real not null check (first_page_margin_left_mm >= 0),
  body_font_size_pt real not null check (body_font_size_pt > 0),
  body_line_height real not null check (body_line_height > 0),
  raw_css_override text,
  compiled_css text,
  compiled_at timestamptz,
  source_json jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  constraint workbook_theme_versions_theme_version_unique
    unique (theme_id, version_number),
  constraint workbook_theme_versions_raw_css_reserved
    check (raw_css_override is null)
);

create index if not exists workbook_theme_versions_theme_status_idx
  on public.workbook_theme_versions(theme_id, status);

create table if not exists public.workbook_theme_component_tokens (
  id uuid primary key default gen_random_uuid(),
  theme_version_id uuid not null references public.workbook_theme_versions(id) on delete cascade,
  component_key text not null,
  tokens_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint workbook_theme_component_tokens_version_component_unique
    unique (theme_version_id, component_key)
);

alter table public.workbook_themes
  add constraint workbook_themes_published_version_fk
  foreign key (published_version_id)
  references public.workbook_theme_versions(id)
  on delete set null;

create table if not exists public.workbook_generation_prompts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null default '',
  kind text not null
    check (kind in (
      'workflow', 'catalog_plan', 'curriculum', 'outline', 'lesson_content',
      'subject_overlay', 'layout_profile'
    )),
  status text not null default 'active'
    check (status in ('active', 'archived')),
  published_version_id uuid,
  created_by_user_id uuid references public.users(id) on delete set null,
  updated_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workbook_generation_prompts_kind_status_idx
  on public.workbook_generation_prompts(kind, status, updated_at);

create table if not exists public.workbook_generation_prompt_versions (
  id uuid primary key default gen_random_uuid(),
  prompt_id uuid not null references public.workbook_generation_prompts(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  status text not null default 'draft'
    check (status in ('draft', 'published', 'retired')),
  prompt_text text not null,
  configuration_json jsonb not null default '{}'::jsonb,
  source_json jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  constraint workbook_generation_prompt_versions_prompt_version_unique
    unique (prompt_id, version_number)
);

alter table public.workbook_generation_prompts
  add constraint workbook_generation_prompts_published_version_fk
  foreign key (published_version_id)
  references public.workbook_generation_prompt_versions(id)
  on delete set null;

create table if not exists public.workbook_generation_rules (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null default '',
  rule_kind text not null,
  status text not null default 'active'
    check (status in ('active', 'archived')),
  published_version_id uuid,
  created_by_user_id uuid references public.users(id) on delete set null,
  updated_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workbook_generation_rules_kind_status_idx
  on public.workbook_generation_rules(rule_kind, status);

create table if not exists public.workbook_generation_rule_versions (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.workbook_generation_rules(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  status text not null default 'draft'
    check (status in ('draft', 'published', 'retired')),
  scope_type text not null default 'global'
    check (scope_type in ('global', 'subject', 'grade', 'subject_grade', 'language')),
  subject_key text,
  grade_min integer,
  grade_max integer,
  language_code text,
  stage text,
  enforcement text not null default 'prompt'
    check (enforcement in ('prompt', 'save_validator', 'publish_validator')),
  instruction_text text,
  parameters_json jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  constraint workbook_generation_rule_versions_rule_version_unique
    unique (rule_id, version_number),
  constraint workbook_generation_rule_versions_grade_order
    check (grade_min is null or grade_max is null or grade_min <= grade_max)
);

create index if not exists workbook_generation_rule_versions_applicability_idx
  on public.workbook_generation_rule_versions(status, subject_key, grade_min, grade_max, stage);

alter table public.workbook_generation_rules
  add constraint workbook_generation_rules_published_version_fk
  foreign key (published_version_id)
  references public.workbook_generation_rule_versions(id)
  on delete set null;

create table if not exists public.workbook_illustration_types (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text not null default '',
  subject_key text,
  status text not null default 'active'
    check (status in ('active', 'archived')),
  renderer_kind text not null default 'parameterized_svg'
    check (renderer_kind in ('parameterized_svg', 'raw_svg', 'image_asset')),
  parameter_schema_json jsonb not null default '{}'::jsonb,
  svg_template text,
  token_bindings_json jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workbook_illustration_types_template_required
    check (renderer_kind <> 'parameterized_svg' or svg_template is not null)
);

create index if not exists workbook_illustration_types_subject_status_idx
  on public.workbook_illustration_types(subject_key, status);

create table if not exists public.workbook_curricula (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  standard_code text,
  standard_label text,
  grade_level integer not null,
  language_code text not null default 'en',
  status text not null default 'draft'
    check (status in ('draft', 'review', 'published', 'archived')),
  default_theme_version_id uuid not null references public.workbook_theme_versions(id) on delete restrict,
  current_revision_id uuid,
  published_revision_id uuid,
  created_by_user_id uuid references public.users(id) on delete set null,
  updated_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workbook_curricula_browse_idx
  on public.workbook_curricula(status, grade_level, language_code);

create table if not exists public.workbook_curriculum_revisions (
  id uuid primary key default gen_random_uuid(),
  curriculum_id uuid not null references public.workbook_curricula(id) on delete cascade,
  revision_number integer not null check (revision_number > 0),
  source text not null default 'manual'
    check (source in ('manual', 'ai', 'imported')),
  plan_json jsonb not null default '{}'::jsonb,
  validation_json jsonb not null default '{}'::jsonb,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint workbook_curriculum_revisions_curriculum_revision_unique
    unique (curriculum_id, revision_number)
);

alter table public.workbook_curricula
  add constraint workbook_curricula_current_revision_fk
  foreign key (current_revision_id)
  references public.workbook_curriculum_revisions(id)
  on delete set null;

alter table public.workbook_curricula
  add constraint workbook_curricula_published_revision_fk
  foreign key (published_revision_id)
  references public.workbook_curriculum_revisions(id)
  on delete set null;

create table if not exists public.workbook_projects (
  id uuid primary key default gen_random_uuid(),
  curriculum_id uuid references public.workbook_curricula(id) on delete set null,
  native_workbook_id uuid unique references public.native_workbooks(id) on delete set null,
  catalog_plan_key text,
  slug text not null unique,
  title text not null,
  subject_key text not null,
  subject_label text not null,
  grade_min integer not null,
  grade_max integer not null,
  language_code text not null default 'en',
  locale_code text,
  layout_profile text not null default 'standard',
  script_profile text not null default 'latin',
  status text not null default 'draft'
    check (status in ('draft', 'generating', 'review', 'ready', 'released', 'archived')),
  theme_override_version_id uuid references public.workbook_theme_versions(id) on delete restrict,
  generation_prompt_version_id uuid references public.workbook_generation_prompt_versions(id) on delete set null,
  current_revision_id uuid,
  published_revision_id uuid,
  created_by_user_id uuid references public.users(id) on delete set null,
  updated_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workbook_projects_grade_order check (grade_min <= grade_max)
);

create unique index if not exists workbook_projects_curriculum_catalog_plan_key_unique
  on public.workbook_projects(curriculum_id, catalog_plan_key)
  where catalog_plan_key is not null;

create index if not exists workbook_projects_curriculum_status_idx
  on public.workbook_projects(curriculum_id, status, updated_at);

create table if not exists public.workbook_content_revisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.workbook_projects(id) on delete cascade,
  revision_number integer not null check (revision_number > 0),
  source text not null default 'manual'
    check (source in ('manual', 'ai', 'imported')),
  content_json jsonb not null default '{}'::jsonb,
  lesson_id_fingerprint text not null,
  validation_json jsonb not null default '{}'::jsonb,
  change_notes text,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint workbook_content_revisions_project_revision_unique
    unique (project_id, revision_number)
);

create index if not exists workbook_content_revisions_project_created_idx
  on public.workbook_content_revisions(project_id, created_at);

alter table public.workbook_projects
  add constraint workbook_projects_current_revision_fk
  foreign key (current_revision_id)
  references public.workbook_content_revisions(id)
  on delete set null;

alter table public.workbook_projects
  add constraint workbook_projects_published_revision_fk
  foreign key (published_revision_id)
  references public.workbook_content_revisions(id)
  on delete set null;

create table if not exists public.workbook_generation_batches (
  id uuid primary key default gen_random_uuid(),
  kind text not null
    check (kind in ('single_workbook', 'grade_level', 'curriculum', 'theme_cascade')),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'retry_wait', 'failed', 'completed', 'cancelled')),
  curriculum_id uuid references public.workbook_curricula(id) on delete set null,
  grade_level integer,
  language_code text,
  target_theme_version_id uuid references public.workbook_theme_versions(id) on delete set null,
  total_jobs integer not null default 0 check (total_jobs >= 0),
  completed_jobs integer not null default 0 check (completed_jobs >= 0),
  failed_jobs integer not null default 0 check (failed_jobs >= 0),
  input_json jsonb not null default '{}'::jsonb,
  requested_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index if not exists workbook_generation_batches_queue_idx
  on public.workbook_generation_batches(status, created_at);

create table if not exists public.workbook_generation_runs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.workbook_generation_batches(id) on delete set null,
  project_id uuid references public.workbook_projects(id) on delete set null,
  prompt_version_id uuid references public.workbook_generation_prompt_versions(id) on delete set null,
  provider text not null,
  model text not null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'retry_wait', 'failed', 'completed', 'cancelled')),
  current_stage text,
  scope_json jsonb not null default '{}'::jsonb,
  assembled_prompt text,
  applied_rule_version_ids uuid[] not null default array[]::uuid[],
  provider_request_id text,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  output_revision_id uuid references public.workbook_content_revisions(id) on delete set null,
  error_message text,
  provider_usage_json jsonb not null default '{}'::jsonb,
  requested_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index if not exists workbook_generation_runs_project_created_idx
  on public.workbook_generation_runs(project_id, created_at);
create index if not exists workbook_generation_runs_batch_idx
  on public.workbook_generation_runs(batch_id);

create table if not exists public.workbook_studio_jobs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.workbook_generation_batches(id) on delete cascade,
  run_id uuid references public.workbook_generation_runs(id) on delete cascade,
  project_id uuid references public.workbook_projects(id) on delete cascade,
  job_type text not null
    check (job_type in (
      'catalog_plan', 'curriculum', 'outline', 'lesson_content',
      'validate', 'render', 'theme_cascade', 'release'
    )),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'retry_wait', 'failed', 'completed', 'cancelled')),
  sequence_number integer not null default 0,
  attempt_count integer not null default 0,
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  heartbeat_at timestamptz,
  worker_id text,
  payload_json jsonb not null default '{}'::jsonb,
  result_json jsonb not null default '{}'::jsonb,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists workbook_studio_jobs_queue_idx
  on public.workbook_studio_jobs(status, available_at, sequence_number);
create index if not exists workbook_studio_jobs_batch_idx
  on public.workbook_studio_jobs(batch_id, status);
create index if not exists workbook_studio_jobs_project_idx
  on public.workbook_studio_jobs(project_id, status);

create table if not exists public.workbook_render_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.workbook_projects(id) on delete cascade,
  content_revision_id uuid not null references public.workbook_content_revisions(id) on delete restrict,
  theme_version_id uuid not null references public.workbook_theme_versions(id) on delete restrict,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'retry_wait', 'failed', 'completed', 'cancelled')),
  renderer_version text not null,
  chromium_version text,
  paged_js_version text not null,
  options_json jsonb not null default '{}'::jsonb,
  font_manifest_json jsonb not null default '{}'::jsonb,
  html_object_path text,
  pdf_object_path text,
  page_count integer check (page_count is null or page_count > 0),
  validation_json jsonb not null default '{}'::jsonb,
  last_error text,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists workbook_render_runs_project_created_idx
  on public.workbook_render_runs(project_id, created_at);
create index if not exists workbook_render_runs_revision_theme_idx
  on public.workbook_render_runs(content_revision_id, theme_version_id, status);

alter table public.native_workbook_editions
  add column if not exists theme_version_id uuid
  references public.workbook_theme_versions(id) on delete restrict;

alter table public.native_workbook_versions
  add column if not exists artifact_source text not null default 'uploaded_pdf'
    check (artifact_source in ('uploaded_pdf', 'workbook_studio')),
  add column if not exists workbook_content_revision_id uuid
    references public.workbook_content_revisions(id) on delete set null,
  add column if not exists workbook_render_run_id uuid
    references public.workbook_render_runs(id) on delete set null;

alter table public.workbook_themes enable row level security;
alter table public.workbook_theme_versions enable row level security;
alter table public.workbook_theme_component_tokens enable row level security;
alter table public.workbook_generation_prompts enable row level security;
alter table public.workbook_generation_prompt_versions enable row level security;
alter table public.workbook_generation_rules enable row level security;
alter table public.workbook_generation_rule_versions enable row level security;
alter table public.workbook_illustration_types enable row level security;
alter table public.workbook_curricula enable row level security;
alter table public.workbook_curriculum_revisions enable row level security;
alter table public.workbook_projects enable row level security;
alter table public.workbook_content_revisions enable row level security;
alter table public.workbook_generation_batches enable row level security;
alter table public.workbook_generation_runs enable row level security;
alter table public.workbook_studio_jobs enable row level security;
alter table public.workbook_render_runs enable row level security;

comment on table public.workbook_projects is
  'Canonical Workbook Studio authoring records. A native_workbook link is optional until the first bookstore release.';
comment on table public.workbook_content_revisions is
  'Immutable typed workbook content trees. Stable lesson ids classify same-edition revisions independently of PDF page count.';
comment on column public.workbook_theme_versions.raw_css_override is
  'Reserved for a future reviewed escape hatch. V1 requires this field to remain null.';
comment on column public.workbook_projects.theme_override_version_id is
  'Optional immutable theme-version override. Otherwise the curriculum default theme version applies.';
comment on table public.workbook_generation_prompts is
  'Reusable admin-selectable generation prompts imported from or replacing the historical local prompt files.';
comment on table public.workbook_generation_rules is
  'Quality rules kept separate from prompt prose and enforced either during prompt assembly or deterministic validation.';

insert into public.workbook_themes (
  id,
  slug,
  name,
  description,
  status,
  published_version_id
)
values (
  '10000000-0000-4000-8000-000000000001',
  'classic',
  'Classic',
  'The original Treeschool workbook design extracted from workbook-template-v1.',
  'active',
  null
)
on conflict (slug) do nothing;

insert into public.workbook_theme_versions (
  id,
  theme_id,
  version_number,
  status,
  color_ink,
  color_earth,
  color_leaf,
  color_leaf_dark,
  color_cream,
  color_sand,
  color_canvas,
  color_cover_accent,
  color_cover_accent_soft,
  heading_font_family,
  body_font_family,
  page_size,
  page_margin_top_mm,
  page_margin_right_mm,
  page_margin_bottom_mm,
  page_margin_left_mm,
  first_page_margin_top_mm,
  first_page_margin_right_mm,
  first_page_margin_bottom_mm,
  first_page_margin_left_mm,
  body_font_size_pt,
  body_line_height,
  compiled_css,
  compiled_at,
  source_json,
  published_at
)
select
  '10000000-0000-4000-8000-000000000002',
  theme.id,
  1,
  'published',
  '#25201B',
  '#8F6544',
  '#739E56',
  '#567B40',
  '#FFFAF2',
  '#F6EDDC',
  '#FFFFFF',
  '#2F6690',
  '#E3EEF5',
  '"Comic Neue", "Comic Sans MS", cursive',
  '"Nunito", "Avenir Next", "Trebuchet MS", "Segoe UI", sans-serif',
  'A4',
  16,
  14,
  20,
  14,
  8,
  7,
  10,
  7,
  13,
  1.5,
  ':root{--ink:#25201B;--earth:#8F6544;--leaf:#739E56;--leaf-dark:#567B40;--cream:#FFFAF2;--sand:#F6EDDC;--canvas:#FFFFFF;--cover-accent:#2F6690;--cover-accent-soft:#E3EEF5;}',
  now(),
  jsonb_build_object(
    'repository', 'treeschool-workbooks',
    'path', 'workbook-templates/workbook-template-v1/treeschool-workbook-template.html',
    'sha256', '825681a3800ab3d157aa91da14a8b877bd8ea9e05c783788997a3aa62d49dcb5'
  ),
  now()
from public.workbook_themes theme
where theme.slug = 'classic'
on conflict (theme_id, version_number) do nothing;

update public.workbook_themes theme
set published_version_id = version.id,
    updated_at = now()
from public.workbook_theme_versions version
where theme.slug = 'classic'
  and version.theme_id = theme.id
  and version.version_number = 1
  and theme.published_version_id is null;

insert into public.workbook_theme_component_tokens (
  theme_version_id,
  component_key,
  tokens_json
)
select
  version.id,
  seed.component_key,
  seed.tokens_json
from public.workbook_theme_versions version
join public.workbook_themes theme on theme.id = version.theme_id
cross join (
  values
    ('cover', '{"titleSizeRem":6,"borderWidthPx":4,"accent":"coverAccent","accentSoft":"coverAccentSoft"}'::jsonb),
    ('toc', '{"borderWidthPx":2,"borderRadiusPx":14,"chapterRule":"dotted"}'::jsonb),
    ('chapterDivider', '{"titleSizePt":24,"ruleWidthPx":3}'::jsonb),
    ('lesson', '{"borderWidthPx":3,"borderRadiusPx":14,"titleSizePt":17}'::jsonb),
    ('answerKey', '{"borderWidthPx":3,"borderRadiusPx":14,"bannerSizePt":13}'::jsonb)
) as seed(component_key, tokens_json)
where theme.slug = 'classic' and version.version_number = 1
on conflict (theme_version_id, component_key) do nothing;

insert into public.workbook_illustration_types (
  id,
  key,
  name,
  description,
  subject_key,
  renderer_kind,
  parameter_schema_json,
  svg_template,
  token_bindings_json
)
values
  (
    '30000000-0000-4000-8000-000000000001',
    'number-line-0-to-10',
    'Number line, 0 to 10',
    'A fixed elementary number line whose colors are resolved from the selected theme on the server.',
    'math',
    'parameterized_svg',
    '{}'::jsonb,
    $svg$<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 130" aria-hidden="true"><path d="M45 58H675" stroke="{{theme:stroke}}" stroke-width="6" stroke-linecap="round"/><path d="M45 44v28M108 44v28M171 44v28M234 44v28M297 44v28M360 44v28M423 44v28M486 44v28M549 44v28M612 44v28M675 44v28" stroke="{{theme:stroke}}" stroke-width="4"/><g fill="{{theme:text}}" font-family="Nunito, sans-serif" font-size="25" text-anchor="middle"><text x="45" y="108">0</text><text x="108" y="108">1</text><text x="171" y="108">2</text><text x="234" y="108">3</text><text x="297" y="108">4</text><text x="360" y="108">5</text><text x="423" y="108">6</text><text x="486" y="108">7</text><text x="549" y="108">8</text><text x="612" y="108">9</text><text x="675" y="108">10</text></g></svg>$svg$,
    '{"stroke":"leafDark","text":"ink"}'::jsonb
  ),
  (
    '30000000-0000-4000-8000-000000000002',
    'ten-frame',
    'Ten frame',
    'An empty two-by-five counting frame.',
    'math',
    'parameterized_svg',
    '{}'::jsonb,
    $svg$<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 610 250" aria-hidden="true"><rect x="5" y="5" width="600" height="240" rx="14" fill="{{theme:paper}}" stroke="{{theme:stroke}}" stroke-width="8"/><path d="M125 5v240M245 5v240M365 5v240M485 5v240M5 125h600" stroke="{{theme:stroke}}" stroke-width="5"/></svg>$svg$,
    '{"paper":"cream","stroke":"leafDark"}'::jsonb
  ),
  (
    '30000000-0000-4000-8000-000000000003',
    'fraction-circle-halves',
    'Fraction circle, halves',
    'A circle divided into two equal regions.',
    'math',
    'parameterized_svg',
    '{}'::jsonb,
    $svg$<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320" aria-hidden="true"><path d="M160 20a140 140 0 0 0 0 280z" fill="{{theme:accentSoft}}"/><circle cx="160" cy="160" r="140" fill="none" stroke="{{theme:stroke}}" stroke-width="8"/><path d="M160 20v280" stroke="{{theme:stroke}}" stroke-width="6"/></svg>$svg$,
    '{"accentSoft":"coverAccentSoft","stroke":"ink"}'::jsonb
  ),
  (
    '30000000-0000-4000-8000-000000000004',
    'music-staff',
    'Music staff',
    'A blank five-line music staff for notation exercises.',
    'music',
    'parameterized_svg',
    '{}'::jsonb,
    $svg$<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 190" aria-hidden="true"><rect x="8" y="8" width="744" height="174" rx="14" fill="{{theme:paper}}" stroke="{{theme:border}}" stroke-width="4"/><path d="M38 55H722M38 75H722M38 95H722M38 115H722M38 135H722" stroke="{{theme:staff}}" stroke-width="3"/></svg>$svg$,
    '{"paper":"canvas","border":"earth","staff":"ink"}'::jsonb
  ),
  (
    '30000000-0000-4000-8000-000000000005',
    'character-practice-grid',
    'Japanese character practice grid',
    'A genkouyoushi-style practice grid for Japanese characters.',
    'japanese',
    'parameterized_svg',
    '{}'::jsonb,
    $svg$<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 190" aria-hidden="true"><rect x="5" y="5" width="710" height="180" rx="10" fill="{{theme:paper}}" stroke="{{theme:stroke}}" stroke-width="5"/><path d="M147 5v180M289 5v180M431 5v180M573 5v180M5 95h710" stroke="{{theme:stroke}}" stroke-width="3"/><path d="M76 5v180M218 5v180M360 5v180M502 5v180M644 5v180M5 50h710M5 140h710" stroke="{{theme:guide}}" stroke-width="2" stroke-dasharray="7 7"/></svg>$svg$,
    '{"paper":"canvas","stroke":"earth","guide":"sand"}'::jsonb
  )
on conflict (key) do nothing;

insert into public.workbook_generation_rules (
  id,
  slug,
  name,
  description,
  rule_kind,
  status
)
values
  (
    '20000000-0000-4000-8000-000000000001',
    'five-exercises-per-lesson',
    'Five exercises per lesson',
    'Keeps standard workbook lessons at the established exercise count.',
    'exercise_count',
    'active'
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    'answer-key-parity',
    'Answer-key parity',
    'Every answerable exercise must have one corresponding answer-key entry.',
    'answer_key_parity',
    'active'
  ),
  (
    '20000000-0000-4000-8000-000000000003',
    'required-lesson-illustrations',
    'Required lesson illustrations',
    'Every lesson flagged as needing an illustration must contain one.',
    'illustration_presence',
    'active'
  )
on conflict (slug) do nothing;

insert into public.workbook_generation_rule_versions (
  id,
  rule_id,
  version_number,
  status,
  scope_type,
  enforcement,
  instruction_text,
  parameters_json,
  published_at
)
values
  (
    '21000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    1,
    'published',
    'global',
    'prompt',
    'Write exactly five exercises for every standard lesson.',
    '{"exerciseCount":5}'::jsonb,
    now()
  ),
  (
    '21000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000002',
    1,
    'published',
    'global',
    'publish_validator',
    null,
    '{}'::jsonb,
    now()
  ),
  (
    '21000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000003',
    1,
    'published',
    'global',
    'publish_validator',
    null,
    '{}'::jsonb,
    now()
  )
on conflict (rule_id, version_number) do nothing;

update public.workbook_generation_rules rule
set published_version_id = version.id,
    updated_at = now()
from public.workbook_generation_rule_versions version
where version.rule_id = rule.id
  and version.version_number = 1
  and rule.published_version_id is null;
