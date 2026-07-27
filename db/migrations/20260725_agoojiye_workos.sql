BEGIN;

ALTER TABLE agoojye_tasks
  ADD COLUMN IF NOT EXISTS contributor_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS dependencies jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS progress integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS blocker text,
  ADD COLUMN IF NOT EXISTS next_action text,
  ADD COLUMN IF NOT EXISTS reminder_at timestamptz,
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS confidentiality_class text NOT NULL DEFAULT 'INTERNAL',
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE agoojye_os_projects
  ADD COLUMN IF NOT EXISTS workstreams jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS milestones jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS start_date timestamptz,
  ADD COLUMN IF NOT EXISTS blocker text,
  ADD COLUMN IF NOT EXISTS next_action text,
  ADD COLUMN IF NOT EXISTS assigned_agent text,
  ADD COLUMN IF NOT EXISTS confidentiality_class text NOT NULL DEFAULT 'INTERNAL';

ALTER TABLE agoojye_documents
  ADD COLUMN IF NOT EXISTS confidentiality_class text NOT NULL DEFAULT 'INTERNAL';

CREATE TABLE IF NOT EXISTS agoojye_workos_mfa_factors (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES ece_users(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'totp',
  encrypted_secret text NOT NULL,
  recovery_code_hashes jsonb NOT NULL DEFAULT '[]'::jsonb,
  enabled boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS agoojye_workos_mfa_tenant_user_uidx ON agoojye_workos_mfa_factors(tenant_id, user_id);

CREATE TABLE IF NOT EXISTS agoojye_workos_mfa_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES ece_users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  purpose text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS agoojye_workos_mfa_challenge_token_uidx ON agoojye_workos_mfa_challenges(token_hash);
CREATE INDEX IF NOT EXISTS agoojye_workos_mfa_challenge_user_expiry_idx ON agoojye_workos_mfa_challenges(user_id, expires_at);

CREATE TABLE IF NOT EXISTS agoojye_workos_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES ece_users(id) ON DELETE CASCADE,
  ece_session_id integer,
  token_hash text NOT NULL,
  mfa_verified_at timestamptz,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS agoojye_workos_session_token_uidx ON agoojye_workos_sessions(token_hash);
CREATE INDEX IF NOT EXISTS agoojye_workos_session_user_expiry_idx ON agoojye_workos_sessions(user_id, expires_at);

CREATE TABLE IF NOT EXISTS agoojye_workos_security_events (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  actor_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  subject_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  result text NOT NULL DEFAULT 'success',
  reason text,
  ip_address text,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agoojye_workos_security_tenant_created_idx ON agoojye_workos_security_events(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS agoojye_workos_security_subject_created_idx ON agoojye_workos_security_events(subject_user_id, created_at);

CREATE TABLE IF NOT EXISTS agoojye_workos_worker_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  created_by integer REFERENCES ece_users(id) ON DELETE SET NULL,
  source_name text NOT NULL,
  source_hash text NOT NULL,
  status text NOT NULL DEFAULT 'preview',
  mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  preview_rows jsonb NOT NULL DEFAULT '[]'::jsonb,
  validation jsonb NOT NULL DEFAULT '{}'::jsonb,
  results jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz NOT NULL,
  committed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agoojye_workos_import_tenant_status_idx ON agoojye_workos_worker_imports(tenant_id, status);

CREATE TABLE IF NOT EXISTS agoojye_workos_vacancies (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  team_id integer REFERENCES agoojye_teams(id) ON DELETE SET NULL,
  title text NOT NULL,
  previous_holder_user_id integer REFERENCES agoojye_project_users(id) ON DELETE SET NULL,
  candidate_name text,
  candidate_email text,
  status text NOT NULL DEFAULT 'open',
  restrictions jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agoojye_workos_vacancy_tenant_status_idx ON agoojye_workos_vacancies(tenant_id, status);

CREATE TABLE IF NOT EXISTS agoojye_workos_offboarding_events (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_user_id integer REFERENCES agoojye_project_users(id) ON DELETE SET NULL,
  auth_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  performed_by integer REFERENCES ece_users(id) ON DELETE SET NULL,
  reason text NOT NULL,
  transferred_task_count integer NOT NULL DEFAULT 0,
  mailbox_status text NOT NULL DEFAULT 'archived',
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agoojye_workos_offboarding_tenant_created_idx ON agoojye_workos_offboarding_events(tenant_id, created_at);

CREATE TABLE IF NOT EXISTS agoojye_workos_calendar_events (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  owner_user_id integer REFERENCES agoojye_project_users(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  event_type text NOT NULL DEFAULT 'internal',
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  participant_user_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  recurrence jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidentiality_class text NOT NULL DEFAULT 'INTERNAL',
  status text NOT NULL DEFAULT 'scheduled',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agoojye_workos_calendar_tenant_start_idx ON agoojye_workos_calendar_events(tenant_id, starts_at);

CREATE TABLE IF NOT EXISTS agoojye_workos_agents (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  timezone text NOT NULL DEFAULT 'Africa/Porto-Novo',
  policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  schedule jsonb NOT NULL DEFAULT '{}'::jsonb,
  daily_budget_xof integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS agoojye_workos_agents_tenant_key_uidx ON agoojye_workos_agents(tenant_id, key);

CREATE TABLE IF NOT EXISTS agoojye_workos_agent_actions (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_id integer NOT NULL REFERENCES agoojye_workos_agents(id) ON DELETE CASCADE,
  requested_by integer REFERENCES ece_users(id) ON DELETE SET NULL,
  action_type text NOT NULL,
  risk_level text NOT NULL DEFAULT 'low',
  status text NOT NULL DEFAULT 'proposed',
  requires_approval boolean NOT NULL DEFAULT false,
  approved_by integer REFERENCES ece_users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb NOT NULL DEFAULT '{}'::jsonb,
  executed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agoojye_workos_agent_action_tenant_status_idx ON agoojye_workos_agent_actions(tenant_id, status);

CREATE TABLE IF NOT EXISTS agoojye_workos_compliance_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  requested_by integer NOT NULL REFERENCES ece_users(id) ON DELETE CASCADE,
  target_type text NOT NULL,
  target_id text NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agoojye_workos_compliance_tenant_expiry_idx ON agoojye_workos_compliance_access(tenant_id, expires_at);

COMMIT;
