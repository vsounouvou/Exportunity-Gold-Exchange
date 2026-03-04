import { db } from "@db";
import { sql } from "drizzle-orm";

const statements = [
  `DO $$
   BEGIN
     CREATE TYPE finance_provider AS ENUM ('flutterwave', 'stripe', 'bank_transfer', 'paystack', 'kkiapay', 'internal');
   EXCEPTION
     WHEN duplicate_object THEN NULL;
   END $$;`,
  `DO $$
   BEGIN
     CREATE TYPE finance_direction AS ENUM ('in', 'out');
   EXCEPTION
     WHEN duplicate_object THEN NULL;
   END $$;`,
  `DO $$
   BEGIN
     CREATE TYPE finance_tx_type AS ENUM ('payment', 'refund', 'chargeback', 'payout', 'fee', 'adjustment');
   EXCEPTION
     WHEN duplicate_object THEN NULL;
   END $$;`,
  `DO $$
   BEGIN
     CREATE TYPE finance_tx_status AS ENUM ('pending', 'succeeded', 'failed', 'reversed');
   EXCEPTION
     WHEN duplicate_object THEN NULL;
   END $$;`,
  `DO $$
   BEGIN
     CREATE TYPE finance_settlement_status AS ENUM ('unsettled', 'settled', 'unknown');
   EXCEPTION
     WHEN duplicate_object THEN NULL;
   END $$;`,
  `DO $$
   BEGIN
     CREATE TYPE finance_account_status AS ENUM ('active', 'disabled');
   EXCEPTION
     WHEN duplicate_object THEN NULL;
   END $$;`,
  `CREATE TABLE IF NOT EXISTS finance_accounts (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
      provider finance_provider NOT NULL,
      provider_account_id TEXT,
      status finance_account_status NOT NULL DEFAULT 'active',
      meta_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );`,
  `CREATE INDEX IF NOT EXISTS finance_accounts_tenant_provider_idx ON finance_accounts (tenant_id, provider);`,
  `CREATE TABLE IF NOT EXISTS finance_events (
      id BIGSERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      provider finance_provider NOT NULL,
      provider_event_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      occurred_at TIMESTAMPTZ NOT NULL,
      payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      ingested_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );`,
  `CREATE INDEX IF NOT EXISTS finance_events_tenant_provider_occurred_idx ON finance_events (tenant_id, provider, occurred_at DESC);`,
  `CREATE UNIQUE INDEX IF NOT EXISTS finance_events_tenant_provider_event_uidx ON finance_events (tenant_id, provider, provider_event_id);`,
  `CREATE TABLE IF NOT EXISTS finance_transactions (
      id BIGSERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      provider finance_provider NOT NULL,
      provider_tx_id TEXT NOT NULL,
      direction finance_direction NOT NULL,
      tx_type finance_tx_type NOT NULL,
      status finance_tx_status NOT NULL DEFAULT 'pending',
      amount NUMERIC(18, 2) NOT NULL,
      currency CHAR(3) NOT NULL,
      fee_amount NUMERIC(18, 2),
      net_amount NUMERIC(18, 2),
      customer_ref TEXT,
      order_id INTEGER REFERENCES marketplace_orders(id) ON DELETE SET NULL,
      invoice_id TEXT,
      wallet_id TEXT,
      settlement_status finance_settlement_status NOT NULL DEFAULT 'unknown',
      settled_at TIMESTAMPTZ,
      occurred_at TIMESTAMPTZ NOT NULL,
      metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS finance_transactions_provider_tx_type_uidx ON finance_transactions (tenant_id, provider, provider_tx_id, tx_type, direction);`,
  `CREATE INDEX IF NOT EXISTS finance_transactions_tenant_occurred_idx ON finance_transactions (tenant_id, occurred_at DESC);`,
  `CREATE INDEX IF NOT EXISTS finance_transactions_tenant_status_idx ON finance_transactions (tenant_id, status);`,
  `CREATE INDEX IF NOT EXISTS finance_transactions_tenant_currency_idx ON finance_transactions (tenant_id, currency);`,
  `CREATE INDEX IF NOT EXISTS finance_transactions_provider_tx_idx ON finance_transactions (provider, provider_tx_id);`,
  `CREATE TABLE IF NOT EXISTS finance_daily_metrics (
      id BIGSERIAL PRIMARY KEY,
      metric_date DATE NOT NULL,
      tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
      currency CHAR(3) NOT NULL,
      gross_in NUMERIC(18, 2) NOT NULL DEFAULT 0,
      gross_out NUMERIC(18, 2) NOT NULL DEFAULT 0,
      fees NUMERIC(18, 2) NOT NULL DEFAULT 0,
      net NUMERIC(18, 2) NOT NULL DEFAULT 0,
      tx_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS finance_daily_metrics_tenant_currency_uidx
      ON finance_daily_metrics (metric_date, tenant_id, currency)
      WHERE tenant_id IS NOT NULL;`,
  `CREATE UNIQUE INDEX IF NOT EXISTS finance_daily_metrics_global_currency_uidx
      ON finance_daily_metrics (metric_date, currency)
      WHERE tenant_id IS NULL;`,
  `CREATE INDEX IF NOT EXISTS finance_daily_metrics_tenant_date_idx ON finance_daily_metrics (tenant_id, metric_date DESC);`,
];

export async function ensureFinanceTables() {
  for (const statement of statements) {
    await db.execute(sql.raw(statement));
  }
}
