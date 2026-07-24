ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS current_period_start timestamp with time zone;
