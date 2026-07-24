ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS slug text;

DO $$
DECLARE
  student_record record;
  base_slug text;
  candidate_slug text;
  suffix integer;
BEGIN
  FOR student_record IN
    SELECT id, account_id, first_name
    FROM public.profiles
    WHERE role = 'STUDENT'
    ORDER BY account_id, id
  LOOP
    base_slug := trim(BOTH '-' FROM regexp_replace(lower(student_record.first_name), '[^a-z0-9]+', '-', 'g'));
    IF base_slug = '' THEN
      base_slug := 'student';
    END IF;

    candidate_slug := base_slug;
    suffix := 2;
    WHILE EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE account_id = student_record.account_id
        AND slug = candidate_slug
        AND id <> student_record.id
    ) LOOP
      candidate_slug := base_slug || '-' || suffix;
      suffix := suffix + 1;
    END LOOP;

    UPDATE public.profiles
    SET slug = candidate_slug
    WHERE id = student_record.id;
  END LOOP;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_account_slug_unique
  ON public.profiles (account_id, slug)
  WHERE slug IS NOT NULL;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_student_slug_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_student_slug_check
  CHECK (
    role <> 'STUDENT'
    OR (
      slug IS NOT NULL
      AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    )
  );

COMMENT ON COLUMN public.profiles.slug IS
  'Stable, account-unique URL segment for student profiles.';
