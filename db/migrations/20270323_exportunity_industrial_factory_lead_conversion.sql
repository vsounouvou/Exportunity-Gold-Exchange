-- A qualified private lead can become an internal factory verification dossier.
-- This migration intentionally follows the industrial foundation migration because
-- it adds a foreign key to industrial_factories.
ALTER TABLE industrial_factory_leads
  ADD COLUMN IF NOT EXISTS converted_factory_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'industrial_factory_leads_converted_factory_id_fkey'
  ) THEN
    ALTER TABLE industrial_factory_leads
      ADD CONSTRAINT industrial_factory_leads_converted_factory_id_fkey
      FOREIGN KEY (converted_factory_id)
      REFERENCES industrial_factories(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS industrial_factory_leads_converted_factory_idx
  ON industrial_factory_leads(converted_factory_id);
