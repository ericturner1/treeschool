ALTER TABLE content_documents
  ADD COLUMN client_upload_id text;

CREATE UNIQUE INDEX content_documents_learning_year_client_upload_unique
  ON content_documents (learning_year_id, client_upload_id);
