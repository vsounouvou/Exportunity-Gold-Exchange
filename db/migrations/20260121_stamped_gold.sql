-- Stamped Gold (Bourse de l'Or) SKU+Item inventory, partner jewellers, and verification scans

DO $$ BEGIN
  CREATE TYPE stamped_gold_type AS ENUM ('COIN', 'BAR');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE stamped_gold_item_status AS ENUM ('IN_STOCK', 'RESERVED', 'SOLD', 'DELIVERED', 'VOID');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE stamped_gold_location_type AS ENUM ('VAULT', 'JEWELLER_PARTNER', 'IN_TRANSIT', 'DELIVERED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE partner_jeweller_stock_mode AS ENUM ('STOCKED', 'JUST_IN_TIME');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS partner_jewellers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text,
  phone text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  stock_mode partner_jeweller_stock_mode NOT NULL DEFAULT 'JUST_IN_TIME',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE marketplace_orders
  ADD COLUMN IF NOT EXISTS pickup_partner_id uuid REFERENCES partner_jewellers(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS stamped_gold_skus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id integer NOT NULL REFERENCES seller_products(id) ON DELETE CASCADE,
  stamped_type stamped_gold_type NOT NULL,
  weight_grams integer NOT NULL,
  purity text NOT NULL,
  metal text NOT NULL DEFAULT 'FINE GOLD',
  brand_text text NOT NULL DEFAULT 'BOURSE DE L''OR',
  serial_prefix text NOT NULL,
  hallmark_text text NOT NULL,
  year integer,
  requires_legal_stamp boolean NOT NULL DEFAULT true,
  sku_code text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, product_id)
);

CREATE INDEX IF NOT EXISTS stamped_gold_skus_tenant_type_idx ON stamped_gold_skus (tenant_id, stamped_type);

CREATE TABLE IF NOT EXISTS stamped_gold_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sku_id uuid NOT NULL REFERENCES stamped_gold_skus(id) ON DELETE CASCADE,
  serial_code text NOT NULL UNIQUE,
  status stamped_gold_item_status NOT NULL DEFAULT 'IN_STOCK',
  current_location_type stamped_gold_location_type NOT NULL DEFAULT 'VAULT',
  current_location_id uuid REFERENCES partner_jewellers(id) ON DELETE SET NULL,
  minted_at timestamptz NOT NULL DEFAULT now(),
  minted_by text,
  order_id integer REFERENCES marketplace_orders(id) ON DELETE SET NULL,
  order_item_id integer REFERENCES marketplace_order_items(id) ON DELETE SET NULL,
  owner_user_id text,
  owner_email text,
  sold_at timestamptz,
  delivered_at timestamptz,
  voided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stamped_gold_items_tenant_sku_status_idx ON stamped_gold_items (tenant_id, sku_id, status);
CREATE INDEX IF NOT EXISTS stamped_gold_items_serial_idx ON stamped_gold_items (serial_code);

CREATE TABLE IF NOT EXISTS stamped_gold_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  item_id uuid NOT NULL UNIQUE REFERENCES stamped_gold_items(id) ON DELETE CASCADE,
  order_id integer REFERENCES marketplace_orders(id) ON DELETE SET NULL,
  owner_user_id text,
  owner_email text,
  pickup_partner_id uuid REFERENCES partner_jewellers(id) ON DELETE SET NULL,
  issued_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stamped_gold_verification_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  item_id uuid REFERENCES stamped_gold_items(id) ON DELETE SET NULL,
  serial_code text NOT NULL,
  scanned_by_user_id text,
  scanner_type text NOT NULL DEFAULT 'PUBLIC',
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stamped_gold_scans_tenant_created_idx ON stamped_gold_verification_scans (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS stamped_gold_scans_serial_idx ON stamped_gold_verification_scans (serial_code);

