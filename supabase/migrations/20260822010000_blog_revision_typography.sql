ALTER TABLE public.blog_post_revisions
  ADD COLUMN IF NOT EXISTS body_font_size_px real,
  ADD COLUMN IF NOT EXISTS body_line_height real;

ALTER TABLE public.blog_post_revisions
  DROP CONSTRAINT IF EXISTS blog_post_revisions_body_font_size_check,
  ADD CONSTRAINT blog_post_revisions_body_font_size_check
    CHECK (body_font_size_px IS NULL OR body_font_size_px BETWEEN 12 AND 32),
  DROP CONSTRAINT IF EXISTS blog_post_revisions_body_line_height_check,
  ADD CONSTRAINT blog_post_revisions_body_line_height_check
    CHECK (body_line_height IS NULL OR body_line_height BETWEEN 1.2 AND 2.5);

COMMENT ON COLUMN public.blog_post_revisions.body_font_size_px IS
  'Optional article-body font size override stored with this immutable revision.';

COMMENT ON COLUMN public.blog_post_revisions.body_line_height IS
  'Optional unitless article-body line-height override stored with this immutable revision.';
