ALTER TABLE industrial_requirements
  ADD COLUMN IF NOT EXISTS customer_contact_id integer REFERENCES contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS industrial_requirements_customer_contact_idx
  ON industrial_requirements(tenant_id, customer_contact_id, status);

ALTER TABLE industrial_requirement_supplier_matches
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'internal_supplier_network',
  ADD COLUMN IF NOT EXISTS discovery_url text,
  ADD COLUMN IF NOT EXISTS discovery_agent_id integer,
  ADD COLUMN IF NOT EXISTS verification_score integer,
  ADD COLUMN IF NOT EXISTS relevance_score integer,
  ADD COLUMN IF NOT EXISTS contactability_score integer,
  ADD COLUMN IF NOT EXISTS last_verified_at timestamp;

CREATE TABLE IF NOT EXISTS industrial_supplier_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  requirement_id uuid NOT NULL REFERENCES industrial_requirements(id) ON DELETE CASCADE,
  supplier_profile_id uuid REFERENCES industrial_supplier_profiles(id) ON DELETE SET NULL,
  supplier_match_id uuid REFERENCES industrial_requirement_supplier_matches(id) ON DELETE SET NULL,
  reference_code text NOT NULL,
  product text NOT NULL,
  specification text,
  quantity_text text,
  unit text,
  unit_price numeric(16,4),
  total_cost numeric(16,2),
  currency_code text NOT NULL DEFAULT 'XOF',
  incoterm text,
  origin text,
  destination text,
  packaging text,
  minimum_order_quantity text,
  lead_time_days integer,
  payment_terms text,
  valid_until timestamp,
  certifications jsonb NOT NULL DEFAULT '[]'::jsonb,
  document_references jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_channel text NOT NULL DEFAULT 'manual',
  raw_source_message_id text,
  raw_source_text text,
  extraction_confidence numeric(4,3),
  status text NOT NULL DEFAULT 'needs_review',
  internal_notes text,
  created_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  received_at timestamp,
  reviewed_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT industrial_supplier_quotes_tenant_reference_unique UNIQUE (tenant_id, reference_code)
);

CREATE INDEX IF NOT EXISTS industrial_supplier_quotes_tenant_requirement_idx
  ON industrial_supplier_quotes(tenant_id, requirement_id, status, updated_at);
CREATE INDEX IF NOT EXISTS industrial_supplier_quotes_tenant_supplier_idx
  ON industrial_supplier_quotes(tenant_id, supplier_profile_id, status);
CREATE INDEX IF NOT EXISTS industrial_supplier_quotes_source_message_idx
  ON industrial_supplier_quotes(tenant_id, raw_source_message_id);

CREATE TABLE IF NOT EXISTS industrial_commercial_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  requirement_id uuid NOT NULL REFERENCES industrial_requirements(id) ON DELETE CASCADE,
  customer_contact_id integer REFERENCES contacts(id) ON DELETE SET NULL,
  reference_code text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  supplier_quote_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  cost_stack jsonb NOT NULL DEFAULT '{}'::jsonb,
  total_cost numeric(16,2) NOT NULL,
  internal_margin numeric(16,2) NOT NULL,
  margin_percent numeric(7,3) NOT NULL,
  customer_price numeric(16,2) NOT NULL,
  currency_code text NOT NULL DEFAULT 'XOF',
  incoterm text,
  delivery_estimate text,
  payment_terms text,
  offer_valid_until timestamp,
  terms text,
  status text NOT NULL DEFAULT 'draft',
  pricing_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  approved_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  approved_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT industrial_commercial_offers_tenant_reference_unique UNIQUE (tenant_id, reference_code),
  CONSTRAINT industrial_commercial_offers_requirement_version_unique UNIQUE (requirement_id, version)
);

CREATE INDEX IF NOT EXISTS industrial_commercial_offers_tenant_requirement_idx
  ON industrial_commercial_offers(tenant_id, requirement_id, status, updated_at);

ALTER TABLE industrial_quotes
  ADD COLUMN IF NOT EXISTS commercial_offer_id uuid REFERENCES industrial_commercial_offers(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS industrial_quotes_commercial_offer_unique
  ON industrial_quotes(tenant_id, commercial_offer_id);
