-- Exact internal supplier purchase-order package for Exportunity industrial
-- orders. This table cannot represent transmission, supplier acceptance, a
-- provider action, supplier payment, or any external purchase commitment.

DO $$ BEGIN
  CREATE TYPE industrial_supplier_po_package_status AS ENUM (
    'approval_required',
    'approved_for_submission',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS industrial_supplier_purchase_order_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL REFERENCES industrial_orders(id) ON DELETE RESTRICT,
  procurement_authorization_id uuid NOT NULL REFERENCES industrial_procurement_authorizations(id) ON DELETE RESTRICT,
  customer_quote_id uuid NOT NULL REFERENCES industrial_quotes(id) ON DELETE RESTRICT,
  supplier_quote_id uuid NOT NULL REFERENCES industrial_supplier_quotes(id) ON DELETE RESTRICT,
  supplier_profile_id uuid NOT NULL REFERENCES industrial_supplier_profiles(id) ON DELETE RESTRICT,
  fulfillment_plan_id uuid NOT NULL REFERENCES industrial_fulfillment_plans(id) ON DELETE RESTRICT,
  procurement_service_id uuid NOT NULL REFERENCES industrial_fulfillment_services(id) ON DELETE RESTRICT,
  source_payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  reference_code text NOT NULL,
  status industrial_supplier_po_package_status NOT NULL DEFAULT 'approval_required',
  currency_code text NOT NULL,
  supplier_total_minor numeric(30,0) NOT NULL,
  product_name text NOT NULL,
  specification text,
  offered_quantity text NOT NULL,
  unit_of_measure text NOT NULL,
  unit_price_text text,
  packaging text,
  lead_time text NOT NULL,
  incoterm text NOT NULL,
  payment_terms text NOT NULL,
  destination text NOT NULL,
  country_of_origin text,
  warranty text,
  supplier_quote_reference text NOT NULL,
  supplier_quote_valid_until timestamptz NOT NULL,
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_pricing_hash text NOT NULL,
  source_supplier_quote_hash text NOT NULL,
  source_order_confirmation_hash text NOT NULL,
  procurement_release_hash text NOT NULL,
  package_hash text NOT NULL,
  source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  approval_checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  prepared_reason text NOT NULL,
  prepared_by_user_id integer NOT NULL REFERENCES ece_users(id) ON DELETE RESTRICT,
  prepared_at timestamptz NOT NULL DEFAULT now(),
  approved_reason text,
  approved_by_user_id integer REFERENCES ece_users(id) ON DELETE RESTRICT,
  approved_at timestamptz,
  external_action_executed boolean NOT NULL DEFAULT false,
  transmitted_to_supplier boolean NOT NULL DEFAULT false,
  supplier_accepted boolean NOT NULL DEFAULT false,
  external_purchase_order_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS industrial_supplier_po_pkg_tenant_order_uq
  ON industrial_supplier_purchase_order_packages(tenant_id, order_id);
CREATE UNIQUE INDEX IF NOT EXISTS industrial_supplier_po_pkg_tenant_ref_uq
  ON industrial_supplier_purchase_order_packages(tenant_id, reference_code);
CREATE UNIQUE INDEX IF NOT EXISTS industrial_supplier_po_pkg_tenant_hash_uq
  ON industrial_supplier_purchase_order_packages(tenant_id, package_hash);
CREATE INDEX IF NOT EXISTS industrial_supplier_po_pkg_tenant_status_idx
  ON industrial_supplier_purchase_order_packages(tenant_id, status, updated_at);
CREATE INDEX IF NOT EXISTS industrial_supplier_po_pkg_tenant_supplier_idx
  ON industrial_supplier_purchase_order_packages(tenant_id, supplier_profile_id, status);

DO $$ BEGIN
  ALTER TABLE industrial_supplier_purchase_order_packages
    ADD CONSTRAINT industrial_supplier_po_pkg_currency_check
    CHECK (currency_code ~ '^[A-Z]{3}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE industrial_supplier_purchase_order_packages
    ADD CONSTRAINT industrial_supplier_po_pkg_amount_check
    CHECK (supplier_total_minor > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE industrial_supplier_purchase_order_packages
    ADD CONSTRAINT industrial_supplier_po_pkg_hash_check
    CHECK (
      source_pricing_hash ~ '^[a-f0-9]{64}$'
      AND source_supplier_quote_hash ~ '^[a-f0-9]{64}$'
      AND source_order_confirmation_hash ~ '^[a-f0-9]{64}$'
      AND procurement_release_hash ~ '^[a-f0-9]{64}$'
      AND package_hash ~ '^[a-f0-9]{64}$'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE industrial_supplier_purchase_order_packages
    ADD CONSTRAINT industrial_supplier_po_pkg_approval_check
    CHECK (
      status <> 'approved_for_submission'
      OR (
        approved_by_user_id IS NOT NULL
        AND approved_at IS NOT NULL
        AND length(trim(approved_reason)) >= 12
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE industrial_supplier_purchase_order_packages
    ADD CONSTRAINT industrial_supplier_po_pkg_no_external_check
    CHECK (
      external_action_executed = false
      AND transmitted_to_supplier = false
      AND supplier_accepted = false
      AND external_purchase_order_reference IS NULL
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE industrial_supplier_purchase_order_packages IS
  'Exact internal purchase-order package. It cannot prove or perform supplier transmission, acceptance, payment, or an external commitment.';
