-- Bourse de l'Or (BDO) — Wallet/Vault/Resale schema (idempotent).
-- Safe to run multiple times.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bdo_vault_unit_status') THEN
    CREATE TYPE bdo_vault_unit_status AS ENUM ('stored', 'delivered', 'listed_for_resale', 'sold');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bdo_delivery_status') THEN
    CREATE TYPE bdo_delivery_status AS ENUM ('created', 'in_transit', 'delivered', 'cancelled');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bdo_resale_authorization_status') THEN
    CREATE TYPE bdo_resale_authorization_status AS ENUM ('active', 'revoked', 'expired');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bdo_secondary_market_listing_status') THEN
    CREATE TYPE bdo_secondary_market_listing_status AS ENUM ('active', 'sold', 'expired', 'cancelled');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'bdo_secondary_market_trade_status') THEN
    CREATE TYPE bdo_secondary_market_trade_status AS ENUM ('completed', 'failed', 'cancelled');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS bdo_gold_unit_definitions (
  id SERIAL PRIMARY KEY,
  unit_size_grams INTEGER NOT NULL UNIQUE,
  purity_min NUMERIC(5, 2),
  purity_max NUMERIC(5, 2),
  availability BOOLEAN NOT NULL DEFAULT TRUE,
  caps_by_tier JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bdo_pricing_snapshots (
  id SERIAL PRIMARY KEY,
  price_per_gram NUMERIC(15, 6) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'XOF',
  pricing_method_id TEXT NOT NULL DEFAULT 'internal',
  source_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bdo_inventory_lots (
  id SERIAL PRIMARY KEY,
  source_type TEXT NOT NULL DEFAULT 'other',
  source_id INTEGER,
  verified_weight_grams NUMERIC(15, 4) NOT NULL,
  verified_purity NUMERIC(6, 4),
  custody_location TEXT,
  verification_level TEXT DEFAULT 'standard',
  docs JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'available',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT bdo_inventory_lots_source_type_check CHECK (source_type IN ('supplier_purchase', 'inventory_declaration', 'other')),
  CONSTRAINT bdo_inventory_lots_status_check CHECK (status IN ('available', 'allocated', 'depleted'))
);

CREATE TABLE IF NOT EXISTS bdo_virtual_vaults (
  id SERIAL PRIMARY KEY,
  owner_user_id INTEGER NOT NULL UNIQUE REFERENCES ece_users(id) ON DELETE CASCADE,
  custody_location TEXT DEFAULT 'virtual_vault',
  status TEXT NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT bdo_virtual_vaults_status_check CHECK (status IN ('active', 'suspended'))
);

CREATE TABLE IF NOT EXISTS bdo_gold_acquisition_records (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES ece_users(id) ON DELETE CASCADE,
  unit_size_grams INTEGER NOT NULL,
  purity NUMERIC(6, 4) NOT NULL DEFAULT 0.9950,
  "timestamp" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  price_per_gram NUMERIC(15, 6) NOT NULL,
  total_price NUMERIC(20, 4) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'XOF',
  pricing_snapshot_id INTEGER REFERENCES bdo_pricing_snapshots(id) ON DELETE SET NULL,
  allocated_lot_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  proof_docs JSONB NOT NULL DEFAULT '[]'::jsonb,
  custody_location TEXT,
  lockup_end_date TIMESTAMP,
  status TEXT NOT NULL DEFAULT 'stored',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT bdo_gold_acquisition_records_status_check CHECK (status IN ('stored', 'delivered', 'listed_for_resale', 'sold'))
);

CREATE TABLE IF NOT EXISTS bdo_vault_gold_units (
  id SERIAL PRIMARY KEY,
  vault_id INTEGER NOT NULL REFERENCES bdo_virtual_vaults(id) ON DELETE CASCADE,
  acquisition_id INTEGER REFERENCES bdo_gold_acquisition_records(id) ON DELETE SET NULL,
  unit_size_grams INTEGER NOT NULL,
  purity NUMERIC(6, 4) NOT NULL DEFAULT 0.9950,
  status bdo_vault_unit_status NOT NULL DEFAULT 'stored',
  lockup_end_date TIMESTAMP,
  delivery_status bdo_delivery_status NOT NULL DEFAULT 'created',
  resale_listing_id INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bdo_delivery_orders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES ece_users(id) ON DELETE CASCADE,
  vault_unit_id INTEGER NOT NULL REFERENCES bdo_vault_gold_units(id) ON DELETE CASCADE,
  carrier_id TEXT DEFAULT 'internal',
  destination JSONB NOT NULL DEFAULT '{}'::jsonb,
  fees NUMERIC(15, 2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'XOF',
  status bdo_delivery_status NOT NULL DEFAULT 'created',
  tracking_events JSONB NOT NULL DEFAULT '[]'::jsonb,
  proof_docs JSONB NOT NULL DEFAULT '[]'::jsonb,
  delivered_at TIMESTAMP,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bdo_resale_authorizations (
  id SERIAL PRIMARY KEY,
  vault_unit_id INTEGER NOT NULL REFERENCES bdo_vault_gold_units(id) ON DELETE CASCADE,
  owner_user_id INTEGER NOT NULL REFERENCES ece_users(id) ON DELETE CASCADE,
  authorized_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  commission_rate NUMERIC(5, 4) NOT NULL DEFAULT 0.1500,
  listing_duration_days INTEGER NOT NULL DEFAULT 30,
  pricing_rule JSONB NOT NULL DEFAULT '{}'::jsonb,
  status bdo_resale_authorization_status NOT NULL DEFAULT 'active',
  revoked_at TIMESTAMP,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bdo_secondary_market_listings (
  id SERIAL PRIMARY KEY,
  vault_unit_id INTEGER NOT NULL REFERENCES bdo_vault_gold_units(id) ON DELETE CASCADE,
  seller_user_id INTEGER NOT NULL REFERENCES ece_users(id) ON DELETE CASCADE,
  visible_to TEXT NOT NULL DEFAULT 'confirmed_clients_only',
  pricing_rule JSONB NOT NULL DEFAULT '{}'::jsonb,
  status bdo_secondary_market_listing_status NOT NULL DEFAULT 'active',
  expires_at TIMESTAMP,
  sold_at TIMESTAMP,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bdo_secondary_market_trades (
  id SERIAL PRIMARY KEY,
  listing_id INTEGER NOT NULL REFERENCES bdo_secondary_market_listings(id) ON DELETE CASCADE,
  buyer_user_id INTEGER NOT NULL REFERENCES ece_users(id) ON DELETE CASCADE,
  seller_user_id INTEGER NOT NULL REFERENCES ece_users(id) ON DELETE CASCADE,
  sale_price NUMERIC(20, 4) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'XOF',
  commission_amount NUMERIC(20, 4) NOT NULL DEFAULT 0,
  wallet_transaction_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  status bdo_secondary_market_trade_status NOT NULL DEFAULT 'completed',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS bdo_vault_units_vault_id_idx ON bdo_vault_gold_units(vault_id);
CREATE INDEX IF NOT EXISTS bdo_acq_user_id_idx ON bdo_gold_acquisition_records(user_id);
CREATE INDEX IF NOT EXISTS bdo_listings_status_idx ON bdo_secondary_market_listings(status);
CREATE INDEX IF NOT EXISTS bdo_trades_buyer_idx ON bdo_secondary_market_trades(buyer_user_id);
