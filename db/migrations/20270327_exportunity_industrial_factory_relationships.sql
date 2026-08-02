-- Internal factory relationship pipeline for Exportunity Machinery.
-- This is staff-only workflow data. It does not create outreach, quotations,
-- procurement, manufacturing, orders, payments, or public claims.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'industrial_factory_relationship_stage'
  ) THEN
    CREATE TYPE industrial_factory_relationship_stage AS ENUM (
      'identified',
      'research_in_progress',
      'contacted',
      'qualified',
      'visit_scheduled',
      'factory_visited',
      'requirements_collected',
      'proposal_in_preparation',
      'active_customer',
      'recurring_customer',
      'dormant',
      'disqualified'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS industrial_factory_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  factory_id uuid NOT NULL REFERENCES industrial_factories(id) ON DELETE CASCADE,
  account_manager_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  stage industrial_factory_relationship_stage NOT NULL DEFAULT 'identified',
  next_action text,
  next_review_at timestamp,
  last_contacted_at timestamp,
  last_contacted_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  last_contact_summary text,
  internal_notes text,
  created_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  updated_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT industrial_factory_relationships_factory_unique UNIQUE (factory_id)
);

CREATE INDEX IF NOT EXISTS industrial_factory_relationships_tenant_stage_idx
  ON industrial_factory_relationships(tenant_id, stage, next_review_at);
CREATE INDEX IF NOT EXISTS industrial_factory_relationships_tenant_manager_idx
  ON industrial_factory_relationships(tenant_id, account_manager_user_id, stage);
