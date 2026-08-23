BEGIN;

ALTER TABLE sales_leads
  ADD COLUMN IF NOT EXISTS tenant_id integer,
  ADD COLUMN IF NOT EXISTS source_chat_lead_id uuid;

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS tenant_id integer,
  ADD COLUMN IF NOT EXISTS source_chat_lead_id uuid,
  ADD COLUMN IF NOT EXISTS industrial_requirement_id uuid,
  ADD COLUMN IF NOT EXISTS reference_code text;

UPDATE sales_leads AS lead
SET tenant_id = company.tenant_id
FROM companies AS company
WHERE lead.company_id = company.id
  AND lead.tenant_id IS NULL;

UPDATE deals AS deal
SET tenant_id = company.tenant_id
FROM companies AS company
WHERE deal.company_id = company.id
  AND deal.tenant_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_leads_tenant_id_fkey'
  ) THEN
    ALTER TABLE sales_leads
      ADD CONSTRAINT sales_leads_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_leads_source_chat_lead_id_fkey'
  ) THEN
    ALTER TABLE sales_leads
      ADD CONSTRAINT sales_leads_source_chat_lead_id_fkey
      FOREIGN KEY (source_chat_lead_id) REFERENCES chat_leads(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'deals_tenant_id_fkey'
  ) THEN
    ALTER TABLE deals
      ADD CONSTRAINT deals_tenant_id_fkey
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'deals_source_chat_lead_id_fkey'
  ) THEN
    ALTER TABLE deals
      ADD CONSTRAINT deals_source_chat_lead_id_fkey
      FOREIGN KEY (source_chat_lead_id) REFERENCES chat_leads(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'deals_industrial_requirement_id_fkey'
  ) THEN
    ALTER TABLE deals
      ADD CONSTRAINT deals_industrial_requirement_id_fkey
      FOREIGN KEY (industrial_requirement_id) REFERENCES industrial_requirements(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS sales_leads_tenant_chat_lead_unique
  ON sales_leads(tenant_id, source_chat_lead_id)
  WHERE tenant_id IS NOT NULL AND source_chat_lead_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS sales_leads_tenant_status_idx
  ON sales_leads(tenant_id, status, updated_at);

CREATE UNIQUE INDEX IF NOT EXISTS deals_tenant_requirement_unique
  ON deals(tenant_id, industrial_requirement_id)
  WHERE tenant_id IS NOT NULL AND industrial_requirement_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS deals_tenant_reference_unique
  ON deals(tenant_id, reference_code)
  WHERE tenant_id IS NOT NULL AND reference_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS deals_tenant_chat_lead_idx
  ON deals(tenant_id, source_chat_lead_id, updated_at);

COMMIT;
