-- Exact, internal-only procurement release for paid Exportunity industrial
-- orders. This migration does not create a supplier message, purchase order,
-- provider instruction, payment, or other external commitment.

DO $$ BEGIN
  CREATE TYPE industrial_procurement_authorization_status AS ENUM (
    'approval_required',
    'approved',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS industrial_procurement_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL REFERENCES industrial_orders(id) ON DELETE RESTRICT,
  customer_quote_id uuid NOT NULL REFERENCES industrial_quotes(id) ON DELETE RESTRICT,
  supplier_quote_id uuid NOT NULL REFERENCES industrial_supplier_quotes(id) ON DELETE RESTRICT,
  supplier_profile_id uuid NOT NULL REFERENCES industrial_supplier_profiles(id) ON DELETE RESTRICT,
  fulfillment_plan_id uuid NOT NULL REFERENCES industrial_fulfillment_plans(id) ON DELETE RESTRICT,
  procurement_service_id uuid NOT NULL REFERENCES industrial_fulfillment_services(id) ON DELETE RESTRICT,
  reference_code text NOT NULL,
  status industrial_procurement_authorization_status NOT NULL DEFAULT 'approval_required',
  currency_code text NOT NULL,
  supplier_cost_minor numeric(30,0) NOT NULL,
  additional_costs_minor numeric(30,0) NOT NULL,
  total_cost_minor numeric(30,0) NOT NULL,
  margin_minor numeric(30,0) NOT NULL,
  customer_price_minor numeric(30,0) NOT NULL,
  source_pricing_hash text NOT NULL,
  source_supplier_quote_hash text NOT NULL,
  source_order_confirmation_hash text NOT NULL,
  source_payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  release_hash text NOT NULL,
  source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  approval_checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  prepared_reason text NOT NULL,
  prepared_by_user_id integer NOT NULL REFERENCES ece_users(id) ON DELETE RESTRICT,
  prepared_at timestamptz NOT NULL DEFAULT now(),
  approved_reason text,
  approved_by_user_id integer REFERENCES ece_users(id) ON DELETE RESTRICT,
  approved_at timestamptz,
  external_action_executed boolean NOT NULL DEFAULT false,
  supplier_contacted boolean NOT NULL DEFAULT false,
  supplier_commitment_created boolean NOT NULL DEFAULT false,
  external_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS industrial_procurement_auth_tenant_order_uq
  ON industrial_procurement_authorizations(tenant_id, order_id);
CREATE UNIQUE INDEX IF NOT EXISTS industrial_procurement_auth_tenant_reference_uq
  ON industrial_procurement_authorizations(tenant_id, reference_code);
CREATE UNIQUE INDEX IF NOT EXISTS industrial_procurement_auth_tenant_release_hash_uq
  ON industrial_procurement_authorizations(tenant_id, release_hash);
CREATE INDEX IF NOT EXISTS industrial_procurement_auth_tenant_status_idx
  ON industrial_procurement_authorizations(tenant_id, status, updated_at);
CREATE INDEX IF NOT EXISTS industrial_procurement_auth_tenant_supplier_idx
  ON industrial_procurement_authorizations(tenant_id, supplier_profile_id, status);

DO $$ BEGIN
  ALTER TABLE industrial_procurement_authorizations
    ADD CONSTRAINT industrial_procurement_auth_currency_check
    CHECK (currency_code ~ '^[A-Z]{3}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE industrial_procurement_authorizations
    ADD CONSTRAINT industrial_procurement_auth_amounts_check
    CHECK (
      supplier_cost_minor >= 0
      AND additional_costs_minor >= 0
      AND total_cost_minor = supplier_cost_minor + additional_costs_minor
      AND margin_minor >= 0
      AND customer_price_minor = total_cost_minor + margin_minor
      AND customer_price_minor > 0
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE industrial_procurement_authorizations
    ADD CONSTRAINT industrial_procurement_auth_approval_check
    CHECK (
      status <> 'approved'
      OR (
        approved_by_user_id IS NOT NULL
        AND approved_at IS NOT NULL
        AND length(trim(approved_reason)) >= 12
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE industrial_procurement_authorizations
    ADD CONSTRAINT industrial_procurement_auth_no_external_check
    CHECK (
      external_action_executed = false
      AND supplier_contacted = false
      AND supplier_commitment_created = false
      AND external_reference IS NULL
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE industrial_procurement_authorizations IS
  'Exact internal procurement approval ledger. It cannot represent supplier contact or an external purchase commitment.';
