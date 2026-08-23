-- Territory Media-to-Commerce foundation.
--
-- This migration extends geo_territories and marketing_media_items instead of
-- replacing them. It does not activate territories, copy creator media, publish
-- content, or start agent/background execution.

CREATE TABLE IF NOT EXISTS territory_operational_profiles (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  territory_id integer NOT NULL REFERENCES geo_territories(id) ON DELETE CASCADE,
  operating_mode text NOT NULL DEFAULT 'research_only',
  operational_status text NOT NULL DEFAULT 'draft',
  primary_language text,
  secondary_languages jsonb NOT NULL DEFAULT '[]'::jsonb,
  priority_sectors jsonb NOT NULL DEFAULT '[]'::jsonb,
  geography_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  operating_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  data_gaps jsonb NOT NULL DEFAULT '[]'::jsonb,
  readiness_status text NOT NULL DEFAULT 'unknown',
  last_verified_at timestamptz,
  created_by_user_id integer,
  updated_by_user_id integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT territory_operational_profiles_mode_check
    CHECK (operating_mode IN ('research_only', 'media_pilot', 'commerce')),
  CONSTRAINT territory_operational_profiles_status_check
    CHECK (operational_status IN ('draft', 'approval_required', 'active', 'paused', 'archived')),
  CONSTRAINT territory_operational_profiles_readiness_check
    CHECK (readiness_status IN ('unknown', 'blocked', 'approval_ready', 'active_with_gaps', 'ready')),
  UNIQUE (tenant_id, territory_id)
);

CREATE INDEX IF NOT EXISTS territory_operational_profiles_tenant_status_idx
  ON territory_operational_profiles(tenant_id, operational_status, updated_at DESC);

CREATE TABLE IF NOT EXISTS territory_activations (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  territory_id integer NOT NULL REFERENCES geo_territories(id) ON DELETE CASCADE,
  profile_id integer NOT NULL REFERENCES territory_operational_profiles(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  status text NOT NULL DEFAULT 'approval_required',
  operating_mode text NOT NULL DEFAULT 'research_only',
  idempotency_key text NOT NULL,
  preparation_action_run_id integer,
  activation_action_run_id integer,
  readiness_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  activation_scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  blockers jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  requested_by_user_id integer,
  approved_by_user_id integer,
  requested_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  activated_at timestamptz,
  paused_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT territory_activations_status_check
    CHECK (status IN ('approval_required', 'blocked', 'active', 'paused', 'rejected', 'archived')),
  CONSTRAINT territory_activations_mode_check
    CHECK (operating_mode IN ('research_only', 'media_pilot', 'commerce')),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS territory_activations_territory_status_idx
  ON territory_activations(tenant_id, territory_id, status, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS territory_activations_one_active_idx
  ON territory_activations(tenant_id, territory_id)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS territory_agent_teams (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  territory_id integer NOT NULL REFERENCES geo_territories(id) ON DELETE CASCADE,
  activation_id integer NOT NULL REFERENCES territory_activations(id) ON DELETE CASCADE,
  department_key text NOT NULL,
  role_key text NOT NULL,
  agent_id integer,
  autonomy_level text NOT NULL DEFAULT 'approval_required',
  responsibility text NOT NULL,
  budget_usd_cap text NOT NULL DEFAULT '0.00',
  status text NOT NULL DEFAULT 'planned',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT territory_agent_teams_autonomy_check
    CHECK (autonomy_level IN ('auto', 'approval_required', 'forbidden')),
  CONSTRAINT territory_agent_teams_status_check
    CHECK (status IN ('planned', 'assigned', 'active', 'paused', 'removed')),
  UNIQUE (activation_id, role_key)
);

CREATE INDEX IF NOT EXISTS territory_agent_teams_territory_idx
  ON territory_agent_teams(tenant_id, territory_id, status);

CREATE TABLE IF NOT EXISTS territory_coverage_snapshots (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  territory_id integer NOT NULL REFERENCES geo_territories(id) ON DELETE CASCADE,
  activation_id integer REFERENCES territory_activations(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'gaps_identified',
  dimensions jsonb NOT NULL DEFAULT '{}'::jsonb,
  gaps jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  captured_by_user_id integer,
  captured_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT territory_coverage_snapshots_status_check
    CHECK (status IN ('unknown', 'gaps_identified', 'partial', 'verified', 'stale'))
);

CREATE INDEX IF NOT EXISTS territory_coverage_snapshots_territory_captured_idx
  ON territory_coverage_snapshots(tenant_id, territory_id, captured_at DESC);

CREATE TABLE IF NOT EXISTS source_content_references (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  media_item_id text NOT NULL REFERENCES marketing_media_items(id) ON DELETE CASCADE,
  territory_id integer REFERENCES geo_territories(id) ON DELETE SET NULL,
  source_platform text,
  source_content_id text,
  source_url text NOT NULL,
  canonical_source_url text,
  source_creator_name text,
  source_creator_url text,
  source_published_at timestamptz,
  discovered_by_agent_id integer,
  discovery_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  reuse_status text NOT NULL DEFAULT 'reference_only',
  takedown_state text NOT NULL DEFAULT 'clear',
  created_by_user_id integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT source_content_references_reuse_status_check
    CHECK (reuse_status IN ('reference_only', 'rights_pending', 'rights_granted', 'restricted', 'revoked', 'takedown')),
  CONSTRAINT source_content_references_takedown_state_check
    CHECK (takedown_state IN ('clear', 'requested', 'removed', 'disputed')),
  UNIQUE (tenant_id, media_item_id)
);

CREATE INDEX IF NOT EXISTS source_content_references_source_lookup_idx
  ON source_content_references(tenant_id, source_platform, source_content_id);

CREATE TABLE IF NOT EXISTS media_rights_grants (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_reference_id integer NOT NULL REFERENCES source_content_references(id) ON DELETE CASCADE,
  creator_profile_id text,
  rights_holder_name text NOT NULL,
  rights_basis text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  usage_types jsonb NOT NULL DEFAULT '[]'::jsonb,
  channels jsonb NOT NULL DEFAULT '[]'::jsonb,
  territory_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  all_territories boolean NOT NULL DEFAULT false,
  starts_at timestamptz,
  expires_at timestamptz,
  producer_consent_status text NOT NULL DEFAULT 'unknown',
  subject_release_status text NOT NULL DEFAULT 'unknown',
  music_license_status text NOT NULL DEFAULT 'unknown',
  attribution_text text,
  attribution_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  granted_by_user_id integer,
  granted_at timestamptz,
  revoked_by_user_id integer,
  revoked_at timestamptz,
  revocation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT media_rights_grants_basis_check
    CHECK (rights_basis IN ('creator_grant', 'license', 'commissioned', 'tenant_owned', 'public_domain')),
  CONSTRAINT media_rights_grants_status_check
    CHECK (status IN ('pending', 'granted', 'revoked', 'expired', 'rejected')),
  CONSTRAINT media_rights_grants_producer_consent_check
    CHECK (producer_consent_status IN ('unknown', 'not_required', 'pending', 'granted', 'revoked')),
  CONSTRAINT media_rights_grants_subject_release_check
    CHECK (subject_release_status IN ('unknown', 'not_required', 'pending', 'granted', 'revoked')),
  CONSTRAINT media_rights_grants_music_license_check
    CHECK (music_license_status IN ('unknown', 'not_required', 'pending', 'granted', 'revoked'))
);

CREATE INDEX IF NOT EXISTS media_rights_grants_source_status_idx
  ON media_rights_grants(tenant_id, source_reference_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS media_rights_events (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_reference_id integer NOT NULL REFERENCES source_content_references(id) ON DELETE CASCADE,
  grant_id integer REFERENCES media_rights_grants(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  actor_user_id integer,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS media_rights_events_source_created_idx
  ON media_rights_events(tenant_id, source_reference_id, created_at DESC);

-- Rollback (manual, destructive): drop the seven tables above in reverse order.
-- Existing geo_territories, territory_budgets, territory_kpis, creator_profiles,
-- marketing_media_items, Actions, orders, payments, and logistics are untouched.
