-- Exportunity-owned provider connections with dedicated tenant storage.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS exportunity_integration_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  integration_id text NOT NULL,
  provider text NOT NULL,
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
  connected_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exportunity_integration_connections_status_check
    CHECK (status IN ('connected', 'reconnect_required', 'revoked', 'error'))
);
CREATE UNIQUE INDEX IF NOT EXISTS exportunity_integration_connections_tenant_integration_unique
  ON exportunity_integration_connections(tenant_id, integration_id);
CREATE INDEX IF NOT EXISTS exportunity_integration_connections_tenant_status_idx
  ON exportunity_integration_connections(tenant_id, status, updated_at);

CREATE TABLE IF NOT EXISTS exportunity_integration_oauth_states (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  state_digest text NOT NULL,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  actor_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  integration_id text NOT NULL,
  provider text NOT NULL,
  return_to text NOT NULL DEFAULT '/admin/exportunity/integrations',
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS exportunity_integration_oauth_states_digest_unique
  ON exportunity_integration_oauth_states(state_digest);
CREATE INDEX IF NOT EXISTS exportunity_integration_oauth_states_tenant_expiry_idx
  ON exportunity_integration_oauth_states(tenant_id, expires_at);

CREATE TABLE IF NOT EXISTS exportunity_integration_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connection_id uuid REFERENCES exportunity_integration_connections(id) ON DELETE SET NULL,
  actor_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  integration_id text NOT NULL,
  provider text NOT NULL,
  event_type text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS exportunity_integration_audit_events_tenant_created_idx
  ON exportunity_integration_audit_events(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS exportunity_integration_audit_events_connection_idx
  ON exportunity_integration_audit_events(connection_id, created_at);
