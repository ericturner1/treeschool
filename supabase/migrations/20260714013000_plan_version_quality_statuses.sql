ALTER TABLE plan_versions DROP CONSTRAINT IF EXISTS plan_versions_status_check;

ALTER TABLE plan_versions
  ADD CONSTRAINT plan_versions_status_check
  CHECK (status IN (
    'generating',
    'activating',
    'quality_check',
    'quality_failed',
    'active',
    'recoverable',
    'failed',
    'expired'
  ));
