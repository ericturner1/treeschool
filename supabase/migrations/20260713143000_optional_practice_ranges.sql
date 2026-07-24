ALTER TABLE weekly_plan_items
  ADD COLUMN concept_labels jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN concept_redundant boolean NOT NULL DEFAULT false,
  ADD COLUMN redundancy_reason text,
  ADD COLUMN included_in_packet boolean NOT NULL DEFAULT true;
