BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_order_status') THEN
    CREATE TYPE industrial_order_status AS ENUM ('confirmed', 'procurement', 'manufacturing', 'quality_control', 'delivery', 'completed', 'cancelled');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS industrial_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  quote_id uuid NOT NULL REFERENCES industrial_quotes(id),
  requirement_id uuid NOT NULL REFERENCES industrial_requirements(id),
  factory_id uuid REFERENCES industrial_factories(id) ON DELETE SET NULL,
  catalog_item_id uuid REFERENCES industrial_catalog_items(id) ON DELETE SET NULL,
  reference_code text NOT NULL,
  status industrial_order_status NOT NULL DEFAULT 'confirmed',
  currency_code text NOT NULL DEFAULT 'XOF',
  total_amount numeric(16,2),
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  commercial_terms text,
  delivery_notes text,
  internal_notes text,
  source_quote_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  visibility industrial_visibility NOT NULL DEFAULT 'parties_to_transaction',
  confirmed_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  confirmed_at timestamp,
  planned_delivery_at timestamp,
  completed_at timestamp,
  cancelled_at timestamp,
  created_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  updated_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS industrial_orders_tenant_reference_unique
  ON industrial_orders(tenant_id, reference_code);
CREATE UNIQUE INDEX IF NOT EXISTS industrial_orders_tenant_quote_unique
  ON industrial_orders(tenant_id, quote_id);
CREATE INDEX IF NOT EXISTS industrial_orders_tenant_status_idx
  ON industrial_orders(tenant_id, status, updated_at);
CREATE INDEX IF NOT EXISTS industrial_orders_factory_status_idx
  ON industrial_orders(factory_id, status, updated_at);
CREATE INDEX IF NOT EXISTS industrial_orders_requirement_idx
  ON industrial_orders(requirement_id, status);

COMMIT;
