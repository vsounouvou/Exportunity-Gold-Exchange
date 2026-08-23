BEGIN;

-- Canonical structured product facts for an existing industrial requirement.
-- Additive and Exportunity-native: the industrial requirement remains the
-- opportunity's canonical operational case.
CREATE TABLE IF NOT EXISTS industrial_product_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  requirement_id uuid NOT NULL REFERENCES industrial_requirements(id) ON DELETE CASCADE,
  source_message_id integer REFERENCES chat_messages(id) ON DELETE SET NULL,
  intent text NOT NULL,
  intent_confidence numeric(4,3),
  suggested_action text NOT NULL DEFAULT 'ASK',
  product_name text,
  product_category text,
  specification text,
  quantity numeric(20,6),
  quantity_text text,
  unit text,
  origin text,
  destination text,
  target_price text,
  currency text,
  deadline_text text,
  frequency text,
  incoterm text,
  customer_type text,
  missing_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

ALTER TABLE industrial_product_requirements
  ADD COLUMN IF NOT EXISTS source_message_id integer,
  ADD COLUMN IF NOT EXISTS quantity numeric(20,6);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'industrial_product_requirements_source_message_id_fkey'
  ) THEN
    ALTER TABLE industrial_product_requirements
      ADD CONSTRAINT industrial_product_requirements_source_message_id_fkey
      FOREIGN KEY (source_message_id) REFERENCES chat_messages(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS industrial_product_requirements_requirement_unique
  ON industrial_product_requirements(requirement_id);
CREATE INDEX IF NOT EXISTS industrial_product_requirements_tenant_intent_idx
  ON industrial_product_requirements(tenant_id, intent, created_at);
CREATE INDEX IF NOT EXISTS industrial_product_requirements_tenant_product_idx
  ON industrial_product_requirements(tenant_id, product_category, product_name);
CREATE INDEX IF NOT EXISTS industrial_product_requirements_tenant_source_message_idx
  ON industrial_product_requirements(tenant_id, source_message_id);

COMMIT;
