BEGIN;

ALTER TABLE industrial_quotes
  ADD COLUMN IF NOT EXISTS customer_response_hash text,
  ADD COLUMN IF NOT EXISTS customer_response_channel text,
  ADD COLUMN IF NOT EXISTS customer_response_reference text,
  ADD COLUMN IF NOT EXISTS customer_response_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS customer_response_recorded_by_user_id integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'industrial_quotes_customer_response_recorded_by_fkey'
      AND conrelid = 'industrial_quotes'::regclass
  ) THEN
    ALTER TABLE industrial_quotes
      ADD CONSTRAINT industrial_quotes_customer_response_recorded_by_fkey
      FOREIGN KEY (customer_response_recorded_by_user_id)
      REFERENCES ece_users(id)
      ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'industrial_quotes_exact_customer_response_check'
      AND conrelid = 'industrial_quotes'::regclass
  ) THEN
    ALTER TABLE industrial_quotes
      ADD CONSTRAINT industrial_quotes_exact_customer_response_check
      CHECK (
        pricing_version IS NULL
        OR status NOT IN ('accepted', 'declined')
        OR (
          customer_response_hash ~ '^[0-9a-f]{64}$'
          AND customer_response_channel IN (
            'email',
            'whatsapp',
            'phone',
            'platform',
            'signed_document',
            'in_person',
            'other'
          )
          AND char_length(btrim(customer_response_reference)) BETWEEN 8 AND 500
          AND jsonb_typeof(customer_response_evidence) = 'object'
          AND customer_response_recorded_by_user_id IS NOT NULL
          AND responded_at IS NOT NULL
        )
      ) NOT VALID;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS industrial_quotes_tenant_customer_response_hash_unique
  ON industrial_quotes(tenant_id, customer_response_hash)
  WHERE customer_response_hash IS NOT NULL;

ALTER TABLE industrial_orders
  ALTER COLUMN total_amount TYPE numeric(30,3) USING total_amount::numeric(30,3),
  ADD COLUMN IF NOT EXISTS total_amount_minor numeric(30,0),
  ADD COLUMN IF NOT EXISTS source_pricing_hash text,
  ADD COLUMN IF NOT EXISTS customer_response_hash text,
  ADD COLUMN IF NOT EXISTS order_confirmation_hash text,
  ADD COLUMN IF NOT EXISTS order_confirmation_checklist jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'industrial_orders_exact_confirmation_check'
      AND conrelid = 'industrial_orders'::regclass
  ) THEN
    ALTER TABLE industrial_orders
      ADD CONSTRAINT industrial_orders_exact_confirmation_check
      CHECK (
        source_pricing_hash IS NULL
        OR (
          source_pricing_hash ~ '^[0-9a-f]{64}$'
          AND customer_response_hash ~ '^[0-9a-f]{64}$'
          AND order_confirmation_hash ~ '^[0-9a-f]{64}$'
          AND total_amount_minor IS NOT NULL
          AND total_amount_minor > 0
          AND total_amount IS NOT NULL
          AND total_amount > 0
          AND jsonb_typeof(order_confirmation_checklist) = 'object'
          AND confirmed_by_user_id IS NOT NULL
          AND confirmed_at IS NOT NULL
        )
      ) NOT VALID;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS industrial_orders_tenant_confirmation_hash_unique
  ON industrial_orders(tenant_id, order_confirmation_hash)
  WHERE order_confirmation_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS industrial_orders_tenant_source_pricing_hash_idx
  ON industrial_orders(tenant_id, source_pricing_hash)
  WHERE source_pricing_hash IS NOT NULL;

COMMENT ON COLUMN industrial_quotes.customer_response_hash IS
  'SHA-256 binding the exact offer pricing hash to evidenced customer acceptance or decline.';
COMMENT ON COLUMN industrial_orders.total_amount_minor IS
  'Exact accepted customer price in ISO-currency minor units; canonical order creation never uses binary floating point.';
COMMENT ON COLUMN industrial_orders.order_confirmation_hash IS
  'Idempotency and evidence hash binding pricing, customer response, confirmation rationale, and planned delivery.';

COMMIT;

-- Rollback doctrine: retain acceptance, order, financial, and audit evidence.
-- Disable the canonical actions and apply an additive forward-fix migration;
-- do not drop these columns, rewrite hashes, or delete historical orders.
