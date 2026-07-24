ALTER TABLE weekly_plan_items
  ADD COLUMN source_unit_id text,
  ADD COLUMN source_unit_part_index integer;

ALTER TABLE weekly_plan_items
  ADD CONSTRAINT weekly_plan_items_source_unit_part_check
    CHECK (
      (source_unit_id IS NULL AND source_unit_part_index IS NULL)
      OR (
        source_unit_id IS NOT NULL
        AND length(btrim(source_unit_id)) > 0
        AND source_unit_part_index IS NOT NULL
        AND source_unit_part_index >= 0
      )
    );

CREATE INDEX weekly_plan_items_source_unit_idx
  ON weekly_plan_items(document_id, source_unit_id)
  WHERE source_unit_id IS NOT NULL;

COMMENT ON COLUMN weekly_plan_items.source_unit_id IS
  'Stable identifier of the validated V3 learning unit that authorized this source range.';

COMMENT ON COLUMN weekly_plan_items.source_unit_part_index IS
  'Zero-based component index inside the validated V3 learning unit. V3 planning schedules units; the backend expands their components.';
