-- Phase H: immutable delivered-transaction relationship memory and a governed
-- internal continuity review. This migration cannot send a message, create a
-- new opportunity/order, or authorize external communication.

DO $$ BEGIN
  CREATE TYPE industrial_relationship_continuity_status AS ENUM (
    'review_required',
    'approved_internal'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS industrial_transaction_relationship_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  recognition_id uuid NOT NULL REFERENCES industrial_order_revenue_recognitions(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL REFERENCES industrial_orders(id) ON DELETE RESTRICT,
  requirement_id uuid NOT NULL REFERENCES industrial_requirements(id) ON DELETE RESTRICT,
  fulfillment_plan_id uuid NOT NULL REFERENCES industrial_fulfillment_plans(id) ON DELETE RESTRICT,
  supplier_purchase_order_package_id uuid NOT NULL REFERENCES industrial_supplier_purchase_order_packages(id) ON DELETE RESTRICT,
  supplier_profile_id uuid NOT NULL REFERENCES industrial_supplier_profiles(id) ON DELETE RESTRICT,
  customer_contact_id integer REFERENCES contacts(id) ON DELETE RESTRICT,
  reference_code text NOT NULL,
  product_name text NOT NULL,
  specification text,
  quantity_text text NOT NULL,
  unit_of_measure text NOT NULL,
  destination text NOT NULL,
  country_of_origin text,
  cadence_text text,
  delivered_at timestamptz NOT NULL,
  currency_code text NOT NULL,
  revenue_minor numeric(30,0) NOT NULL,
  actual_cost_minor numeric(30,0) NOT NULL,
  actual_gross_margin_minor numeric(30,0) NOT NULL,
  customer_memory jsonb NOT NULL DEFAULT '{}'::jsonb,
  supplier_memory jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_hash text NOT NULL,
  memory_hash text NOT NULL,
  recorded_by_user_id integer NOT NULL REFERENCES ece_users(id) ON DELETE RESTRICT,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT industrial_rel_memory_currency_check CHECK (currency_code ~ '^[A-Z]{3}$'),
  CONSTRAINT industrial_rel_memory_amounts_check CHECK (
    revenue_minor > 0 AND actual_cost_minor > 0 AND
    actual_gross_margin_minor = revenue_minor - actual_cost_minor
  ),
  CONSTRAINT industrial_rel_memory_evidence_check CHECK (
    evidence_hash ~ '^[a-f0-9]{64}$' AND memory_hash ~ '^[a-f0-9]{64}$' AND
    length(trim(product_name)) >= 2 AND length(trim(quantity_text)) >= 1 AND
    length(trim(unit_of_measure)) >= 1 AND length(trim(destination)) >= 2
  ),
  CONSTRAINT industrial_rel_memory_tenant_recognition_uq UNIQUE (tenant_id, recognition_id),
  CONSTRAINT industrial_rel_memory_tenant_order_uq UNIQUE (tenant_id, order_id),
  CONSTRAINT industrial_rel_memory_tenant_reference_uq UNIQUE (tenant_id, reference_code),
  CONSTRAINT industrial_rel_memory_tenant_hash_uq UNIQUE (tenant_id, memory_hash)
);

CREATE INDEX IF NOT EXISTS industrial_rel_memory_customer_idx
  ON industrial_transaction_relationship_memories (tenant_id, customer_contact_id, delivered_at);
CREATE INDEX IF NOT EXISTS industrial_rel_memory_supplier_idx
  ON industrial_transaction_relationship_memories (tenant_id, supplier_profile_id, delivered_at);

CREATE TABLE IF NOT EXISTS industrial_relationship_continuity_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  memory_id uuid NOT NULL REFERENCES industrial_transaction_relationship_memories(id) ON DELETE RESTRICT,
  status industrial_relationship_continuity_status NOT NULL DEFAULT 'review_required',
  recommended_action text NOT NULL,
  proposed_next_review_at timestamptz,
  consent_status text NOT NULL DEFAULT 'unknown',
  is_dnc boolean NOT NULL DEFAULT false,
  decision_checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  decision_reason text,
  approved_by_user_id integer REFERENCES ece_users(id) ON DELETE RESTRICT,
  approved_at timestamptz,
  external_communication_authorized boolean NOT NULL DEFAULT false,
  external_communication_executed boolean NOT NULL DEFAULT false,
  external_message_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT industrial_rel_continuity_tenant_memory_uq UNIQUE (tenant_id, memory_id),
  CONSTRAINT industrial_rel_continuity_status_check CHECK (
    status <> 'approved_internal' OR (
      approved_by_user_id IS NOT NULL AND approved_at IS NOT NULL AND
      proposed_next_review_at IS NOT NULL AND length(trim(decision_reason)) >= 12
    )
  ),
  CONSTRAINT industrial_rel_continuity_no_external_check CHECK (
    external_communication_authorized = false AND
    external_communication_executed = false AND
    external_message_reference IS NULL
  )
);

CREATE INDEX IF NOT EXISTS industrial_rel_continuity_review_queue_idx
  ON industrial_relationship_continuity_reviews (tenant_id, status, proposed_next_review_at);

CREATE OR REPLACE FUNCTION exportunity_validate_industrial_relationship_memory()
RETURNS trigger AS $$
DECLARE
  v_recognition industrial_order_revenue_recognitions%ROWTYPE;
  v_order industrial_orders%ROWTYPE;
  v_requirement industrial_requirements%ROWTYPE;
  v_plan industrial_fulfillment_plans%ROWTYPE;
  v_package industrial_supplier_purchase_order_packages%ROWTYPE;
BEGIN
  SELECT * INTO v_recognition
  FROM industrial_order_revenue_recognitions
  WHERE id = NEW.recognition_id AND tenant_id = NEW.tenant_id
  FOR SHARE;
  IF NOT FOUND OR v_recognition.status <> 'recognized' THEN
    RAISE EXCEPTION 'relationship memory requires recognized revenue evidence';
  END IF;

  SELECT * INTO v_order
  FROM industrial_orders
  WHERE id = NEW.order_id AND tenant_id = NEW.tenant_id
  FOR SHARE;
  SELECT * INTO v_requirement
  FROM industrial_requirements
  WHERE id = NEW.requirement_id AND tenant_id = NEW.tenant_id
  FOR SHARE;
  SELECT * INTO v_plan
  FROM industrial_fulfillment_plans
  WHERE id = NEW.fulfillment_plan_id AND tenant_id = NEW.tenant_id
  FOR SHARE;
  SELECT * INTO v_package
  FROM industrial_supplier_purchase_order_packages
  WHERE id = NEW.supplier_purchase_order_package_id AND tenant_id = NEW.tenant_id
  FOR SHARE;

  IF v_order.id IS NULL OR v_requirement.id IS NULL OR v_plan.id IS NULL OR v_package.id IS NULL THEN
    RAISE EXCEPTION 'relationship memory canonical lineage is incomplete';
  END IF;
  IF v_recognition.order_id <> NEW.order_id OR v_order.requirement_id <> NEW.requirement_id OR
     v_recognition.fulfillment_plan_id <> NEW.fulfillment_plan_id OR
     v_recognition.supplier_purchase_order_package_id <> NEW.supplier_purchase_order_package_id OR
     v_package.supplier_profile_id <> NEW.supplier_profile_id OR
     v_requirement.customer_contact_id IS DISTINCT FROM NEW.customer_contact_id THEN
    RAISE EXCEPTION 'relationship memory tenant, order, customer, supplier, or fulfillment lineage mismatch';
  END IF;
  IF v_plan.status <> 'delivered' OR v_plan.delivered_at IS NULL OR
     v_plan.delivered_at <> NEW.delivered_at THEN
    RAISE EXCEPTION 'relationship memory requires the exact delivered fulfillment evidence';
  END IF;
  IF v_recognition.currency_code <> NEW.currency_code OR
     v_recognition.revenue_minor <> NEW.revenue_minor OR
     v_recognition.actual_cost_minor <> NEW.actual_cost_minor OR
     v_recognition.actual_gross_margin_minor <> NEW.actual_gross_margin_minor THEN
    RAISE EXCEPTION 'relationship memory exact financial evidence mismatch';
  END IF;
  IF regexp_replace(trim(v_package.product_name), '\s+', ' ', 'g') <> NEW.product_name OR
     nullif(regexp_replace(trim(coalesce(v_package.specification, '')), '\s+', ' ', 'g'), '') IS DISTINCT FROM NEW.specification OR
     regexp_replace(trim(v_package.offered_quantity), '\s+', ' ', 'g') <> NEW.quantity_text OR
     regexp_replace(trim(v_package.unit_of_measure), '\s+', ' ', 'g') <> NEW.unit_of_measure OR
     regexp_replace(trim(v_package.destination), '\s+', ' ', 'g') <> NEW.destination OR
     nullif(regexp_replace(trim(coalesce(v_package.country_of_origin, '')), '\s+', ' ', 'g'), '') IS DISTINCT FROM NEW.country_of_origin THEN
    RAISE EXCEPTION 'relationship memory product evidence mismatch';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS industrial_rel_memory_validate ON industrial_transaction_relationship_memories;
CREATE TRIGGER industrial_rel_memory_validate
BEFORE INSERT OR UPDATE ON industrial_transaction_relationship_memories
FOR EACH ROW EXECUTE FUNCTION exportunity_validate_industrial_relationship_memory();

CREATE OR REPLACE FUNCTION exportunity_relationship_memories_are_immutable()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'industrial relationship memories are immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS industrial_rel_memory_immutable_update ON industrial_transaction_relationship_memories;
CREATE TRIGGER industrial_rel_memory_immutable_update
BEFORE UPDATE ON industrial_transaction_relationship_memories
FOR EACH ROW EXECUTE FUNCTION exportunity_relationship_memories_are_immutable();
DROP TRIGGER IF EXISTS industrial_rel_memory_immutable_delete ON industrial_transaction_relationship_memories;
CREATE TRIGGER industrial_rel_memory_immutable_delete
BEFORE DELETE ON industrial_transaction_relationship_memories
FOR EACH ROW EXECUTE FUNCTION exportunity_relationship_memories_are_immutable();

CREATE OR REPLACE FUNCTION exportunity_validate_relationship_continuity_review()
RETURNS trigger AS $$
DECLARE
  v_memory_tenant integer;
BEGIN
  SELECT tenant_id INTO v_memory_tenant
  FROM industrial_transaction_relationship_memories
  WHERE id = NEW.memory_id
  FOR SHARE;
  IF v_memory_tenant IS NULL OR v_memory_tenant <> NEW.tenant_id THEN
    RAISE EXCEPTION 'relationship continuity memory tenant mismatch';
  END IF;
  IF NEW.external_communication_authorized OR NEW.external_communication_executed OR
     NEW.external_message_reference IS NOT NULL THEN
    RAISE EXCEPTION 'relationship continuity review cannot authorize or execute external communication';
  END IF;
  IF NEW.status = 'review_required' AND (
    NEW.approved_by_user_id IS NOT NULL OR NEW.approved_at IS NOT NULL OR
    NEW.decision_reason IS NOT NULL OR NEW.decision_checklist <> '{}'::jsonb
  ) THEN
    RAISE EXCEPTION 'unapproved relationship continuity review cannot contain approval evidence';
  END IF;
  IF NEW.status = 'approved_internal' AND (
    NEW.approved_by_user_id IS NULL OR NEW.approved_at IS NULL OR
    NEW.proposed_next_review_at IS NULL OR length(trim(NEW.decision_reason)) < 12 OR
    NOT (NEW.decision_checklist @> '{"transactionOutcomeReviewed": true, "customerIdentityAndConsentReviewed": true, "supplierEvidenceReviewed": true, "reviewTimingConfirmed": true, "noExternalCommunication": true}'::jsonb)
  ) THEN
    RAISE EXCEPTION 'approved relationship continuity review requires complete internal evidence';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS industrial_rel_continuity_validate ON industrial_relationship_continuity_reviews;
CREATE TRIGGER industrial_rel_continuity_validate
BEFORE INSERT OR UPDATE ON industrial_relationship_continuity_reviews
FOR EACH ROW EXECUTE FUNCTION exportunity_validate_relationship_continuity_review();

CREATE OR REPLACE FUNCTION exportunity_relationship_continuity_updates_are_bounded()
RETURNS trigger AS $$
BEGIN
  IF OLD.tenant_id <> NEW.tenant_id OR OLD.memory_id <> NEW.memory_id OR
     OLD.recommended_action <> NEW.recommended_action OR
     OLD.consent_status <> NEW.consent_status OR OLD.is_dnc <> NEW.is_dnc OR
     OLD.external_communication_authorized <> NEW.external_communication_authorized OR
     OLD.external_communication_executed <> NEW.external_communication_executed OR
     OLD.external_message_reference IS DISTINCT FROM NEW.external_message_reference THEN
    RAISE EXCEPTION 'relationship continuity source evidence is immutable';
  END IF;
  IF OLD.status <> 'review_required' OR NEW.status <> 'approved_internal' THEN
    RAISE EXCEPTION 'relationship continuity permits only review_required to approved_internal';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS industrial_rel_continuity_bounded_update ON industrial_relationship_continuity_reviews;
CREATE TRIGGER industrial_rel_continuity_bounded_update
BEFORE UPDATE ON industrial_relationship_continuity_reviews
FOR EACH ROW EXECUTE FUNCTION exportunity_relationship_continuity_updates_are_bounded();

CREATE OR REPLACE FUNCTION exportunity_relationship_continuity_deletes_are_forbidden()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'industrial relationship continuity evidence cannot be deleted';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS industrial_rel_continuity_forbid_delete ON industrial_relationship_continuity_reviews;
CREATE TRIGGER industrial_rel_continuity_forbid_delete
BEFORE DELETE ON industrial_relationship_continuity_reviews
FOR EACH ROW EXECUTE FUNCTION exportunity_relationship_continuity_deletes_are_forbidden();
