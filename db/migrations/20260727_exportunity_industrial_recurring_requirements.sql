BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_recurring_requirement_status') THEN
    CREATE TYPE industrial_recurring_requirement_status AS ENUM ('draft', 'active', 'paused', 'closed');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS industrial_recurring_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  factory_id uuid NOT NULL REFERENCES industrial_factories(id) ON DELETE CASCADE,
  created_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  updated_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  requirement_type industrial_requirement_type NOT NULL,
  category_code text NOT NULL,
  title text NOT NULL,
  details text NOT NULL DEFAULT '',
  quantity_text text,
  frequency text NOT NULL,
  reorder_threshold text,
  preferred_delivery_date text,
  preferred_supplier text,
  alternative_supplier text,
  price_agreement_period text,
  contract_start_at timestamp,
  contract_end_at timestamp,
  approval_workflow text NOT NULL DEFAULT 'factory_owner_approval',
  approval_required boolean NOT NULL DEFAULT true,
  status industrial_recurring_requirement_status NOT NULL DEFAULT 'draft',
  next_review_at timestamp,
  last_reminder_at timestamp,
  internal_notes text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS industrial_recurring_requirements_factory_status_idx
  ON industrial_recurring_requirements(factory_id, status, updated_at);
CREATE INDEX IF NOT EXISTS industrial_recurring_requirements_tenant_review_idx
  ON industrial_recurring_requirements(tenant_id, status, next_review_at);
CREATE INDEX IF NOT EXISTS industrial_recurring_requirements_tenant_category_idx
  ON industrial_recurring_requirements(tenant_id, requirement_type, category_code);

COMMIT;
