ALTER TABLE public.learning_years
  ADD COLUMN IF NOT EXISTS end_date date;

ALTER TABLE public.learning_years
  DROP CONSTRAINT IF EXISTS learning_years_school_year_period_check;

ALTER TABLE public.learning_years
  ADD CONSTRAINT learning_years_school_year_period_check
  CHECK (
    (start_date IS NULL AND end_date IS NULL)
    OR
    (start_date IS NOT NULL AND end_date IS NOT NULL AND end_date > start_date)
  );

COMMENT ON COLUMN public.learning_years.start_date IS
  'First calendar day of this student learning year.';

COMMENT ON COLUMN public.learning_years.end_date IS
  'Last calendar day of this student learning year, used for pace calculations.';
