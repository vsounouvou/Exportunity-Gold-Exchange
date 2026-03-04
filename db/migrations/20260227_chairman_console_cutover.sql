-- Chairman Console Cutover (assistant threads, action runs, quick tokens)

-- Ensure companies are tenant-scoped for assistant resolution
ALTER TABLE IF EXISTS companies
  ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id);

UPDATE companies
SET tenant_id = (SELECT id FROM tenants ORDER BY id ASC LIMIT 1)
WHERE tenant_id IS NULL;

-- Agents: display_name/avatar_url/is_terminal_default/tenant_id
ALTER TABLE IF EXISTS agents
  ADD COLUMN IF NOT EXISTS tenant_id INTEGER REFERENCES tenants(id),
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS is_terminal_default BOOLEAN NOT NULL DEFAULT false;

UPDATE agents
SET display_name = name
WHERE display_name IS NULL AND name IS NOT NULL;

UPDATE agents
SET avatar_url = avatar
WHERE avatar_url IS NULL AND avatar IS NOT NULL;

UPDATE agents a
SET tenant_id = c.tenant_id
FROM companies c
WHERE a.company_id = c.id
  AND (a.tenant_id IS NULL OR a.tenant_id <> c.tenant_id);

CREATE INDEX IF NOT EXISTS agents_tenant_idx ON agents(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS agents_terminal_default_per_tenant_idx
  ON agents(tenant_id)
  WHERE is_terminal_default = true;

-- Assistant threads/messages
CREATE TABLE IF NOT EXISTS assistant_threads (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES ece_users(id) ON DELETE CASCADE,
  assistant_agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL,
  assistant_display_name TEXT,
  assistant_role TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS assistant_threads_tenant_user_agent_idx
  ON assistant_threads(tenant_id, user_id, assistant_agent_id);
CREATE INDEX IF NOT EXISTS assistant_threads_tenant_updated_idx
  ON assistant_threads(tenant_id, updated_at);

CREATE TABLE IF NOT EXISTS assistant_messages (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  thread_id INTEGER NOT NULL REFERENCES assistant_threads(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL,
  sender_user_id INTEGER REFERENCES ece_users(id) ON DELETE SET NULL,
  sender_agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL,
  sender_name TEXT,
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS assistant_messages_thread_created_idx
  ON assistant_messages(thread_id, created_at);
CREATE INDEX IF NOT EXISTS assistant_messages_tenant_created_idx
  ON assistant_messages(tenant_id, created_at);

-- Action definitions/runs/evidence (new schema)
CREATE TABLE IF NOT EXISTS action_definitions (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  action_key TEXT NOT NULL,
  name TEXT,
  description TEXT,
  category TEXT,
  schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  default_assignee_role TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  version INTEGER NOT NULL DEFAULT 1,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS action_definitions_tenant_key_idx
  ON action_definitions(tenant_id, action_key);
CREATE INDEX IF NOT EXISTS action_definitions_tenant_active_idx
  ON action_definitions(tenant_id, is_active, updated_at);

CREATE TABLE IF NOT EXISTS action_runs (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  definition_id INTEGER REFERENCES action_definitions(id) ON DELETE SET NULL,
  action_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  mode TEXT NOT NULL DEFAULT 'LIVE',
  requested_by_user_id INTEGER REFERENCES ece_users(id) ON DELETE SET NULL,
  requested_by_agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL,
  assigned_agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL,
  default_assignee_role TEXT,
  thread_id INTEGER REFERENCES assistant_threads(id) ON DELETE SET NULL,
  message_id INTEGER REFERENCES assistant_messages(id) ON DELETE SET NULL,
  objective_id INTEGER REFERENCES goals(id) ON DELETE SET NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB,
  error TEXT,
  correlation_id TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMP,
  finished_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS action_runs_tenant_status_idx
  ON action_runs(tenant_id, status, updated_at);
CREATE INDEX IF NOT EXISTS action_runs_tenant_created_idx
  ON action_runs(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS action_runs_thread_created_idx
  ON action_runs(thread_id, created_at);
CREATE INDEX IF NOT EXISTS action_runs_action_key_idx
  ON action_runs(action_key);

CREATE TABLE IF NOT EXISTS action_evidence (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  run_id INTEGER NOT NULL REFERENCES action_runs(id) ON DELETE CASCADE,
  evidence_type TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS action_evidence_run_idx
  ON action_evidence(run_id, created_at);
CREATE INDEX IF NOT EXISTS action_evidence_tenant_created_idx
  ON action_evidence(tenant_id, created_at);

-- Chairman quick tokens (one-time mobile access)
CREATE TABLE IF NOT EXISTS chairman_quick_tokens (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES ece_users(id) ON DELETE CASCADE,
  token_prefix TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  redeemed_at TIMESTAMP,
  revoked_at TIMESTAMP,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS chairman_quick_tokens_hash_idx
  ON chairman_quick_tokens(token_hash);
CREATE INDEX IF NOT EXISTS chairman_quick_tokens_tenant_user_idx
  ON chairman_quick_tokens(tenant_id, user_id, expires_at);
CREATE INDEX IF NOT EXISTS chairman_quick_tokens_prefix_idx
  ON chairman_quick_tokens(token_prefix);
