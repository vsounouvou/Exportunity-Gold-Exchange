BEGIN;

ALTER TABLE industrial_requirement_attachments
  ADD COLUMN IF NOT EXISTS extraction_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS extraction_method text,
  ADD COLUMN IF NOT EXISTS extracted_text text,
  ADD COLUMN IF NOT EXISTS extraction_warning text,
  ADD COLUMN IF NOT EXISTS extraction_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS extracted_at timestamp;

CREATE INDEX IF NOT EXISTS industrial_requirement_attachments_extraction_idx
  ON industrial_requirement_attachments(tenant_id, extraction_status, created_at);

COMMIT;
