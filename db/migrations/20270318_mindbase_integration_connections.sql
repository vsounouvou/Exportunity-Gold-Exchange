CREATE TABLE IF NOT EXISTS mindbase_integration_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES ece_users(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES mindbase_workspaces(id) ON DELETE SET NULL,
  provider text NOT NULL,
  integration_id text NOT NULL,
  account_label text,
  status text NOT NULL DEFAULT 'connected',
  scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  token_ciphertext text NOT NULL,
  token_iv text NOT NULL,
  token_auth_tag text NOT NULL,
  token_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz,
  last_verified_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE mindbase_integration_connections
  ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES mindbase_workspaces(id) ON DELETE SET NULL;

ALTER TABLE mindbase_integration_connections
  ADD COLUMN IF NOT EXISTS account_label text;

ALTER TABLE mindbase_integration_connections
  ADD COLUMN IF NOT EXISTS token_meta jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE mindbase_integration_connections
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

ALTER TABLE mindbase_integration_connections
  ADD COLUMN IF NOT EXISTS last_verified_at timestamptz;

ALTER TABLE mindbase_integration_connections
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS mindbase_integration_connections_tenant_user_integration_unique
  ON mindbase_integration_connections(tenant_id, user_id, integration_id);

CREATE INDEX IF NOT EXISTS mindbase_integration_connections_tenant_user_status_idx
  ON mindbase_integration_connections(tenant_id, user_id, status);

CREATE INDEX IF NOT EXISTS mindbase_integration_connections_workspace_idx
  ON mindbase_integration_connections(workspace_id);
