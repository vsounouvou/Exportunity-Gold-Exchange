DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type
    WHERE typname = 'industrial_supplier_quote_correlation_status'
  ) THEN
    CREATE TYPE industrial_supplier_quote_correlation_status AS ENUM (
      'exact',
      'inferred',
      'ambiguous',
      'unmatched'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type
    WHERE typname = 'industrial_supplier_quote_review_status'
  ) THEN
    CREATE TYPE industrial_supplier_quote_review_status AS ENUM (
      'needs_review',
      'qualified',
      'rejected'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS industrial_supplier_contact_suppressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel text NOT NULL,
  contact_hash text NOT NULL,
  contact_masked text NOT NULL,
  reason text NOT NULL,
  source_kind text NOT NULL DEFAULT 'recipient_opt_out',
  source_email_message_id integer REFERENCES email_messages(id) ON DELETE RESTRICT,
  source_communications_message_id integer REFERENCES communications_messages(id) ON DELETE RESTRICT,
  created_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT industrial_supplier_contact_suppressions_channel_check
    CHECK (channel IN ('email', 'whatsapp')),
  CONSTRAINT industrial_supplier_contact_suppressions_hash_check
    CHECK (contact_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT industrial_supplier_contact_suppressions_mask_check
    CHECK (char_length(btrim(contact_masked)) BETWEEN 5 AND 340),
  CONSTRAINT industrial_supplier_contact_suppressions_reason_check
    CHECK (char_length(btrim(reason)) BETWEEN 12 AND 1000),
  CONSTRAINT industrial_supplier_contact_suppressions_source_kind_check
    CHECK (source_kind = 'recipient_opt_out'),
  CONSTRAINT industrial_supplier_contact_suppressions_source_check
    CHECK (
      (channel = 'email' AND source_email_message_id IS NOT NULL AND source_communications_message_id IS NULL)
      OR
      (channel = 'whatsapp' AND source_email_message_id IS NULL AND source_communications_message_id IS NOT NULL)
    ),
  CONSTRAINT industrial_supplier_contact_suppressions_tenant_contact_unique
    UNIQUE (tenant_id, channel, contact_hash)
);

CREATE INDEX IF NOT EXISTS industrial_supplier_contact_suppressions_tenant_updated_idx
  ON industrial_supplier_contact_suppressions(tenant_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS industrial_supplier_quote_intakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  rfq_dispatch_id uuid REFERENCES industrial_supplier_rfq_dispatches(id) ON DELETE RESTRICT,
  rfq_draft_id uuid REFERENCES industrial_supplier_rfq_drafts(id) ON DELETE RESTRICT,
  requirement_id uuid REFERENCES industrial_requirements(id) ON DELETE RESTRICT,
  supplier_profile_id uuid REFERENCES industrial_supplier_profiles(id) ON DELETE RESTRICT,
  contact_suppression_id uuid REFERENCES industrial_supplier_contact_suppressions(id) ON DELETE RESTRICT,
  channel text NOT NULL,
  source_email_message_id integer REFERENCES email_messages(id) ON DELETE RESTRICT,
  source_communications_message_id integer REFERENCES communications_messages(id) ON DELETE RESTRICT,
  source_provider_message_id text NOT NULL,
  source_agent_key text NOT NULL,
  source_contact_hash text NOT NULL,
  source_contact_masked text NOT NULL,
  source_received_at timestamptz NOT NULL,
  source_attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  correlation_status industrial_supplier_quote_correlation_status NOT NULL,
  correlation_method text NOT NULL,
  candidate_dispatch_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  normalization_version text NOT NULL,
  normalized_quote jsonb NOT NULL DEFAULT '{}'::jsonb,
  missing_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  ambiguous_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  quote_like_signals jsonb NOT NULL DEFAULT '[]'::jsonb,
  opt_out_detected boolean NOT NULL DEFAULT false,
  suppression_applied_at timestamptz,
  suppressed_control_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  review_status industrial_supplier_quote_review_status NOT NULL DEFAULT 'needs_review',
  review_checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  review_notes text,
  reviewed_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT industrial_supplier_quote_intakes_channel_check
    CHECK (channel IN ('email', 'whatsapp')),
  CONSTRAINT industrial_supplier_quote_intakes_source_check
    CHECK (
      (channel = 'email' AND source_email_message_id IS NOT NULL AND source_communications_message_id IS NULL)
      OR
      (channel = 'whatsapp' AND source_email_message_id IS NULL AND source_communications_message_id IS NOT NULL)
    ),
  CONSTRAINT industrial_supplier_quote_intakes_provider_id_check
    CHECK (char_length(btrim(source_provider_message_id)) BETWEEN 2 AND 300),
  CONSTRAINT industrial_supplier_quote_intakes_agent_key_check
    CHECK (char_length(btrim(source_agent_key)) BETWEEN 2 AND 80),
  CONSTRAINT industrial_supplier_quote_intakes_contact_hash_check
    CHECK (source_contact_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT industrial_supplier_quote_intakes_contact_mask_check
    CHECK (char_length(btrim(source_contact_masked)) BETWEEN 5 AND 340),
  CONSTRAINT industrial_supplier_quote_intakes_json_types_check
    CHECK (
      jsonb_typeof(source_attachments) = 'array'
      AND jsonb_typeof(candidate_dispatch_ids) = 'array'
      AND jsonb_typeof(normalized_quote) = 'object'
      AND jsonb_typeof(missing_fields) = 'array'
      AND jsonb_typeof(ambiguous_fields) = 'array'
      AND jsonb_typeof(quote_like_signals) = 'array'
      AND jsonb_typeof(suppressed_control_ids) = 'array'
      AND jsonb_typeof(review_checklist) = 'object'
    ),
  CONSTRAINT industrial_supplier_quote_intakes_correlation_method_check
    CHECK (char_length(btrim(correlation_method)) BETWEEN 3 AND 80),
  CONSTRAINT industrial_supplier_quote_intakes_normalization_version_check
    CHECK (char_length(btrim(normalization_version)) BETWEEN 3 AND 80),
  CONSTRAINT industrial_supplier_quote_intakes_correlation_check
    CHECK (
      (
        correlation_status IN ('exact', 'inferred')
        AND rfq_dispatch_id IS NOT NULL
        AND rfq_draft_id IS NOT NULL
        AND requirement_id IS NOT NULL
        AND supplier_profile_id IS NOT NULL
      )
      OR
      (
        correlation_status IN ('ambiguous', 'unmatched')
        AND rfq_dispatch_id IS NULL
        AND rfq_draft_id IS NULL
        AND requirement_id IS NULL
        AND supplier_profile_id IS NULL
      )
    ),
  CONSTRAINT industrial_supplier_quote_intakes_suppression_check
    CHECK (
      (
        opt_out_detected = true
        AND suppression_applied_at IS NOT NULL
        AND contact_suppression_id IS NOT NULL
      )
      OR
      (
        opt_out_detected = false
        AND suppression_applied_at IS NULL
        AND contact_suppression_id IS NULL
      )
    ),
  CONSTRAINT industrial_supplier_quote_intakes_review_check
    CHECK (
      (
        review_status = 'needs_review'
        AND review_notes IS NULL
        AND reviewed_at IS NULL
      )
      OR
      (
        review_status IN ('qualified', 'rejected')
        AND review_notes IS NOT NULL
        AND char_length(btrim(review_notes)) BETWEEN 24 AND 2000
        AND reviewed_at IS NOT NULL
      )
    ),
  CONSTRAINT industrial_supplier_quote_intakes_qualified_checklist_check
    CHECK (
      review_status <> 'qualified'
      OR review_checklist @> '{"sourceMessageReviewed":true,"correlationReviewed":true,"noInventedFields":true,"missingFieldsAcknowledged":true}'::jsonb
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS industrial_supplier_quote_intakes_source_email_unique
  ON industrial_supplier_quote_intakes(source_email_message_id)
  WHERE source_email_message_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS industrial_supplier_quote_intakes_source_communications_unique
  ON industrial_supplier_quote_intakes(source_communications_message_id)
  WHERE source_communications_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS industrial_supplier_quote_intakes_tenant_review_idx
  ON industrial_supplier_quote_intakes(tenant_id, review_status, updated_at DESC);

CREATE INDEX IF NOT EXISTS industrial_supplier_quote_intakes_tenant_requirement_idx
  ON industrial_supplier_quote_intakes(tenant_id, requirement_id, review_status);

CREATE INDEX IF NOT EXISTS industrial_supplier_quote_intakes_tenant_supplier_idx
  ON industrial_supplier_quote_intakes(tenant_id, supplier_profile_id, created_at DESC);

COMMENT ON TABLE industrial_supplier_quote_intakes IS
  'Exportunity supplier quote intake ledger: native inbound source pointers, deterministic normalization, explicit missing/ambiguous fields, opt-out suppression evidence, and human qualification.';

COMMENT ON TABLE industrial_supplier_contact_suppressions IS
  'Tenant-wide hashed Exportunity recipient opt-out registry; suppression wins across every supplier profile.';
