ALTER TABLE public.blog_post_revisions
  ALTER COLUMN show_author SET DEFAULT false;

COMMENT ON COLUMN public.blog_post_revisions.show_author IS
  'Whether this exact article revision displays its author byline publicly. New revisions default to hidden.';
