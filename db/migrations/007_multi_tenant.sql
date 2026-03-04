-- Multi-tenant core schema (idempotent).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tenant_role') THEN
    CREATE TYPE tenant_role AS ENUM ('SUPER_ADMIN', 'TENANT_ADMIN', 'SHAREHOLDER', 'OPS', 'SUPPORT', 'USER');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'verification_level') THEN
    CREATE TYPE verification_level AS ENUM ('NONE', 'BASIC_VERIFIED', 'GOLD_VERIFIED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS tenants (
  id SERIAL PRIMARY KEY,
  "key" TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  domains JSONB NOT NULL DEFAULT '[]'::jsonb,
  theme_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  feature_flags JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS tenants_key_idx ON tenants ("key");

CREATE TABLE IF NOT EXISTS user_tenant_roles (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES ece_users(id) ON DELETE CASCADE,
  role tenant_role NOT NULL DEFAULT 'USER',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS user_tenant_roles_unique ON user_tenant_roles (tenant_id, user_id, role);

CREATE TABLE IF NOT EXISTS tenant_switch_tokens (
  id SERIAL PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES ece_users(id) ON DELETE CASCADE,
  target_tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO tenants ("key", name, domains, theme_config, feature_flags)
VALUES
  ('bdo', 'Bourse de l''Or', '["boursedelor.com","www.boursedelor.com","localhost","127.0.0.1"]'::jsonb, '{"brand":"bourse"}'::jsonb, '{"goldOnly":true,"multiProduct":false}'::jsonb),
  ('exportunity', 'Exportunity', '["exportunity.net","www.exportunity.net"]'::jsonb, '{"brand":"exportunity"}'::jsonb, '{"goldOnly":false,"multiProduct":true}'::jsonb)
ON CONFLICT ("key") DO UPDATE SET
  name = EXCLUDED.name,
  domains = EXCLUDED.domains,
  theme_config = EXCLUDED.theme_config,
  feature_flags = EXCLUDED.feature_flags,
  updated_at = CURRENT_TIMESTAMP;

ALTER TABLE IF EXISTS ece_users
  ADD COLUMN IF NOT EXISTS verification_level verification_level NOT NULL DEFAULT 'NONE';

-- ECE / Exchange tables
ALTER TABLE IF EXISTS access_requests ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE access_requests SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS access_requests ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE IF EXISTS market_access_requests ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE market_access_requests SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS market_access_requests ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE IF EXISTS sourcing_requests ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE sourcing_requests SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS sourcing_requests ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE IF EXISTS trader_applications ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE trader_applications SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS trader_applications ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE IF EXISTS buyer_profiles ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE buyer_profiles SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS buyer_profiles ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE IF EXISTS government_supplier_lists ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE government_supplier_lists SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS government_supplier_lists ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE IF EXISTS supplier_registry_entries ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE supplier_registry_entries SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS supplier_registry_entries ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE IF EXISTS supplier_profiles ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE supplier_profiles SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS supplier_profiles ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE IF EXISTS shareholder_profiles ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE shareholder_profiles SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS shareholder_profiles ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE IF EXISTS inventory_declarations ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE inventory_declarations SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS inventory_declarations ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE IF EXISTS national_assayers ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE national_assayers SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS national_assayers ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE IF EXISTS assay_reports ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE assay_reports SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS assay_reports ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE IF EXISTS buyer_requests ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE buyer_requests SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS buyer_requests ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE IF EXISTS pricing_quotes ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE pricing_quotes SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS pricing_quotes ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE IF EXISTS ece_contracts ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE ece_contracts SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS ece_contracts ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE IF EXISTS contract_inventory_links ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE contract_inventory_links SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS contract_inventory_links ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE IF EXISTS logistics_partners ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE logistics_partners SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS logistics_partners ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE IF EXISTS ece_shipments ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE ece_shipments SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS ece_shipments ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE IF EXISTS shipment_events ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE shipment_events SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS shipment_events ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE IF EXISTS traceability_records ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE traceability_records SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS traceability_records ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE IF EXISTS ece_chat_messages ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE ece_chat_messages SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS ece_chat_messages ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE IF EXISTS platform_metrics ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE platform_metrics SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS platform_metrics ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE IF EXISTS ece_audit_logs ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE ece_audit_logs SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS ece_audit_logs ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE IF EXISTS producer_categories ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE producer_categories SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS producer_categories ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE IF EXISTS producers ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE producers SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS producers ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE IF EXISTS producer_products ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE producer_products SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS producer_products ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE IF EXISTS producer_conversations ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE producer_conversations SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS producer_conversations ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE IF EXISTS producer_messages ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE producer_messages SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS producer_messages ALTER COLUMN tenant_id SET NOT NULL;

-- Marketplace tables
ALTER TABLE IF EXISTS product_categories ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE product_categories SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS product_categories ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE IF EXISTS sellers ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE sellers SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS sellers ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE IF EXISTS seller_products ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE seller_products SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS seller_products ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE IF EXISTS seller_wallet_transactions ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE seller_wallet_transactions SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS seller_wallet_transactions ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE IF EXISTS buyer_wallets ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE buyer_wallets SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS buyer_wallets ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE IF EXISTS buyer_wallet_transactions ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE buyer_wallet_transactions SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS buyer_wallet_transactions ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE IF EXISTS marketplace_orders ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE marketplace_orders SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS marketplace_orders ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE IF EXISTS marketplace_order_items ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE marketplace_order_items SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS marketplace_order_items ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE IF EXISTS territories ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE territories SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS territories ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE IF EXISTS franchisees ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE franchisees SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS franchisees ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE IF EXISTS franchise_team_members ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE franchise_team_members SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS franchise_team_members ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE IF EXISTS franchise_commissions ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE franchise_commissions SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS franchise_commissions ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE IF EXISTS seller_reviews ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE seller_reviews SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS seller_reviews ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE IF EXISTS p2p_transfers ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE p2p_transfers SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS p2p_transfers ALTER COLUMN tenant_id SET NOT NULL;

-- Gold exchange tables
ALTER TABLE IF EXISTS bureau_d_achat ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE bureau_d_achat SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS bureau_d_achat ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE IF EXISTS gold_offers ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE gold_offers SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS gold_offers ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE IF EXISTS trader_wallets ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE trader_wallets SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS trader_wallets ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE IF EXISTS gold_wallet_transactions ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE gold_wallet_transactions SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS gold_wallet_transactions ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE IF EXISTS gold_groupages ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE gold_groupages SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS gold_groupages ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE IF EXISTS gold_purchase_orders ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE gold_purchase_orders SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS gold_purchase_orders ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE IF EXISTS gold_delivery_events ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE gold_delivery_events SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS gold_delivery_events ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE IF EXISTS gold_origin_documents ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE gold_origin_documents SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS gold_origin_documents ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE IF EXISTS bdo_gold_unit_definitions ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE bdo_gold_unit_definitions SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS bdo_gold_unit_definitions ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE IF EXISTS bdo_pricing_snapshots ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE bdo_pricing_snapshots SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS bdo_pricing_snapshots ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE IF EXISTS bdo_inventory_lots ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE bdo_inventory_lots SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS bdo_inventory_lots ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE IF EXISTS bdo_gold_acquisition_records ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE bdo_gold_acquisition_records SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS bdo_gold_acquisition_records ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE IF EXISTS bdo_virtual_vaults ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE bdo_virtual_vaults SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS bdo_virtual_vaults ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE IF EXISTS bdo_vault_gold_units ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE bdo_vault_gold_units SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS bdo_vault_gold_units ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE IF EXISTS bdo_delivery_orders ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE bdo_delivery_orders SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS bdo_delivery_orders ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE IF EXISTS bdo_resale_authorizations ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE bdo_resale_authorizations SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS bdo_resale_authorizations ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE IF EXISTS bdo_secondary_market_listings ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE bdo_secondary_market_listings SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS bdo_secondary_market_listings ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE IF EXISTS bdo_secondary_market_trades ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE bdo_secondary_market_trades SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS bdo_secondary_market_trades ALTER COLUMN tenant_id SET NOT NULL;

-- Digital contracts
ALTER TABLE IF EXISTS digital_contracts ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE digital_contracts SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS digital_contracts ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE IF EXISTS digital_contract_signatures ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE digital_contract_signatures SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS digital_contract_signatures ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE IF EXISTS purchase_orders ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE purchase_orders SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS purchase_orders ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE IF EXISTS revenue_events ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE revenue_events SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS revenue_events ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE IF EXISTS digital_payouts ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);
UPDATE digital_payouts SET tenant_id = (SELECT id FROM tenants WHERE "key" = 'bdo') WHERE tenant_id IS NULL;
ALTER TABLE IF EXISTS digital_payouts ALTER COLUMN tenant_id SET NOT NULL;
