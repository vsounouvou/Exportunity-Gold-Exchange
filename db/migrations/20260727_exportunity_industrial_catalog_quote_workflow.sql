BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_requirement_match_status') THEN
    CREATE TYPE industrial_requirement_match_status AS ENUM ('candidate', 'shortlisted', 'selected', 'rejected');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_quote_status') THEN
    CREATE TYPE industrial_quote_status AS ENUM ('draft', 'under_review', 'ready_for_account_manager', 'issued', 'accepted', 'declined', 'expired', 'cancelled');
  END IF;
END $$;

ALTER TABLE industrial_catalog_items
  ADD COLUMN IF NOT EXISTS manufacturer text,
  ADD COLUMN IF NOT EXISTS brand text,
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS part_number text,
  ADD COLUMN IF NOT EXISTS country_of_origin text,
  ADD COLUMN IF NOT EXISTS technical_specifications jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS application text,
  ADD COLUMN IF NOT EXISTS compatible_machinery jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS material text,
  ADD COLUMN IF NOT EXISTS unit_of_measure text,
  ADD COLUMN IF NOT EXISTS minimum_order_quantity text,
  ADD COLUMN IF NOT EXISTS available_quantity_text text,
  ADD COLUMN IF NOT EXISTS production_capacity_text text,
  ADD COLUMN IF NOT EXISTS lead_time_text text,
  ADD COLUMN IF NOT EXISTS supply_frequency text,
  ADD COLUMN IF NOT EXISTS currency_code text,
  ADD COLUMN IF NOT EXISTS price_text text,
  ADD COLUMN IF NOT EXISTS certifications jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS industrial_requirement_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  requirement_id uuid NOT NULL REFERENCES industrial_requirements(id) ON DELETE CASCADE,
  factory_id uuid NOT NULL REFERENCES industrial_factories(id) ON DELETE CASCADE,
  catalog_item_id uuid NOT NULL REFERENCES industrial_catalog_items(id) ON DELETE CASCADE,
  status industrial_requirement_match_status NOT NULL DEFAULT 'candidate',
  match_score integer,
  match_reason text,
  internal_notes text,
  created_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  selected_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  selected_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT industrial_requirement_matches_requirement_catalog_unique UNIQUE (requirement_id, catalog_item_id)
);

CREATE INDEX IF NOT EXISTS industrial_requirement_matches_tenant_requirement_idx
  ON industrial_requirement_matches(tenant_id, requirement_id, status);
CREATE INDEX IF NOT EXISTS industrial_requirement_matches_tenant_factory_idx
  ON industrial_requirement_matches(tenant_id, factory_id, status);

CREATE TABLE IF NOT EXISTS industrial_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  requirement_id uuid NOT NULL REFERENCES industrial_requirements(id) ON DELETE CASCADE,
  requirement_match_id uuid REFERENCES industrial_requirement_matches(id) ON DELETE SET NULL,
  factory_id uuid REFERENCES industrial_factories(id) ON DELETE SET NULL,
  catalog_item_id uuid REFERENCES industrial_catalog_items(id) ON DELETE SET NULL,
  reference_code text NOT NULL,
  status industrial_quote_status NOT NULL DEFAULT 'draft',
  currency_code text NOT NULL DEFAULT 'XOF',
  total_amount numeric(16,2),
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  lead_time_text text,
  valid_until timestamp,
  commercial_terms text,
  customer_notes text,
  internal_notes text,
  visibility industrial_visibility NOT NULL DEFAULT 'parties_to_transaction',
  created_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  issued_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  issued_at timestamp,
  responded_at timestamp,
  closed_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT industrial_quotes_tenant_reference_unique UNIQUE (tenant_id, reference_code)
);

CREATE INDEX IF NOT EXISTS industrial_quotes_tenant_requirement_idx
  ON industrial_quotes(tenant_id, requirement_id, status);
CREATE INDEX IF NOT EXISTS industrial_quotes_tenant_factory_idx
  ON industrial_quotes(tenant_id, factory_id, status);

COMMIT;
