-- Stamped Gold backend hardening:
-- - runtime-safe columns for SKU + item views
-- - partner mapping for jeweller-pro accounts
-- - vault and quote support tables

DO $$
BEGIN
  ALTER TYPE stamped_gold_item_status ADD VALUE IF NOT EXISTS 'CREATED';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE stamped_gold_item_status ADD VALUE IF NOT EXISTS 'ASSIGNED';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE stamped_gold_item_status ADD VALUE IF NOT EXISTS 'ENGRAVED';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE stamped_gold_item_status ADD VALUE IF NOT EXISTS 'SEALED';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE stamped_gold_item_status ADD VALUE IF NOT EXISTS 'CERTIFIED';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE stamped_gold_item_status ADD VALUE IF NOT EXISTS 'IN_VAULT';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE stamped_gold_item_status ADD VALUE IF NOT EXISTS 'READY_PICKUP';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TYPE stamped_gold_item_status ADD VALUE IF NOT EXISTS 'OPENED_VOID';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE stamped_gold_skus
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS product_type text CHECK (product_type IN ('BAR', 'COIN')),
  ADD COLUMN IF NOT EXISTS weight_g numeric(10, 3),
  ADD COLUMN IF NOT EXISTS karat integer,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

ALTER TABLE stamped_gold_items
  ADD COLUMN IF NOT EXISTS serial text,
  ADD COLUMN IF NOT EXISTS partner_jeweller_id uuid REFERENCES partner_jewellers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS certificate_id uuid,
  ADD COLUMN IF NOT EXISTS qr_token text;

CREATE UNIQUE INDEX IF NOT EXISTS stamped_gold_items_tenant_serial_alias_uniq
  ON stamped_gold_items (tenant_id, serial);

CREATE UNIQUE INDEX IF NOT EXISTS stamped_gold_items_tenant_qr_token_uniq
  ON stamped_gold_items (tenant_id, qr_token);

CREATE INDEX IF NOT EXISTS stamped_gold_items_tenant_partner_idx
  ON stamped_gold_items (tenant_id, partner_jeweller_id);

CREATE INDEX IF NOT EXISTS stamped_gold_skus_tenant_active_idx
  ON stamped_gold_skus (tenant_id, is_active);

CREATE TABLE IF NOT EXISTS partner_jeweller_users (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  partner_jeweller_id uuid NOT NULL REFERENCES partner_jewellers(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES ece_users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('OWNER', 'STAFF')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, partner_jeweller_id, user_id)
);

CREATE INDEX IF NOT EXISTS partner_jeweller_users_user_idx
  ON partner_jeweller_users (tenant_id, user_id);

CREATE TABLE IF NOT EXISTS vault_storage (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES stamped_gold_items(id) ON DELETE CASCADE,
  owner_user_id integer NOT NULL REFERENCES ece_users(id) ON DELETE CASCADE,
  stored_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  notes text
);

CREATE INDEX IF NOT EXISTS vault_storage_tenant_idx
  ON vault_storage (tenant_id, stored_at DESC);

CREATE TABLE IF NOT EXISTS gold_price_ticks (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'XAUUSD',
  xau_usd numeric(18, 6) NOT NULL,
  usd_xof numeric(18, 6) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gold_price_ticks_tenant_time_idx
  ON gold_price_ticks (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS bar_quotes (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES ece_users(id) ON DELETE CASCADE,
  sku_id uuid NOT NULL REFERENCES stamped_gold_skus(id) ON DELETE CASCADE,
  price_per_g_xof numeric(18, 2) NOT NULL,
  total_xof numeric(18, 2) NOT NULL,
  breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  valid_until timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('ACTIVE', 'EXPIRED', 'USED')) DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bar_quotes_tenant_user_idx
  ON bar_quotes (tenant_id, user_id, created_at DESC);
