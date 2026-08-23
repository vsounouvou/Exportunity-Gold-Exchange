ALTER TABLE industrial_orders
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid',
  ADD COLUMN IF NOT EXISTS paid_amount numeric(16,2),
  ADD COLUMN IF NOT EXISTS paid_currency_code text,
  ADD COLUMN IF NOT EXISTS paid_at timestamp,
  ADD COLUMN IF NOT EXISTS last_payment_id uuid;

CREATE INDEX IF NOT EXISTS industrial_orders_tenant_payment_status_idx
  ON industrial_orders(tenant_id, payment_status, updated_at);
