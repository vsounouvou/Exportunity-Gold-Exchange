-- Provider-neutral social publication foundation.
--
-- OAuth/token secrets remain in mindbase_integration_connections. This
-- migration stores only non-secret destination evidence, accurate publication
-- states, immutable events, and manual handoff packages. It performs no
-- authorization, upload, scheduling, publication, advertising, or messaging.

CREATE TABLE IF NOT EXISTS social_publication_targets (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  territory_id integer REFERENCES geo_territories(id) ON DELETE SET NULL,
  integration_connection_id uuid REFERENCES mindbase_integration_connections(id) ON DELETE SET NULL,
  provider text NOT NULL,
  platform text NOT NULL,
  channel text NOT NULL,
  external_account_id text,
  external_account_label text,
  authorization_status text NOT NULL DEFAULT 'unknown',
  health_status text NOT NULL DEFAULT 'unknown',
  capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  verification_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_verified_at timestamptz,
  created_by_user_id integer,
  updated_by_user_id integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT social_publication_targets_authorization_check
    CHECK (authorization_status IN ('unknown', 'authorized', 'permission_gap', 'reconnect_required', 'revoked')),
  CONSTRAINT social_publication_targets_health_check
    CHECK (health_status IN ('unknown', 'healthy', 'degraded', 'restricted', 'reconnect_required'))
);

CREATE INDEX IF NOT EXISTS social_publication_targets_tenant_platform_idx
  ON social_publication_targets(tenant_id, platform, health_status);

CREATE INDEX IF NOT EXISTS social_publication_targets_connection_idx
  ON social_publication_targets(integration_connection_id);

CREATE TABLE IF NOT EXISTS social_publication_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  media_item_id text NOT NULL REFERENCES marketing_media_items(id) ON DELETE CASCADE,
  source_reference_id integer NOT NULL REFERENCES source_content_references(id) ON DELETE RESTRICT,
  rights_grant_id integer NOT NULL REFERENCES media_rights_grants(id) ON DELETE RESTRICT,
  territory_id integer REFERENCES geo_territories(id) ON DELETE SET NULL,
  target_id integer REFERENCES social_publication_targets(id) ON DELETE SET NULL,
  integration_connection_id uuid REFERENCES mindbase_integration_connections(id) ON DELETE SET NULL,
  action_run_id integer,
  idempotency_key text NOT NULL,
  provider text NOT NULL,
  platform text NOT NULL,
  channel text NOT NULL,
  mode text NOT NULL DEFAULT 'manual_package',
  status text NOT NULL DEFAULT 'DRAFT',
  manual_package jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code text,
  error_message text,
  requested_by_user_id integer,
  approved_by_user_id integer,
  scheduled_at timestamptz,
  provider_confirmed_at timestamptz,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT social_publication_attempts_mode_check
    CHECK (mode IN ('official_api', 'manual_package')),
  CONSTRAINT social_publication_attempts_status_check
    CHECK (status IN (
      'DRAFT',
      'AWAITING_RIGHTS',
      'AWAITING_CONSENT',
      'AWAITING_FACTS',
      'NEEDS_REVIEW',
      'APPROVED',
      'SCHEDULED',
      'UPLOADING',
      'PROCESSING',
      'PUBLISHED',
      'FAILED',
      'RESTRICTED',
      'MANUAL_REQUIRED',
      'TAKEDOWN_REQUESTED',
      'REMOVED'
    )),
  CONSTRAINT social_publication_attempts_manual_not_published_check
    CHECK (mode <> 'manual_package' OR status <> 'PUBLISHED'),
  CONSTRAINT social_publication_attempts_provider_confirmation_check
    CHECK (status <> 'PUBLISHED' OR (provider_confirmed_at IS NOT NULL AND published_at IS NOT NULL)),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS social_publication_attempts_media_created_idx
  ON social_publication_attempts(tenant_id, media_item_id, created_at DESC);

CREATE INDEX IF NOT EXISTS social_publication_attempts_status_idx
  ON social_publication_attempts(tenant_id, platform, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS social_publication_events (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  attempt_id uuid NOT NULL REFERENCES social_publication_attempts(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  status text NOT NULL,
  actor_user_id integer,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS social_publication_events_attempt_created_idx
  ON social_publication_events(tenant_id, attempt_id, created_at DESC);

-- Rollback (manual, destructive): drop social_publication_events,
-- social_publication_attempts, then social_publication_targets. Canonical media,
-- rights, Mindbase connections, Actions, and territory records are untouched.
