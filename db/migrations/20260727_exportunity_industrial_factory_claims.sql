BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_factory_claim_status') THEN
    CREATE TYPE industrial_factory_claim_status AS ENUM ('submitted', 'under_review', 'approved', 'rejected', 'cancelled');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS industrial_factory_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  factory_id uuid NOT NULL REFERENCES industrial_factories(id) ON DELETE CASCADE,
  claimant_user_id integer NOT NULL REFERENCES ece_users(id) ON DELETE CASCADE,
  relationship text NOT NULL,
  contact_email text,
  contact_phone text,
  authorization_reference text,
  message text,
  status industrial_factory_claim_status NOT NULL DEFAULT 'submitted',
  review_notes text,
  reviewed_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  reviewed_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS industrial_factory_claims_tenant_status_idx
  ON industrial_factory_claims(tenant_id, status, created_at);
CREATE INDEX IF NOT EXISTS industrial_factory_claims_factory_status_idx
  ON industrial_factory_claims(factory_id, status);
CREATE INDEX IF NOT EXISTS industrial_factory_claims_claimant_idx
  ON industrial_factory_claims(claimant_user_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS industrial_factory_claims_active_claimant_unique
  ON industrial_factory_claims(factory_id, claimant_user_id)
  WHERE status IN ('submitted', 'under_review');

COMMIT;
