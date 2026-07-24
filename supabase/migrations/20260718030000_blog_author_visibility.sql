ALTER TABLE public.blog_post_revisions
  ADD COLUMN IF NOT EXISTS show_author boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.blog_post_revisions.show_author IS
  'Whether this exact article revision displays its author byline publicly.';
