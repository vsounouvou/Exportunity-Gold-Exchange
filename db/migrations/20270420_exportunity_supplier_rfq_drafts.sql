BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'industrial_supplier_rfq_status'
  ) THEN
    CREATE TYPE industrial_supplier_rfq_status AS ENUM (
      'draft',
      'approval_pending',
      'approved_for_outreach',
      'rejected',
      'cancelled'
    );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'industrial_supplier_rfq_decision'
  ) THEN
    CREATE TYPE industrial_supplier_rfq_decision AS ENUM ('approved', 'rejected');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS industrial_supplier_rfq_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  promotion_id uuid NOT NULL REFERENCES industrial_supplier_promotions(id) ON DELETE RESTRICT,
  requirement_id uuid NOT NULL REFERENCES industrial_requirements(id) ON DELETE RESTRICT,
  supplier_profile_id uuid NOT NULL REFERENCES industrial_supplier_profiles(id) ON DELETE RESTRICT,
  requirement_supplier_match_id uuid NOT NULL REFERENCES industrial_requirement_supplier_matches(id) ON DELETE RESTRICT,
  reference_code text NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  status industrial_supplier_rfq_status NOT NULL DEFAULT 'draft',
  subject text NOT NULL,
  message_body text NOT NULL,
  requested_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  requirement_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  supplier_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  buyer_instructions text,
  response_deadline timestamp NOT NULL,
  content_hash text NOT NULL,
  created_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  submitted_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  submitted_at timestamp,
  delivery_status text NOT NULL DEFAULT 'not_sent',
  delivery_channel text,
  delivered_at timestamp,
  external_message_id text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT industrial_supplier_rfq_drafts_tenant_reference_unique UNIQUE (tenant_id, reference_code),
  CONSTRAINT industrial_supplier_rfq_drafts_promotion_revision_unique UNIQUE (promotion_id, revision),
  CONSTRAINT industrial_supplier_rfq_drafts_promotion_content_unique UNIQUE (promotion_id, content_hash),
  CONSTRAINT industrial_supplier_rfq_drafts_reference_check CHECK (char_length(btrim(reference_code)) BETWEEN 8 AND 80),
  CONSTRAINT industrial_supplier_rfq_drafts_revision_check CHECK (revision BETWEEN 1 AND 1000),
  CONSTRAINT industrial_supplier_rfq_drafts_subject_check CHECK (char_length(btrim(subject)) BETWEEN 8 AND 240),
  CONSTRAINT industrial_supplier_rfq_drafts_message_check CHECK (char_length(btrim(message_body)) BETWEEN 120 AND 12000),
  CONSTRAINT industrial_supplier_rfq_drafts_requested_fields_check CHECK (
    jsonb_typeof(requested_fields) = 'array'
    AND jsonb_array_length(requested_fields) BETWEEN 6 AND 20
  ),
  CONSTRAINT industrial_supplier_rfq_drafts_snapshots_check CHECK (
    jsonb_typeof(requirement_snapshot) = 'object'
    AND jsonb_typeof(supplier_snapshot) = 'object'
  ),
  CONSTRAINT industrial_supplier_rfq_drafts_content_hash_check CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT industrial_supplier_rfq_drafts_response_deadline_check CHECK (response_deadline > created_at),
  CONSTRAINT industrial_supplier_rfq_drafts_submission_state_check CHECK (
    (status = 'draft' AND submitted_at IS NULL AND submitted_by_user_id IS NULL)
    OR (status IN ('approval_pending', 'approved_for_outreach', 'rejected', 'cancelled') AND submitted_at IS NOT NULL)
  ),
  CONSTRAINT industrial_supplier_rfq_drafts_no_delivery_check CHECK (
    delivery_status = 'not_sent'
    AND delivery_channel IS NULL
    AND delivered_at IS NULL
    AND external_message_id IS NULL
  )
);

CREATE INDEX IF NOT EXISTS industrial_supplier_rfq_drafts_tenant_status_idx
  ON industrial_supplier_rfq_drafts(tenant_id, status, updated_at);
CREATE INDEX IF NOT EXISTS industrial_supplier_rfq_drafts_tenant_requirement_idx
  ON industrial_supplier_rfq_drafts(tenant_id, requirement_id, status);
CREATE INDEX IF NOT EXISTS industrial_supplier_rfq_drafts_tenant_supplier_idx
  ON industrial_supplier_rfq_drafts(tenant_id, supplier_profile_id, status);

CREATE TABLE IF NOT EXISTS industrial_supplier_rfq_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  rfq_draft_id uuid NOT NULL REFERENCES industrial_supplier_rfq_drafts(id) ON DELETE RESTRICT,
  decision industrial_supplier_rfq_decision NOT NULL,
  content_hash text NOT NULL,
  checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  decision_notes text NOT NULL,
  decided_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  decided_at timestamp NOT NULL,
  authorization_expires_at timestamp,
  outreach_authorized boolean NOT NULL DEFAULT false,
  dispatch_created boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT industrial_supplier_rfq_decisions_draft_unique UNIQUE (rfq_draft_id),
  CONSTRAINT industrial_supplier_rfq_decisions_content_hash_check CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT industrial_supplier_rfq_decisions_notes_check CHECK (char_length(btrim(decision_notes)) BETWEEN 24 AND 2000),
  CONSTRAINT industrial_supplier_rfq_decisions_dispatch_check CHECK (dispatch_created = false),
  CONSTRAINT industrial_supplier_rfq_decisions_state_check CHECK (
    (
      decision = 'approved'
      AND outreach_authorized = true
      AND authorization_expires_at > decided_at
      AND checklist @> '{
        "contentReviewed": true,
        "recipientMatchesVerifiedContact": true,
        "requirementStillCurrent": true,
        "noUnsupportedCommercialClaims": true,
        "buyerDataApprovedForDisclosure": true,
        "separateDispatchRequired": true
      }'::jsonb
    )
    OR (
      decision = 'rejected'
      AND outreach_authorized = false
      AND authorization_expires_at IS NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS industrial_supplier_rfq_decisions_tenant_decision_idx
  ON industrial_supplier_rfq_decisions(tenant_id, decision, decided_at);
CREATE INDEX IF NOT EXISTS industrial_supplier_rfq_decisions_tenant_expiry_idx
  ON industrial_supplier_rfq_decisions(tenant_id, authorization_expires_at);

COMMENT ON TABLE industrial_supplier_rfq_drafts IS
  'Internal Exportunity RFQ content drafts. Database constraints prevent this table from recording any external delivery.';
COMMENT ON TABLE industrial_supplier_rfq_decisions IS
  'Immutable human decisions bound to an RFQ content hash. Approval authorizes only a later separate dispatch workflow.';

COMMIT;
