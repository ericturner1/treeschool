ALTER TABLE plan_versions DROP CONSTRAINT plan_versions_status_check;
ALTER TABLE plan_versions
  ADD CONSTRAINT plan_versions_status_check
  CHECK (status IN ('generating', 'activating', 'active', 'recoverable', 'failed', 'expired'));
