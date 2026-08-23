BEGIN;

ALTER TYPE industrial_discovery_candidate_status
  ADD VALUE IF NOT EXISTS 'promoted';

CREATE TABLE IF NOT EXISTS industrial_supplier_promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  discovery_candidate_id uuid NOT NULL REFERENCES industrial_requirement_discovery_candidates(id) ON DELETE CASCADE,
  requirement_id uuid NOT NULL REFERENCES industrial_requirements(id) ON DELETE CASCADE,
  supplier_profile_id uuid NOT NULL REFERENCES industrial_supplier_profiles(id) ON DELETE RESTRICT,
  verification_scope text NOT NULL,
  evidence_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  official_evidence_id uuid NOT NULL REFERENCES industrial_discovery_evidence(id) ON DELETE RESTRICT,
  contact_evidence_id uuid NOT NULL REFERENCES industrial_discovery_evidence(id) ON DELETE RESTRICT,
  legal_name text NOT NULL,
  country_code text NOT NULL,
  contact_type text NOT NULL,
  contact_value text NOT NULL,
  checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  decision_notes text NOT NULL,
  approved_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  approved_at timestamp NOT NULL,
  outreach_allowed boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT industrial_supplier_promotions_candidate_unique UNIQUE (discovery_candidate_id),
  CONSTRAINT industrial_supplier_promotions_scope_check CHECK (
    verification_scope = 'business_identity_and_requirement_product_relevance'
  ),
  CONSTRAINT industrial_supplier_promotions_evidence_check CHECK (
    jsonb_typeof(evidence_ids) = 'array'
    AND jsonb_array_length(evidence_ids) BETWEEN 2 AND 10
    AND official_evidence_id <> contact_evidence_id
  ),
  CONSTRAINT industrial_supplier_promotions_country_check CHECK (
    country_code ~ '^[A-Z]{2}$'
  ),
  CONSTRAINT industrial_supplier_promotions_contact_type_check CHECK (
    contact_type IN ('email', 'phone', 'website')
  ),
  CONSTRAINT industrial_supplier_promotions_attestation_check CHECK (
    checklist @> '{
      "legalIdentityConfirmed": true,
      "countryOfRegistrationConfirmed": true,
      "requirementProductRelevanceConfirmed": true,
      "publicBusinessContactConfirmed": true,
      "evidenceReviewedByHuman": true,
      "noOutreachAuthorized": true
    }'::jsonb
  ),
  CONSTRAINT industrial_supplier_promotions_notes_check CHECK (
    char_length(btrim(decision_notes)) BETWEEN 24 AND 2000
  ),
  CONSTRAINT industrial_supplier_promotions_no_outreach_check CHECK (
    outreach_allowed = false
  )
);

CREATE INDEX IF NOT EXISTS industrial_supplier_promotions_tenant_supplier_idx
  ON industrial_supplier_promotions(tenant_id, supplier_profile_id, approved_at);

CREATE INDEX IF NOT EXISTS industrial_supplier_promotions_tenant_requirement_idx
  ON industrial_supplier_promotions(tenant_id, requirement_id, approved_at);

COMMENT ON TABLE industrial_supplier_promotions IS
  'Human-approved, evidence-bound Exportunity supplier promotion records. These records never authorize outreach or public identity exposure.';

COMMIT;
