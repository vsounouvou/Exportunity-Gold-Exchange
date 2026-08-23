-- Private exact actual-cost ledger and proof-gated revenue recognition for
-- Exportunity industrial orders. Financial evidence is immutable; corrections
-- are additive reversals. No row can claim an external accounting journal.

DO $$ BEGIN
  CREATE TYPE industrial_actual_cost_direction AS ENUM ('cost', 'reversal');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE industrial_actual_cost_category AS ENUM (
    'supplier',
    'inspection',
    'freight',
    'customs',
    'last_mile',
    'duties_taxes',
    'banking_provider_fees',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE industrial_revenue_recognition_status AS ENUM (
    'approval_required',
    'recognized'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS industrial_order_actual_cost_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL REFERENCES industrial_orders(id) ON DELETE RESTRICT,
  fulfillment_plan_id uuid NOT NULL REFERENCES industrial_fulfillment_plans(id) ON DELETE RESTRICT,
  fulfillment_service_id uuid REFERENCES industrial_fulfillment_services(id) ON DELETE RESTRICT,
  supplier_purchase_order_package_id uuid REFERENCES industrial_supplier_purchase_order_packages(id) ON DELETE RESTRICT,
  reverses_cost_entry_id uuid REFERENCES industrial_order_actual_cost_entries(id) ON DELETE RESTRICT,
  reference_code text NOT NULL,
  direction industrial_actual_cost_direction NOT NULL DEFAULT 'cost',
  category industrial_actual_cost_category NOT NULL,
  currency_code text NOT NULL,
  amount_minor numeric(30,0) NOT NULL,
  cost_reference text NOT NULL,
  description text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence_hash text NOT NULL,
  entry_hash text NOT NULL,
  incurred_at timestamptz NOT NULL,
  recorded_reason text NOT NULL,
  recorded_by_user_id integer NOT NULL REFERENCES ece_users(id) ON DELETE RESTRICT,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  external_accounting_posted boolean NOT NULL DEFAULT false,
  external_accounting_reference text
);

CREATE UNIQUE INDEX IF NOT EXISTS industrial_actual_cost_tenant_reference_uq
  ON industrial_order_actual_cost_entries(tenant_id, reference_code);
CREATE UNIQUE INDEX IF NOT EXISTS industrial_actual_cost_tenant_hash_uq
  ON industrial_order_actual_cost_entries(tenant_id, entry_hash);
CREATE INDEX IF NOT EXISTS industrial_actual_cost_tenant_order_idx
  ON industrial_order_actual_cost_entries(tenant_id, order_id, recorded_at);
CREATE INDEX IF NOT EXISTS industrial_actual_cost_reversal_idx
  ON industrial_order_actual_cost_entries(reverses_cost_entry_id);

DO $$ BEGIN
  ALTER TABLE industrial_order_actual_cost_entries
    ADD CONSTRAINT industrial_actual_cost_amount_check
    CHECK (amount_minor > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE industrial_order_actual_cost_entries
    ADD CONSTRAINT industrial_actual_cost_currency_check
    CHECK (currency_code ~ '^[A-Z]{3}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE industrial_order_actual_cost_entries
    ADD CONSTRAINT industrial_actual_cost_evidence_check
    CHECK (
      jsonb_typeof(evidence) = 'array'
      AND jsonb_array_length(evidence) > 0
      AND length(trim(cost_reference)) >= 3
      AND length(trim(description)) >= 3
      AND length(trim(recorded_reason)) >= 12
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE industrial_order_actual_cost_entries
    ADD CONSTRAINT industrial_actual_cost_hashes_check
    CHECK (
      evidence_hash ~ '^[a-f0-9]{64}$'
      AND entry_hash ~ '^[a-f0-9]{64}$'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE industrial_order_actual_cost_entries
    ADD CONSTRAINT industrial_actual_cost_reversal_shape_check
    CHECK (
      (direction = 'cost' AND reverses_cost_entry_id IS NULL)
      OR (direction = 'reversal' AND reverses_cost_entry_id IS NOT NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE industrial_order_actual_cost_entries
    ADD CONSTRAINT industrial_actual_cost_no_external_check
    CHECK (
      external_accounting_posted = false
      AND external_accounting_reference IS NULL
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS industrial_order_revenue_recognitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL REFERENCES industrial_orders(id) ON DELETE RESTRICT,
  customer_quote_id uuid NOT NULL REFERENCES industrial_quotes(id) ON DELETE RESTRICT,
  source_payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  procurement_authorization_id uuid NOT NULL REFERENCES industrial_procurement_authorizations(id) ON DELETE RESTRICT,
  supplier_purchase_order_package_id uuid NOT NULL REFERENCES industrial_supplier_purchase_order_packages(id) ON DELETE RESTRICT,
  fulfillment_plan_id uuid NOT NULL REFERENCES industrial_fulfillment_plans(id) ON DELETE RESTRICT,
  delivery_proof_event_id uuid NOT NULL REFERENCES industrial_fulfillment_events(id) ON DELETE RESTRICT,
  reference_code text NOT NULL,
  status industrial_revenue_recognition_status NOT NULL DEFAULT 'approval_required',
  currency_code text NOT NULL,
  revenue_minor numeric(30,0) NOT NULL,
  actual_cost_minor numeric(30,0) NOT NULL,
  actual_gross_margin_minor numeric(30,0) NOT NULL,
  planned_cost_minor numeric(30,0) NOT NULL,
  planned_margin_minor numeric(30,0) NOT NULL,
  cost_variance_minor numeric(30,0) NOT NULL,
  margin_variance_minor numeric(30,0) NOT NULL,
  cost_entry_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  cost_evidence_hash text NOT NULL,
  delivery_proof_hash text NOT NULL,
  source_pricing_hash text NOT NULL,
  source_order_confirmation_hash text NOT NULL,
  recognition_hash text NOT NULL,
  source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  approval_checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  prepared_reason text NOT NULL,
  prepared_by_user_id integer NOT NULL REFERENCES ece_users(id) ON DELETE RESTRICT,
  prepared_at timestamptz NOT NULL DEFAULT now(),
  recognized_reason text,
  recognized_by_user_id integer REFERENCES ece_users(id) ON DELETE RESTRICT,
  recognized_at timestamptz,
  external_journal_posted boolean NOT NULL DEFAULT false,
  external_journal_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS industrial_revenue_recognition_tenant_order_uq
  ON industrial_order_revenue_recognitions(tenant_id, order_id);
CREATE UNIQUE INDEX IF NOT EXISTS industrial_revenue_recognition_tenant_reference_uq
  ON industrial_order_revenue_recognitions(tenant_id, reference_code);
CREATE UNIQUE INDEX IF NOT EXISTS industrial_revenue_recognition_tenant_hash_uq
  ON industrial_order_revenue_recognitions(tenant_id, recognition_hash);
CREATE INDEX IF NOT EXISTS industrial_revenue_recognition_tenant_status_idx
  ON industrial_order_revenue_recognitions(tenant_id, status, updated_at);

DO $$ BEGIN
  ALTER TABLE industrial_order_revenue_recognitions
    ADD CONSTRAINT industrial_revenue_recognition_currency_check
    CHECK (currency_code ~ '^[A-Z]{3}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE industrial_order_revenue_recognitions
    ADD CONSTRAINT industrial_revenue_recognition_amounts_check
    CHECK (
      revenue_minor > 0
      AND actual_cost_minor > 0
      AND planned_cost_minor >= 0
      AND actual_gross_margin_minor = revenue_minor - actual_cost_minor
      AND cost_variance_minor = actual_cost_minor - planned_cost_minor
      AND margin_variance_minor = actual_gross_margin_minor - planned_margin_minor
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE industrial_order_revenue_recognitions
    ADD CONSTRAINT industrial_revenue_recognition_cost_entries_check
    CHECK (
      jsonb_typeof(cost_entry_ids) = 'array'
      AND jsonb_array_length(cost_entry_ids) > 0
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE industrial_order_revenue_recognitions
    ADD CONSTRAINT industrial_revenue_recognition_hashes_check
    CHECK (
      cost_evidence_hash ~ '^[a-f0-9]{64}$'
      AND delivery_proof_hash ~ '^[a-f0-9]{64}$'
      AND source_pricing_hash ~ '^[a-f0-9]{64}$'
      AND source_order_confirmation_hash ~ '^[a-f0-9]{64}$'
      AND recognition_hash ~ '^[a-f0-9]{64}$'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE industrial_order_revenue_recognitions
    ADD CONSTRAINT industrial_revenue_recognition_evidence_check
    CHECK (
      status <> 'recognized'
      OR (
        recognized_by_user_id IS NOT NULL
        AND recognized_at IS NOT NULL
        AND length(trim(recognized_reason)) >= 12
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE industrial_order_revenue_recognitions
    ADD CONSTRAINT industrial_revenue_recognition_no_external_check
    CHECK (
      external_journal_posted = false
      AND external_journal_reference IS NULL
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION enforce_industrial_actual_cost_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  plan_row industrial_fulfillment_plans%ROWTYPE;
  service_row industrial_fulfillment_services%ROWTYPE;
  package_row industrial_supplier_purchase_order_packages%ROWTYPE;
  original_row industrial_order_actual_cost_entries%ROWTYPE;
  reversed_minor numeric(30,0);
  expected_service_type text;
BEGIN
  SELECT * INTO plan_row
  FROM industrial_fulfillment_plans
  WHERE id = NEW.fulfillment_plan_id;
  IF NOT FOUND OR plan_row.tenant_id <> NEW.tenant_id OR plan_row.order_id <> NEW.order_id THEN
    RAISE EXCEPTION 'industrial_actual_cost_plan_lineage_invalid';
  END IF;
  IF plan_row.status IN ('release_review', 'cancelled') THEN
    RAISE EXCEPTION 'industrial_actual_cost_fulfillment_not_active';
  END IF;
  IF EXISTS (
    SELECT 1 FROM industrial_order_revenue_recognitions
    WHERE tenant_id = NEW.tenant_id AND order_id = NEW.order_id AND status = 'recognized'
  ) THEN
    RAISE EXCEPTION 'industrial_actual_cost_ledger_closed';
  END IF;

  expected_service_type := CASE NEW.category::text
    WHEN 'inspection' THEN 'inspection'
    WHEN 'freight' THEN 'freight'
    WHEN 'customs' THEN 'customs'
    WHEN 'last_mile' THEN 'last_mile'
    ELSE NULL
  END;
  IF expected_service_type IS NOT NULL THEN
    IF NEW.fulfillment_service_id IS NULL THEN
      RAISE EXCEPTION 'industrial_actual_cost_service_required';
    END IF;
    SELECT * INTO service_row FROM industrial_fulfillment_services
    WHERE id = NEW.fulfillment_service_id;
    IF NOT FOUND
      OR service_row.tenant_id <> NEW.tenant_id
      OR service_row.order_id <> NEW.order_id
      OR service_row.plan_id <> NEW.fulfillment_plan_id
      OR service_row.service_type::text <> expected_service_type
    THEN
      RAISE EXCEPTION 'industrial_actual_cost_service_lineage_invalid';
    END IF;
  END IF;

  IF NEW.category = 'supplier' THEN
    IF NEW.supplier_purchase_order_package_id IS NULL THEN
      RAISE EXCEPTION 'industrial_actual_cost_supplier_package_required';
    END IF;
    SELECT * INTO package_row FROM industrial_supplier_purchase_order_packages
    WHERE id = NEW.supplier_purchase_order_package_id;
    IF NOT FOUND
      OR package_row.tenant_id <> NEW.tenant_id
      OR package_row.order_id <> NEW.order_id
      OR package_row.fulfillment_plan_id <> NEW.fulfillment_plan_id
      OR package_row.status <> 'approved_for_submission'
    THEN
      RAISE EXCEPTION 'industrial_actual_cost_supplier_package_invalid';
    END IF;
  END IF;

  IF NEW.direction = 'reversal' THEN
    SELECT * INTO original_row FROM industrial_order_actual_cost_entries
    WHERE id = NEW.reverses_cost_entry_id;
    IF NOT FOUND
      OR original_row.tenant_id <> NEW.tenant_id
      OR original_row.order_id <> NEW.order_id
      OR original_row.direction <> 'cost'
      OR original_row.category <> NEW.category
      OR original_row.currency_code <> NEW.currency_code
    THEN
      RAISE EXCEPTION 'industrial_actual_cost_reversal_lineage_invalid';
    END IF;
    SELECT COALESCE(SUM(amount_minor), 0) INTO reversed_minor
    FROM industrial_order_actual_cost_entries
    WHERE reverses_cost_entry_id = original_row.id AND direction = 'reversal';
    IF reversed_minor + NEW.amount_minor > original_row.amount_minor THEN
      RAISE EXCEPTION 'industrial_actual_cost_reversal_exceeds_original';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS industrial_actual_cost_insert_guard
  ON industrial_order_actual_cost_entries;
CREATE TRIGGER industrial_actual_cost_insert_guard
BEFORE INSERT ON industrial_order_actual_cost_entries
FOR EACH ROW EXECUTE FUNCTION enforce_industrial_actual_cost_insert();

CREATE OR REPLACE FUNCTION prevent_industrial_actual_cost_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'industrial_actual_cost_entries_are_immutable';
END $$;

DROP TRIGGER IF EXISTS industrial_actual_cost_immutable_guard
  ON industrial_order_actual_cost_entries;
CREATE TRIGGER industrial_actual_cost_immutable_guard
BEFORE UPDATE OR DELETE ON industrial_order_actual_cost_entries
FOR EACH ROW EXECUTE FUNCTION prevent_industrial_actual_cost_mutation();

CREATE OR REPLACE FUNCTION enforce_industrial_revenue_recognition()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  source_ok boolean;
  ledger_total numeric(30,0);
  supplier_cost_count integer;
  ledger_ids jsonb;
  ledger_count integer;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM industrial_orders o
    JOIN industrial_quotes q
      ON q.id = NEW.customer_quote_id
      AND q.tenant_id = NEW.tenant_id
      AND q.id = o.quote_id
    JOIN payments p
      ON p.id = NEW.source_payment_id
      AND p.tenant_id = NEW.tenant_id
      AND p.target_id = o.id::text
      AND p.purpose = 'INDUSTRIAL_ORDER_PAYMENT'
      AND p.status = 'succeeded'
    JOIN industrial_procurement_authorizations a
      ON a.id = NEW.procurement_authorization_id
      AND a.tenant_id = NEW.tenant_id
      AND a.order_id = o.id
      AND a.status = 'approved'
    JOIN industrial_supplier_purchase_order_packages po
      ON po.id = NEW.supplier_purchase_order_package_id
      AND po.tenant_id = NEW.tenant_id
      AND po.order_id = o.id
      AND po.status = 'approved_for_submission'
    JOIN industrial_fulfillment_plans fp
      ON fp.id = NEW.fulfillment_plan_id
      AND fp.tenant_id = NEW.tenant_id
      AND fp.order_id = o.id
      AND fp.status = 'delivered'
      AND fp.delivered_at IS NOT NULL
    JOIN industrial_fulfillment_events fe
      ON fe.id = NEW.delivery_proof_event_id
      AND fe.tenant_id = NEW.tenant_id
      AND fe.order_id = o.id
      AND fe.plan_id = fp.id
      AND fe.event_type = 'delivery_proof_recorded'
      AND length(trim(COALESCE(fe.proof->>'method', ''))) > 0
      AND length(trim(COALESCE(fe.proof->>'deliveredAt', ''))) > 0
    WHERE o.id = NEW.order_id
      AND o.tenant_id = NEW.tenant_id
      AND o.status = 'completed'
      AND o.payment_status = 'paid'
      AND o.last_payment_id = p.id
      AND o.currency_code = NEW.currency_code
      AND p.currency = NEW.currency_code
      AND p.amount::numeric = NEW.revenue_minor
      AND o.total_amount_minor = NEW.revenue_minor
      AND q.customer_price_minor = NEW.revenue_minor
      AND q.total_cost_minor = NEW.planned_cost_minor
      AND q.margin_minor = NEW.planned_margin_minor
      AND a.source_payment_id = p.id
      AND a.fulfillment_plan_id = fp.id
      AND po.procurement_authorization_id = a.id
      AND po.fulfillment_plan_id = fp.id
  ) INTO source_ok;
  IF NOT source_ok THEN
    RAISE EXCEPTION 'industrial_revenue_recognition_source_invalid';
  END IF;

  SELECT
    COALESCE(SUM(CASE WHEN direction = 'cost' THEN amount_minor ELSE -amount_minor END), 0),
    COUNT(*) FILTER (WHERE category = 'supplier' AND direction = 'cost'),
    COALESCE(jsonb_agg(id::text ORDER BY entry_hash), '[]'::jsonb),
    COUNT(*)
  INTO ledger_total, supplier_cost_count, ledger_ids, ledger_count
  FROM industrial_order_actual_cost_entries
  WHERE tenant_id = NEW.tenant_id
    AND order_id = NEW.order_id
    AND currency_code = NEW.currency_code;

  IF ledger_total <> NEW.actual_cost_minor
    OR ledger_total <= 0
    OR supplier_cost_count < 1
    OR ledger_count <> jsonb_array_length(NEW.cost_entry_ids)
    OR ledger_ids <> NEW.cost_entry_ids
  THEN
    RAISE EXCEPTION 'industrial_revenue_recognition_cost_ledger_invalid';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS industrial_revenue_recognition_guard
  ON industrial_order_revenue_recognitions;
CREATE TRIGGER industrial_revenue_recognition_guard
BEFORE INSERT OR UPDATE ON industrial_order_revenue_recognitions
FOR EACH ROW EXECUTE FUNCTION enforce_industrial_revenue_recognition();

CREATE OR REPLACE FUNCTION prevent_recognized_revenue_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.status = 'recognized' THEN
    RAISE EXCEPTION 'industrial_recognized_revenue_is_immutable';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS industrial_recognized_revenue_immutable_guard
  ON industrial_order_revenue_recognitions;
CREATE TRIGGER industrial_recognized_revenue_immutable_guard
BEFORE UPDATE OR DELETE ON industrial_order_revenue_recognitions
FOR EACH ROW EXECUTE FUNCTION prevent_recognized_revenue_mutation();

COMMENT ON TABLE industrial_order_actual_cost_entries IS
  'Private immutable exact actual-cost evidence. Corrections use additive reversal rows; external journal posting is impossible here.';
COMMENT ON TABLE industrial_order_revenue_recognitions IS
  'Private exact revenue and margin recognition gated by successful payment, immutable actual costs, completed delivery, and delivery proof.';
