-- Exportunity Phase F: extend the pre-existing customer-facing industrial
-- quote ledger with exact, source-linked commercial offer preparation.
-- This migration creates no issued offer, order, payment, message, ranking,
-- or currency conversion. Existing industrial quote and order data is kept.

ALTER TABLE industrial_quotes
  ALTER COLUMN total_amount TYPE numeric(24,3)
  USING total_amount::numeric(24,3);

ALTER TABLE industrial_quotes
  ADD COLUMN IF NOT EXISTS source_supplier_quote_id uuid,
  ADD COLUMN IF NOT EXISTS pricing_version text,
  ADD COLUMN IF NOT EXISTS pricing_hash text,
  ADD COLUMN IF NOT EXISTS supplier_cost_minor numeric(30,0),
  ADD COLUMN IF NOT EXISTS additional_costs_minor numeric(30,0),
  ADD COLUMN IF NOT EXISTS total_cost_minor numeric(30,0),
  ADD COLUMN IF NOT EXISTS target_gross_margin_bps integer,
  ADD COLUMN IF NOT EXISTS margin_minor numeric(30,0),
  ADD COLUMN IF NOT EXISTS customer_price_minor numeric(30,0),
  ADD COLUMN IF NOT EXISTS cost_stack jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS pricing_checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS pricing_notes text,
  ADD COLUMN IF NOT EXISTS pricing_submitted_by_user_id integer,
  ADD COLUMN IF NOT EXISTS pricing_submitted_at timestamp,
  ADD COLUMN IF NOT EXISTS pricing_approved_by_user_id integer,
  ADD COLUMN IF NOT EXISTS pricing_approved_at timestamp,
  ADD COLUMN IF NOT EXISTS pricing_decision_notes text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'industrial_quotes_source_supplier_quote_id_fkey'
      AND conrelid = 'industrial_quotes'::regclass
  ) THEN
    ALTER TABLE industrial_quotes
      ADD CONSTRAINT industrial_quotes_source_supplier_quote_id_fkey
      FOREIGN KEY (source_supplier_quote_id)
      REFERENCES industrial_supplier_quotes(id)
      ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'industrial_quotes_pricing_submitted_by_user_id_fkey'
      AND conrelid = 'industrial_quotes'::regclass
  ) THEN
    ALTER TABLE industrial_quotes
      ADD CONSTRAINT industrial_quotes_pricing_submitted_by_user_id_fkey
      FOREIGN KEY (pricing_submitted_by_user_id)
      REFERENCES ece_users(id)
      ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'industrial_quotes_pricing_approved_by_user_id_fkey'
      AND conrelid = 'industrial_quotes'::regclass
  ) THEN
    ALTER TABLE industrial_quotes
      ADD CONSTRAINT industrial_quotes_pricing_approved_by_user_id_fkey
      FOREIGN KEY (pricing_approved_by_user_id)
      REFERENCES ece_users(id)
      ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'industrial_quotes_exact_pricing_check'
      AND conrelid = 'industrial_quotes'::regclass
  ) THEN
    ALTER TABLE industrial_quotes
      ADD CONSTRAINT industrial_quotes_exact_pricing_check
      CHECK (
        pricing_version IS NULL
        OR (
          source_supplier_quote_id IS NOT NULL
          AND char_length(btrim(pricing_version)) BETWEEN 3 AND 80
          AND pricing_hash ~ '^[0-9a-f]{64}$'
          AND currency_code ~ '^[A-Z]{3}$'
          AND supplier_cost_minor IS NOT NULL
          AND supplier_cost_minor > 0
          AND additional_costs_minor IS NOT NULL
          AND additional_costs_minor >= 0
          AND total_cost_minor IS NOT NULL
          AND total_cost_minor = supplier_cost_minor + additional_costs_minor
          AND target_gross_margin_bps BETWEEN 0 AND 5000
          AND margin_minor IS NOT NULL
          AND margin_minor >= 0
          AND customer_price_minor IS NOT NULL
          AND customer_price_minor = total_cost_minor + margin_minor
          AND total_amount IS NOT NULL
          AND total_amount >= 0
          AND jsonb_typeof(cost_stack) = 'array'
          AND jsonb_array_length(cost_stack) >= 1
          AND jsonb_typeof(pricing_checklist) = 'object'
          AND jsonb_typeof(line_items) = 'array'
          AND (
            status NOT IN ('draft', 'under_review', 'ready_for_account_manager')
            OR visibility = 'exportunity_internal'
          )
        )
      );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'industrial_quotes_pricing_review_state_check'
      AND conrelid = 'industrial_quotes'::regclass
  ) THEN
    ALTER TABLE industrial_quotes
      ADD CONSTRAINT industrial_quotes_pricing_review_state_check
      CHECK (
        pricing_version IS NULL
        OR (
          (
            status <> 'under_review'
            OR (
              pricing_submitted_by_user_id IS NOT NULL
              AND pricing_submitted_at IS NOT NULL
              AND pricing_decision_notes IS NOT NULL
              AND char_length(btrim(pricing_decision_notes)) BETWEEN 24 AND 2000
            )
          )
          AND (
            status NOT IN (
              'ready_for_account_manager',
              'issued',
              'accepted',
              'declined',
              'expired'
            )
            OR (
              pricing_submitted_by_user_id IS NOT NULL
              AND pricing_submitted_at IS NOT NULL
              AND pricing_approved_by_user_id IS NOT NULL
              AND pricing_approved_at IS NOT NULL
              AND pricing_decision_notes IS NOT NULL
              AND char_length(btrim(pricing_decision_notes)) BETWEEN 24 AND 2000
            )
          )
        )
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS industrial_quotes_tenant_pricing_hash_unique
  ON industrial_quotes(tenant_id, pricing_hash);

CREATE INDEX IF NOT EXISTS industrial_quotes_tenant_source_supplier_quote_idx
  ON industrial_quotes(tenant_id, source_supplier_quote_id, status);

COMMENT ON COLUMN industrial_quotes.source_supplier_quote_id IS
  'Qualified canonical supplier-cost source for this internal Exportunity offer draft.';
COMMENT ON COLUMN industrial_quotes.customer_price_minor IS
  'Exact customer price in ISO-currency minor units; never derived with binary floating point.';
COMMENT ON COLUMN industrial_quotes.pricing_hash IS
  'SHA-256 binding supplier evidence, exact cost stack, margin, validity, and customer terms.';

-- Rollback doctrine: preserve financial and commercial evidence. If a defect is
-- found, disable the route and apply an additive forward-fix migration. Do not
-- drop pricing columns or rewrite historical offer, supplier quote, or audit rows.
