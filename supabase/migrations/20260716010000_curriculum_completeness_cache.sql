alter table public.learning_years
  add column if not exists curriculum_completeness_result jsonb,
  add column if not exists curriculum_completeness_input_fingerprint text,
  add column if not exists curriculum_completeness_reviewed_at timestamptz;

comment on column public.learning_years.curriculum_completeness_result is
  'Most recent validated academic completeness evaluation for this learning year.';

comment on column public.learning_years.curriculum_completeness_input_fingerprint is
  'SHA-256 fingerprint of the exact grade and material metadata used by the cached evaluation.';
