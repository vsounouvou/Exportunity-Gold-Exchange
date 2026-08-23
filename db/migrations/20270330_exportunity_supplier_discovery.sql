-- Exportunity provenance-first external supplier discovery, ordered after the industrial foundation.
-- These records remain unverified and cannot authorize supplier outreach.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type
    WHERE typname = 'industrial_discovery_candidate_status'
  ) THEN
    CREATE TYPE industrial_discovery_candidate_status AS ENUM (
      'discovered',
      'under_review',
      'verification_pending',
      'rejected'
    );
  END IF;
END $$;

ALTER TABLE industrial_factory_leads
  ADD COLUMN IF NOT EXISTS discovery_key text;

CREATE UNIQUE INDEX IF NOT EXISTS industrial_factory_leads_tenant_discovery_key_unique
  ON industrial_factory_leads (tenant_id, discovery_key);

CREATE TABLE IF NOT EXISTS industrial_requirement_discovery_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  requirement_id uuid NOT NULL REFERENCES industrial_requirements(id) ON DELETE CASCADE,
  factory_lead_id uuid NOT NULL REFERENCES industrial_factory_leads(id) ON DELETE CASCADE,
  candidate_key text NOT NULL,
  status industrial_discovery_candidate_status NOT NULL DEFAULT 'discovered',
  relevance_score integer NOT NULL DEFAULT 0,
  relevance_rationale text NOT NULL,
  contact_status text NOT NULL DEFAULT 'not_contacted',
  outreach_allowed boolean NOT NULL DEFAULT false,
  human_approval_required boolean NOT NULL DEFAULT true,
  created_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  reviewed_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  reviewed_at timestamp,
  review_notes text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT industrial_requirement_discovery_candidates_requirement_candidate_unique
    UNIQUE (requirement_id, candidate_key),
  CONSTRAINT industrial_requirement_discovery_candidates_relevance_check
    CHECK (relevance_score BETWEEN 0 AND 100),
  CONSTRAINT industrial_requirement_discovery_candidates_no_contact_check
    CHECK (contact_status = 'not_contacted' AND outreach_allowed = false),
  CONSTRAINT industrial_requirement_discovery_candidates_human_review_check
    CHECK (human_approval_required = true)
);

CREATE INDEX IF NOT EXISTS industrial_requirement_discovery_candidates_tenant_queue_idx
  ON industrial_requirement_discovery_candidates (tenant_id, status, updated_at);

CREATE INDEX IF NOT EXISTS industrial_requirement_discovery_candidates_tenant_requirement_idx
  ON industrial_requirement_discovery_candidates (tenant_id, requirement_id, status);

CREATE INDEX IF NOT EXISTS industrial_requirement_discovery_candidates_factory_lead_idx
  ON industrial_requirement_discovery_candidates (factory_lead_id, status);

CREATE TABLE IF NOT EXISTS industrial_discovery_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  discovery_candidate_id uuid NOT NULL
    REFERENCES industrial_requirement_discovery_candidates(id) ON DELETE CASCADE,
  source_type text NOT NULL,
  source_name text NOT NULL,
  source_url text NOT NULL,
  retrieved_at timestamp NOT NULL,
  content_hash text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT industrial_discovery_evidence_candidate_source_hash_unique
    UNIQUE (discovery_candidate_id, source_url, content_hash),
  CONSTRAINT industrial_discovery_evidence_content_hash_check
    CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT industrial_discovery_evidence_source_type_check
    CHECK (source_type IN (
      'official_website',
      'government_registry',
      'trade_directory',
      'marketplace',
      'search_result',
      'manual_research'
    ))
);

CREATE INDEX IF NOT EXISTS industrial_discovery_evidence_tenant_candidate_idx
  ON industrial_discovery_evidence (tenant_id, discovery_candidate_id, created_at);
