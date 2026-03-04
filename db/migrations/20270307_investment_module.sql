DO $$ BEGIN
  CREATE TYPE investment_opportunity_type AS ENUM ('sme', 'machinery', 'farm', 'factory', 'gold', 'commodities');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE investment_opportunity_status AS ENUM ('draft', 'published', 'archived');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE investment_contract_status AS ENUM ('draft', 'proposed', 'signed', 'funded', 'active', 'completed', 'terminated', 'disputed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE investment_milestone_status AS ENUM ('pending', 'submitted', 'approved', 'rejected', 'released', 'overdue');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE investment_transaction_type AS ENUM ('fund', 'escrow_hold', 'vendor_payment', 'wallet_release', 'refund', 'payout', 'fee', 'marketing_credit_purchase', 'marketing_credit_spend');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE investor_lead_status AS ENUM ('new', 'qualified', 'onboarding', 'closed_lost', 'closed_won');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS investment_opportunities (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type investment_opportunity_type NOT NULL DEFAULT 'sme',
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  country TEXT,
  track_record_badge TEXT NOT NULL DEFAULT 'Verified on platform',
  funding_goal_min NUMERIC(20, 2),
  funding_goal_max NUMERIC(20, 2),
  currency TEXT NOT NULL DEFAULT 'USD',
  use_of_funds JSONB NOT NULL DEFAULT '[]'::jsonb,
  contract_duration_months INTEGER,
  tracked_kpis JSONB NOT NULL DEFAULT '[]'::jsonb,
  return_model TEXT,
  risk_notes TEXT,
  mitigations TEXT,
  narrative TEXT,
  funding_plan JSONB NOT NULL DEFAULT '{}'::jsonb,
  status investment_opportunity_status NOT NULL DEFAULT 'draft',
  featured BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS investment_opportunities_tenant_slug_uniq
  ON investment_opportunities(tenant_id, slug);
CREATE INDEX IF NOT EXISTS investment_opportunities_tenant_status_idx
  ON investment_opportunities(tenant_id, status, sort_order);
CREATE INDEX IF NOT EXISTS investment_opportunities_tenant_type_idx
  ON investment_opportunities(tenant_id, type, sort_order);
CREATE INDEX IF NOT EXISTS investment_opportunities_tenant_published_idx
  ON investment_opportunities(tenant_id, published_at);

CREATE TABLE IF NOT EXISTS investment_contracts (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  opportunity_id INTEGER REFERENCES investment_opportunities(id) ON DELETE SET NULL,
  contract_code TEXT NOT NULL UNIQUE,
  parties JSONB NOT NULL DEFAULT '{}'::jsonb,
  amount NUMERIC(20, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  terms JSONB NOT NULL DEFAULT '{}'::jsonb,
  status investment_contract_status NOT NULL DEFAULT 'draft',
  escrow_wallet_ref TEXT,
  spend_restriction_mode TEXT NOT NULL DEFAULT 'vendor_direct',
  reporting_cadence TEXT NOT NULL DEFAULT 'monthly',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  funded_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  terminated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS investment_contracts_tenant_status_idx
  ON investment_contracts(tenant_id, status, created_at);
CREATE INDEX IF NOT EXISTS investment_contracts_tenant_opportunity_idx
  ON investment_contracts(tenant_id, opportunity_id);

CREATE TABLE IF NOT EXISTS investment_milestones (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contract_id INTEGER NOT NULL REFERENCES investment_contracts(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  amount_to_release NUMERIC(20, 2) NOT NULL,
  due_date TIMESTAMPTZ,
  evidence_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  evidence_submitted JSONB NOT NULL DEFAULT '{}'::jsonb,
  verifier TEXT,
  status investment_milestone_status NOT NULL DEFAULT 'pending',
  approved_at TIMESTAMPTZ,
  released_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS investment_milestones_tenant_contract_idx
  ON investment_milestones(tenant_id, contract_id, due_date);
CREATE INDEX IF NOT EXISTS investment_milestones_tenant_status_idx
  ON investment_milestones(tenant_id, status, due_date);

CREATE TABLE IF NOT EXISTS investment_transactions (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contract_id INTEGER NOT NULL REFERENCES investment_contracts(id) ON DELETE CASCADE,
  milestone_id INTEGER REFERENCES investment_milestones(id) ON DELETE SET NULL,
  tx_type investment_transaction_type NOT NULL,
  amount NUMERIC(20, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  from_wallet TEXT,
  to_wallet TEXT,
  external_ref TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS investment_transactions_tenant_contract_idx
  ON investment_transactions(tenant_id, contract_id, created_at);
CREATE INDEX IF NOT EXISTS investment_transactions_tenant_type_idx
  ON investment_transactions(tenant_id, tx_type, created_at);

CREATE TABLE IF NOT EXISTS investment_reports (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contract_id INTEGER NOT NULL REFERENCES investment_contracts(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  kpis JSONB NOT NULL DEFAULT '{}'::jsonb,
  narrative TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS investment_reports_tenant_contract_idx
  ON investment_reports(tenant_id, contract_id, created_at);
CREATE INDEX IF NOT EXISTS investment_reports_tenant_period_idx
  ON investment_reports(tenant_id, period);

CREATE TABLE IF NOT EXISTS marketing_credits (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contract_id INTEGER REFERENCES investment_contracts(id) ON DELETE SET NULL,
  credits INTEGER NOT NULL DEFAULT 0,
  spent INTEGER NOT NULL DEFAULT 0,
  rules JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketing_credits_tenant_created_idx
  ON marketing_credits(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS marketing_credits_tenant_contract_idx
  ON marketing_credits(tenant_id, contract_id);

CREATE TABLE IF NOT EXISTS investor_leads (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  country TEXT,
  investor_type TEXT,
  interest_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  message TEXT,
  status investor_lead_status NOT NULL DEFAULT 'new',
  notify_status TEXT NOT NULL DEFAULT 'pending',
  notify_error TEXT,
  notified_at TIMESTAMPTZ,
  source_url TEXT,
  user_agent TEXT,
  ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS investor_leads_tenant_created_idx
  ON investor_leads(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS investor_leads_tenant_status_idx
  ON investor_leads(tenant_id, status, created_at);
CREATE INDEX IF NOT EXISTS investor_leads_tenant_email_idx
  ON investor_leads(tenant_id, email);
