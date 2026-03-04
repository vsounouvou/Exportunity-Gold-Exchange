-- Digital Contract module (Investment ↔ Mine ↔ Bureau d’Achat)

-- 1) Extend Bureau d’Achat directory fields
ALTER TABLE bureau_d_achat ADD COLUMN IF NOT EXISTS legal_name TEXT;
ALTER TABLE bureau_d_achat ADD COLUMN IF NOT EXISTS license_number TEXT;
ALTER TABLE bureau_d_achat ADD COLUMN IF NOT EXISTS license_status TEXT DEFAULT 'authorized';
ALTER TABLE bureau_d_achat ADD COLUMN IF NOT EXISTS region TEXT;
ALTER TABLE bureau_d_achat ADD COLUMN IF NOT EXISTS contact_phone TEXT;
ALTER TABLE bureau_d_achat ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE bureau_d_achat ADD COLUMN IF NOT EXISTS services JSONB DEFAULT '["buying"]'::jsonb;
ALTER TABLE bureau_d_achat ADD COLUMN IF NOT EXISTS public_visible BOOLEAN DEFAULT true;

UPDATE bureau_d_achat SET legal_name = name WHERE legal_name IS NULL;
UPDATE bureau_d_achat SET license_number = authorization_number WHERE license_number IS NULL;
UPDATE bureau_d_achat SET license_status = 'authorized' WHERE license_status IS NULL;
UPDATE bureau_d_achat SET services = '["buying"]'::jsonb WHERE services IS NULL;
UPDATE bureau_d_achat SET public_visible = true WHERE public_visible IS NULL;

-- 2) Enums
DO $$ BEGIN
  CREATE TYPE digital_contract_type AS ENUM ('investment_revenue_share', 'offtake_order', 'tri_party_investment_offtake');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE digital_contract_status AS ENUM ('draft', 'pending_signatures', 'active', 'completed', 'terminated');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE digital_payout_frequency AS ENUM ('per_sale', 'per_rotation', 'monthly');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE digital_contract_party AS ENUM ('partyA', 'partyB', 'partyC');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE purchase_order_status AS ENUM ('draft', 'submitted', 'accepted', 'executed', 'settled', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE digital_payout_status AS ENUM ('scheduled', 'due', 'paid');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 3) Core objects
CREATE TABLE IF NOT EXISTS digital_contracts (
  id SERIAL PRIMARY KEY,
  contract_id TEXT NOT NULL UNIQUE,
  contract_type digital_contract_type NOT NULL,
  mine_id TEXT NOT NULL,
  investment_opportunity_id TEXT,
  bureau_achat_id INTEGER REFERENCES bureau_d_achat(id),
  party_a_user_id INTEGER REFERENCES ece_users(id),
  party_b_user_id INTEGER REFERENCES ece_users(id) NOT NULL,
  party_c_user_id INTEGER REFERENCES ece_users(id),
  principal_amount NUMERIC(20, 4) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP,
  rotation_count INTEGER,
  return_model JSONB NOT NULL,
  payout_frequency digital_payout_frequency NOT NULL DEFAULT 'per_sale',
  cap JSONB DEFAULT '{}'::jsonb,
  termination_clauses TEXT,
  status digital_contract_status NOT NULL DEFAULT 'draft',
  documents JSONB DEFAULT '{}'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  activated_at TIMESTAMP,
  completed_at TIMESTAMP,
  terminated_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS digital_contract_signatures (
  id SERIAL PRIMARY KEY,
  contract_db_id INTEGER NOT NULL REFERENCES digital_contracts(id) ON DELETE CASCADE,
  party digital_contract_party NOT NULL,
  user_id INTEGER NOT NULL REFERENCES ece_users(id),
  signed_at TIMESTAMP NOT NULL DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id SERIAL PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE,
  bureau_achat_id INTEGER NOT NULL REFERENCES bureau_d_achat(id),
  mine_id TEXT NOT NULL,
  gold_type TEXT NOT NULL DEFAULT 'dore',
  quantity_kg NUMERIC(15, 4) NOT NULL,
  pricing_reference TEXT,
  status purchase_order_status NOT NULL DEFAULT 'draft',
  linked_contract_db_id INTEGER REFERENCES digital_contracts(id),
  evidence JSONB DEFAULT '{}'::jsonb,
  submitted_at TIMESTAMP,
  accepted_at TIMESTAMP,
  executed_at TIMESTAMP,
  settled_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS revenue_events (
  id SERIAL PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  mine_id TEXT NOT NULL,
  bureau_achat_id INTEGER NOT NULL REFERENCES bureau_d_achat(id),
  linked_contract_db_id INTEGER REFERENCES digital_contracts(id),
  purchase_order_db_id INTEGER REFERENCES purchase_orders(id),
  gross_revenue NUMERIC(20, 4) NOT NULL,
  net_revenue NUMERIC(20, 4),
  currency TEXT NOT NULL DEFAULT 'USD',
  timestamp TIMESTAMP NOT NULL DEFAULT now(),
  evidence JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS digital_payouts (
  id SERIAL PRIMARY KEY,
  payout_id TEXT NOT NULL UNIQUE,
  contract_db_id INTEGER NOT NULL REFERENCES digital_contracts(id) ON DELETE CASCADE,
  investor_user_id INTEGER NOT NULL REFERENCES ece_users(id),
  revenue_event_db_id INTEGER REFERENCES revenue_events(id),
  amount NUMERIC(20, 4) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  status digital_payout_status NOT NULL DEFAULT 'due',
  due_at TIMESTAMP DEFAULT now(),
  paid_at TIMESTAMP,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT now()
);
