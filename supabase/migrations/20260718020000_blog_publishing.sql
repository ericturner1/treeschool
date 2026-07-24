CREATE TABLE IF NOT EXISTS public.blog_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  language_code text NOT NULL DEFAULT 'en',
  author_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  published_revision_number integer,
  published_at timestamptz,
  scheduled_for timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT blog_posts_slug_format_check CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  CONSTRAINT blog_posts_status_check CHECK (status IN ('draft', 'published', 'scheduled', 'archived')),
  CONSTRAINT blog_posts_published_revision_check CHECK (
    (status = 'published' AND published_revision_number IS NOT NULL AND published_at IS NOT NULL)
    OR status <> 'published'
  ),
  CONSTRAINT blog_posts_schedule_check CHECK (
    (status = 'scheduled' AND scheduled_for IS NOT NULL)
    OR status <> 'scheduled'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS blog_posts_slug_lower_unique
  ON public.blog_posts (lower(slug));
CREATE INDEX IF NOT EXISTS blog_posts_status_published_idx
  ON public.blog_posts (status, published_at DESC);

CREATE TABLE IF NOT EXISTS public.blog_post_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.blog_posts(id) ON DELETE CASCADE,
  revision_number integer NOT NULL,
  title text NOT NULL,
  excerpt text NOT NULL,
  content_html text NOT NULL,
  content_text text NOT NULL,
  content_schema_version integer NOT NULL DEFAULT 1,
  seo_title text,
  meta_description text,
  canonical_url text,
  featured_image_url text,
  featured_image_alt text,
  primary_keyword text,
  source text NOT NULL DEFAULT 'manual',
  generation_metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT blog_post_revisions_number_check CHECK (revision_number > 0),
  CONSTRAINT blog_post_revisions_schema_check CHECK (content_schema_version > 0),
  CONSTRAINT blog_post_revisions_source_check CHECK (source IN ('manual', 'ai', 'import')),
  CONSTRAINT blog_post_revisions_title_length_check CHECK (char_length(title) BETWEEN 1 AND 180),
  CONSTRAINT blog_post_revisions_excerpt_length_check CHECK (char_length(excerpt) <= 500),
  CONSTRAINT blog_post_revisions_post_revision_unique UNIQUE (post_id, revision_number)
);

CREATE INDEX IF NOT EXISTS blog_post_revisions_post_created_idx
  ON public.blog_post_revisions (post_id, created_at DESC);
CREATE INDEX IF NOT EXISTS blog_post_revisions_search_idx
  ON public.blog_post_revisions
  USING gin (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(excerpt, '') || ' ' || coalesce(content_text, '')));

CREATE TABLE IF NOT EXISTS public.blog_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT blog_categories_slug_format_check CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
CREATE UNIQUE INDEX IF NOT EXISTS blog_categories_slug_lower_unique
  ON public.blog_categories (lower(slug));

CREATE TABLE IF NOT EXISTS public.blog_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT blog_tags_slug_format_check CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
CREATE UNIQUE INDEX IF NOT EXISTS blog_tags_slug_lower_unique
  ON public.blog_tags (lower(slug));

CREATE TABLE IF NOT EXISTS public.blog_post_categories (
  post_id uuid NOT NULL REFERENCES public.blog_posts(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.blog_categories(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, category_id)
);

CREATE TABLE IF NOT EXISTS public.blog_post_tags (
  post_id uuid NOT NULL REFERENCES public.blog_posts(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.blog_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);

CREATE TABLE IF NOT EXISTS public.blog_post_slug_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.blog_posts(id) ON DELETE CASCADE,
  slug text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT blog_post_slug_history_format_check CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
CREATE UNIQUE INDEX IF NOT EXISTS blog_post_slug_history_slug_lower_unique
  ON public.blog_post_slug_history (lower(slug));

CREATE TABLE IF NOT EXISTS public.blog_generation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid REFERENCES public.blog_posts(id) ON DELETE SET NULL,
  requested_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  provider text NOT NULL,
  model text NOT NULL,
  operation text NOT NULL DEFAULT 'draft_article',
  status text NOT NULL DEFAULT 'running',
  brief_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider_request_id text,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  total_tokens integer NOT NULL DEFAULT 0,
  duration_ms integer,
  output_revision_number integer,
  error_message text,
  provider_usage_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT blog_generation_runs_status_check CHECK (status IN ('running', 'succeeded', 'failed', 'invalid_response')),
  CONSTRAINT blog_generation_runs_token_check CHECK (input_tokens >= 0 AND output_tokens >= 0 AND total_tokens >= 0)
);
CREATE INDEX IF NOT EXISTS blog_generation_runs_post_created_idx
  ON public.blog_generation_runs (post_id, created_at DESC);

INSERT INTO public.blog_categories (name, slug, description)
VALUES
  ('Homeschool Planning', 'homeschool-planning', 'Practical guidance for planning a flexible homeschool year.'),
  ('Curriculum', 'curriculum', 'Curriculum selection, organization, and teaching guidance.'),
  ('Paper-First Learning', 'paper-first-learning', 'Ideas for reducing screen time while supporting rich learning.'),
  ('Homeschool Life', 'homeschool-life', 'Encouragement and practical help for everyday homeschool family life.')
ON CONFLICT DO NOTHING;

ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_post_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_post_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_post_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_post_slug_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_generation_runs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.blog_post_revisions IS
  'Immutable editorial snapshots. blog_posts.published_revision_number pins the exact public revision.';
COMMENT ON TABLE public.blog_post_slug_history IS
  'Previously published slugs retained for permanent SEO redirects.';
COMMENT ON TABLE public.blog_generation_runs IS
  'Vendor-neutral audit and cost metadata for AI-assisted editorial generation.';
