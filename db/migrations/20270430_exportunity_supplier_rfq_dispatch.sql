BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'industrial_supplier_contact_channel'
  ) THEN
    CREATE TYPE industrial_supplier_contact_channel AS ENUM ('email', 'whatsapp');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'industrial_supplier_contact_control_state'
  ) THEN
    CREATE TYPE industrial_supplier_contact_control_state AS ENUM ('authorized', 'suppressed');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'industrial_supplier_contact_authorization_basis'
  ) THEN
    CREATE TYPE industrial_supplier_contact_authorization_basis AS ENUM (
      'explicit_consent',
      'existing_business_relationship',
      'supplier_initiated_inquiry'
    );
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'industrial_supplier_rfq_dispatch_status'
  ) THEN
    CREATE TYPE industrial_supplier_rfq_dispatch_status AS ENUM (
      'reserved',
      'sending',
      'accepted',
      'failed',
      'unknown'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS industrial_supplier_contact_controls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  supplier_profile_id uuid NOT NULL REFERENCES industrial_supplier_profiles(id) ON DELETE RESTRICT,
  source_promotion_id uuid REFERENCES industrial_supplier_promotions(id) ON DELETE RESTRICT,
  channel industrial_supplier_contact_channel NOT NULL,
  contact_hash text NOT NULL,
  contact_masked text NOT NULL,
  state industrial_supplier_contact_control_state NOT NULL,
  authorization_basis industrial_supplier_contact_authorization_basis,
  evidence_reference text,
  notes text NOT NULL,
  authorized_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  authorized_at timestamp,
  authorization_expires_at timestamp,
  suppressed_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  suppressed_at timestamp,
  suppression_reason text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT industrial_supplier_contact_controls_tenant_contact_unique
    UNIQUE (tenant_id, supplier_profile_id, channel, contact_hash),
  CONSTRAINT industrial_supplier_contact_controls_hash_check
    CHECK (contact_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT industrial_supplier_contact_controls_mask_check
    CHECK (char_length(btrim(contact_masked)) BETWEEN 5 AND 340),
  CONSTRAINT industrial_supplier_contact_controls_notes_check
    CHECK (char_length(btrim(notes)) BETWEEN 24 AND 1000),
  CONSTRAINT industrial_supplier_contact_controls_state_check CHECK (
    (
      state = 'authorized'
      AND source_promotion_id IS NOT NULL
      AND authorization_basis IS NOT NULL
      AND evidence_reference IS NOT NULL
      AND char_length(btrim(evidence_reference)) BETWEEN 8 AND 500
      AND authorized_at IS NOT NULL
      AND authorization_expires_at > authorized_at
      AND suppressed_at IS NULL
      AND suppressed_by_user_id IS NULL
      AND suppression_reason IS NULL
    )
    OR (
      state = 'suppressed'
      AND authorization_basis IS NULL
      AND evidence_reference IS NULL
      AND authorized_at IS NULL
      AND authorized_by_user_id IS NULL
      AND authorization_expires_at IS NULL
      AND suppressed_at IS NOT NULL
      AND suppression_reason IS NOT NULL
      AND char_length(btrim(suppression_reason)) BETWEEN 12 AND 1000
    )
  )
);

CREATE INDEX IF NOT EXISTS industrial_supplier_contact_controls_tenant_state_idx
  ON industrial_supplier_contact_controls(tenant_id, state, updated_at);
CREATE INDEX IF NOT EXISTS industrial_supplier_contact_controls_tenant_expiry_idx
  ON industrial_supplier_contact_controls(tenant_id, authorization_expires_at);

ALTER TABLE industrial_supplier_rfq_decisions
  DROP CONSTRAINT IF EXISTS industrial_supplier_rfq_decisions_dispatch_check;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'industrial_supplier_rfq_decisions_dispatch_state_check'
      AND conrelid = 'industrial_supplier_rfq_decisions'::regclass
  ) THEN
    ALTER TABLE industrial_supplier_rfq_decisions
      ADD CONSTRAINT industrial_supplier_rfq_decisions_dispatch_state_check
      CHECK (decision = 'approved' OR dispatch_created = false);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS industrial_supplier_rfq_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  rfq_draft_id uuid NOT NULL REFERENCES industrial_supplier_rfq_drafts(id) ON DELETE RESTRICT,
  decision_id uuid NOT NULL REFERENCES industrial_supplier_rfq_decisions(id) ON DELETE RESTRICT,
  contact_control_id uuid NOT NULL REFERENCES industrial_supplier_contact_controls(id) ON DELETE RESTRICT,
  contact_authorization_basis industrial_supplier_contact_authorization_basis NOT NULL,
  contact_evidence_reference text NOT NULL,
  contact_authorized_at timestamp NOT NULL,
  contact_authorization_expires_at timestamp NOT NULL,
  supplier_profile_id uuid NOT NULL REFERENCES industrial_supplier_profiles(id) ON DELETE RESTRICT,
  channel industrial_supplier_contact_channel NOT NULL,
  content_hash text NOT NULL,
  recipient_hash text NOT NULL,
  recipient_masked text NOT NULL,
  sender_agent_key text NOT NULL,
  idempotency_key text NOT NULL,
  checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  dispatch_notes text NOT NULL,
  status industrial_supplier_rfq_dispatch_status NOT NULL DEFAULT 'reserved',
  attempt_count integer NOT NULL DEFAULT 0,
  reserved_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  reserved_at timestamp NOT NULL,
  attempted_at timestamp,
  completed_at timestamp,
  provider_message_id text,
  provider_status text,
  provider_response jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code text,
  error_message text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT industrial_supplier_rfq_dispatches_draft_unique UNIQUE (rfq_draft_id),
  CONSTRAINT industrial_supplier_rfq_dispatches_decision_unique UNIQUE (decision_id),
  CONSTRAINT industrial_supplier_rfq_dispatches_tenant_idempotency_unique
    UNIQUE (tenant_id, idempotency_key),
  CONSTRAINT industrial_supplier_rfq_dispatches_content_hash_check
    CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT industrial_supplier_rfq_dispatches_recipient_hash_check
    CHECK (recipient_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT industrial_supplier_rfq_dispatches_idempotency_check
    CHECK (idempotency_key ~ '^[0-9a-f]{64}$'),
  CONSTRAINT industrial_supplier_rfq_dispatches_sender_check
    CHECK (char_length(btrim(sender_agent_key)) BETWEEN 2 AND 80),
  CONSTRAINT industrial_supplier_rfq_dispatches_notes_check
    CHECK (char_length(btrim(dispatch_notes)) BETWEEN 24 AND 1000),
  CONSTRAINT industrial_supplier_rfq_dispatches_authorization_evidence_check
    CHECK (char_length(btrim(contact_evidence_reference)) BETWEEN 8 AND 500),
  CONSTRAINT industrial_supplier_rfq_dispatches_provider_response_check
    CHECK (jsonb_typeof(provider_response) = 'object'),
  CONSTRAINT industrial_supplier_rfq_dispatches_checklist_check CHECK (
    checklist @> '{
      "exactApprovedContent": true,
      "recipientMatchesVerifiedPromotion": true,
      "contactAuthorizationCurrent": true,
      "suppressionRegistryChecked": true,
      "singleRecipientOnly": true,
      "noAutomaticRetry": true
    }'::jsonb
  ),
  CONSTRAINT industrial_supplier_rfq_dispatches_attempt_check
    CHECK (attempt_count BETWEEN 0 AND 1),
  CONSTRAINT industrial_supplier_rfq_dispatches_state_check CHECK (
    (
      status = 'reserved'
      AND attempt_count = 0
      AND attempted_at IS NULL
      AND completed_at IS NULL
      AND provider_message_id IS NULL
      AND provider_status IS NULL
      AND error_code IS NULL
      AND error_message IS NULL
    )
    OR (
      status = 'sending'
      AND attempt_count = 1
      AND attempted_at IS NOT NULL
      AND completed_at IS NULL
      AND provider_message_id IS NULL
      AND error_code IS NULL
      AND error_message IS NULL
    )
    OR (
      status = 'accepted'
      AND attempt_count = 1
      AND attempted_at IS NOT NULL
      AND completed_at IS NOT NULL
      AND provider_message_id IS NOT NULL
      AND provider_status IS NOT NULL
      AND error_code IS NULL
      AND error_message IS NULL
    )
    OR (
      status IN ('failed', 'unknown')
      AND attempt_count = 1
      AND attempted_at IS NOT NULL
      AND completed_at IS NOT NULL
      AND error_message IS NOT NULL
      AND char_length(btrim(error_message)) BETWEEN 1 AND 2000
    )
  ),
  CONSTRAINT industrial_supplier_rfq_dispatches_time_check CHECK (
    contact_authorized_at <= reserved_at
    AND contact_authorization_expires_at > reserved_at
    AND (attempted_at IS NULL OR attempted_at >= reserved_at)
    AND (attempted_at IS NULL OR contact_authorization_expires_at > attempted_at)
    AND (completed_at IS NULL OR (attempted_at IS NOT NULL AND completed_at >= attempted_at))
  )
);

CREATE INDEX IF NOT EXISTS industrial_supplier_rfq_dispatches_tenant_status_idx
  ON industrial_supplier_rfq_dispatches(tenant_id, status, updated_at);
CREATE INDEX IF NOT EXISTS industrial_supplier_rfq_dispatches_tenant_supplier_idx
  ON industrial_supplier_rfq_dispatches(tenant_id, supplier_profile_id, created_at);

COMMENT ON TABLE industrial_supplier_contact_controls IS
  'Exportunity supplier-channel authorization and suppression controls. Verified contact evidence alone never creates an authorized row.';
COMMENT ON TABLE industrial_supplier_rfq_dispatches IS
  'One-attempt, no-automatic-retry dispatch ledger consuming one exact approved supplier RFQ decision.';

COMMIT;
