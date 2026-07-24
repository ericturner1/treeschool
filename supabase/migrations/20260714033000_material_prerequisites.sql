CREATE TABLE learning_year_material_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  learning_year_id uuid NOT NULL REFERENCES learning_years(id) ON DELETE CASCADE,
  label text NOT NULL,
  prerequisite_material_set_id uuid REFERENCES learning_year_material_sets(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT learning_year_material_sets_not_self_prerequisite
    CHECK (prerequisite_material_set_id IS NULL OR prerequisite_material_set_id <> id)
);

CREATE INDEX learning_year_material_sets_year_created_idx
  ON learning_year_material_sets (learning_year_id, created_at);

ALTER TABLE content_documents ADD COLUMN material_set_id uuid;

INSERT INTO learning_year_material_sets (id, learning_year_id, label, created_at, updated_at)
SELECT id, learning_year_id, label, created_at, created_at
FROM content_documents;

UPDATE content_documents SET material_set_id = id WHERE material_set_id IS NULL;

ALTER TABLE content_documents
  ALTER COLUMN material_set_id SET NOT NULL,
  ADD CONSTRAINT content_documents_material_set_id_fkey
    FOREIGN KEY (material_set_id) REFERENCES learning_year_material_sets(id) ON DELETE CASCADE;

CREATE INDEX content_documents_material_set_idx
  ON content_documents (learning_year_id, material_set_id);
