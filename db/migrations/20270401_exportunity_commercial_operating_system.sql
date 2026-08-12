-- Exportunity commercial operating system foundation.
-- Additive only: industrial requirements remain the canonical opportunity.

ALTER TABLE industrial_requirements
  ADD COLUMN IF NOT EXISTS commercial_intent text,
  ADD COLUMN IF NOT EXISTS commercial_action_mode text,
  ADD COLUMN IF NOT EXISTS intent_confidence numeric(4,3),
  ADD COLUMN IF NOT EXISTS assigned_commercial_agent_id integer,
  ADD COLUMN IF NOT EXISTS source_conversation_id text,
  ADD COLUMN IF NOT EXISTS next_action text,
  ADD COLUMN IF NOT EXISTS next_action_at timestamp;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'industrial_requirements_assigned_commercial_agent_id_fkey'
  ) THEN
    ALTER TABLE industrial_requirements
      ADD CONSTRAINT industrial_requirements_assigned_commercial_agent_id_fkey
      FOREIGN KEY (assigned_commercial_agent_id) REFERENCES agents(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS industrial_requirements_commercial_queue_idx
  ON industrial_requirements(tenant_id, commercial_intent, status, next_action_at);

CREATE TABLE IF NOT EXISTS industrial_product_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  requirement_id uuid NOT NULL REFERENCES industrial_requirements(id) ON DELETE CASCADE,
  intent text NOT NULL,
  intent_confidence numeric(4,3),
  suggested_action text NOT NULL DEFAULT 'ASK',
  product_name text,
  product_category text,
  specification text,
  quantity_text text,
  unit text,
  origin text,
  destination text,
  target_price text,
  currency text,
  deadline_text text,
  frequency text,
  incoterm text,
  customer_type text,
  missing_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS industrial_product_requirements_requirement_unique
  ON industrial_product_requirements(requirement_id);
CREATE INDEX IF NOT EXISTS industrial_product_requirements_tenant_intent_idx
  ON industrial_product_requirements(tenant_id, intent, created_at);
CREATE INDEX IF NOT EXISTS industrial_product_requirements_tenant_product_idx
  ON industrial_product_requirements(tenant_id, product_category, product_name);

CREATE TABLE IF NOT EXISTS industrial_agent_staffing_requests (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  company_id integer REFERENCES companies(id) ON DELETE CASCADE,
  requirement_id uuid REFERENCES industrial_requirements(id) ON DELETE SET NULL,
  role_template_id integer REFERENCES ece_agent_templates(id) ON DELETE SET NULL,
  role_code text NOT NULL,
  role_title text NOT NULL,
  department_key text NOT NULL,
  reason text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  priority text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'proposed',
  proposed_by_agent_id integer REFERENCES agents(id) ON DELETE SET NULL,
  reviewed_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  review_note text,
  provisioned_agent_id integer REFERENCES agents(id) ON DELETE SET NULL,
  reviewed_at timestamp,
  provisioned_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS industrial_agent_staffing_requests_open_role_unique
  ON industrial_agent_staffing_requests(tenant_id, role_code)
  WHERE status IN ('proposed', 'approved', 'provisioned');
CREATE INDEX IF NOT EXISTS industrial_agent_staffing_requests_tenant_status_idx
  ON industrial_agent_staffing_requests(tenant_id, status, priority, created_at);
CREATE INDEX IF NOT EXISTS industrial_agent_staffing_requests_requirement_idx
  ON industrial_agent_staffing_requests(requirement_id, created_at);
