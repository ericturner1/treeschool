ALTER TABLE weekly_plan_items
  ADD COLUMN page_selection_audit jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN weekly_plan_items.page_selection_audit IS
  'Durable audit record proving the physical-to-in-content page conversion utility was invoked for this selected source range.';
