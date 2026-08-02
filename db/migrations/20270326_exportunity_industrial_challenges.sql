-- Controlled Industrial Challenges workflow for factory-originated production blockers.
-- Every challenge is linked to a real industrial requirement. This migration creates no
-- supplier contacts, purchase orders, manufacturing jobs, or public records.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_challenge_status') THEN
    CREATE TYPE industrial_challenge_status AS ENUM (
      'submitted',
      'triaged',
      'grouped',
      'sourcing_review',
      'engineering_review',
      'local_manufacturing_review',
      'resolved',
      'declined',
      'closed'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_challenge_outcome') THEN
    CREATE TYPE industrial_challenge_outcome AS ENUM (
      'review_required',
      'stock_candidate',
      'group_procurement',
      'reverse_engineering',
      'local_manufacturing',
      'redesign',
      'engineering_partner',
      'declined'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS industrial_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  factory_id uuid NOT NULL REFERENCES industrial_factories(id) ON DELETE CASCADE,
  requirement_id uuid NOT NULL REFERENCES industrial_requirements(id) ON DELETE CASCADE,
  machine_id uuid REFERENCES industrial_machines(id) ON DELETE SET NULL,
  assembly_id uuid REFERENCES industrial_machine_assemblies(id) ON DELETE SET NULL,
  component_id uuid REFERENCES industrial_machine_components(id) ON DELETE SET NULL,
  created_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  assigned_staff_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  reviewed_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  requirement_type industrial_requirement_type NOT NULL,
  category_code text NOT NULL,
  title text NOT NULL,
  normalized_title text NOT NULL,
  details text NOT NULL,
  problem_type text NOT NULL,
  production_stopped boolean NOT NULL DEFAULT false,
  impact_text text,
  recurrence_frequency text,
  estimated_downtime text,
  current_workaround text,
  desired_outcome industrial_challenge_outcome NOT NULL DEFAULT 'review_required',
  urgency text NOT NULL DEFAULT 'standard',
  status industrial_challenge_status NOT NULL DEFAULT 'submitted',
  visibility industrial_visibility NOT NULL DEFAULT 'factory_team_only',
  group_key text,
  triage_notes text,
  resolution_notes text,
  reviewed_at timestamp,
  resolved_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS industrial_challenges_requirement_unique
  ON industrial_challenges(requirement_id);
CREATE INDEX IF NOT EXISTS industrial_challenges_tenant_status_urgency_idx
  ON industrial_challenges(tenant_id, status, urgency, updated_at);
CREATE INDEX IF NOT EXISTS industrial_challenges_factory_status_idx
  ON industrial_challenges(factory_id, status, updated_at);
CREATE INDEX IF NOT EXISTS industrial_challenges_technical_context_idx
  ON industrial_challenges(factory_id, machine_id, assembly_id, component_id);
CREATE INDEX IF NOT EXISTS industrial_challenges_tenant_group_idx
  ON industrial_challenges(tenant_id, group_key, status);
