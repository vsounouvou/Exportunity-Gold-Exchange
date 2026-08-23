-- Feature-gated Meta Page/Instagram inbound webhook receipts.
-- Signed payloads are retained without provider credentials until a verified,
-- tenant-owned social target can be resolved. No background retry is created.

CREATE TABLE IF NOT EXISTS meta_social_webhook_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_key text NOT NULL,
  payload_checksum text NOT NULL,
  object_type text NOT NULL,
  platform text,
  external_account_id text,
  provider_event_id text,
  event_kind text NOT NULL,
  parse_status text NOT NULL,
  resolution_status text NOT NULL DEFAULT 'received',
  reason_code text,
  tenant_id integer REFERENCES tenants(id) ON DELETE SET NULL,
  target_id integer REFERENCES social_publication_targets(id) ON DELETE SET NULL,
  sanitized_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  verification_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  delivery_count integer NOT NULL DEFAULT 1,
  attempt_count integer NOT NULL DEFAULT 0,
  last_error_code text,
  last_error_message text,
  received_at timestamptz NOT NULL,
  last_received_at timestamptz NOT NULL DEFAULT now(),
  retention_until timestamptz NOT NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meta_social_webhook_receipts_key_format_check CHECK (
    receipt_key ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT meta_social_webhook_receipts_checksum_format_check CHECK (
    payload_checksum ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT meta_social_webhook_receipts_object_check CHECK (
    object_type IN ('page', 'instagram', 'unknown')
  ),
  CONSTRAINT meta_social_webhook_receipts_platform_check CHECK (
    platform IS NULL OR platform IN ('facebook', 'instagram')
  ),
  CONSTRAINT meta_social_webhook_receipts_parse_check CHECK (
    parse_status IN ('parsed', 'unsupported')
  ),
  CONSTRAINT meta_social_webhook_receipts_resolution_check CHECK (
    resolution_status IN (
      'received', 'unmatched_target', 'ambiguous_target', 'ineligible_target',
      'unsupported_payload', 'ignored_outbound', 'ingested',
      'ingestion_failed', 'dead_letter'
    )
  ),
  CONSTRAINT meta_social_webhook_receipts_count_check CHECK (
    delivery_count >= 1 AND attempt_count >= 0
  ),
  CONSTRAINT meta_social_webhook_receipts_verification_check CHECK (
    verification_evidence @> '{"verified": true, "credentialsExcluded": true}'::jsonb
  ),
  CONSTRAINT meta_social_webhook_receipts_ingested_binding_check CHECK (
    resolution_status <> 'ingested'
    OR (tenant_id IS NOT NULL AND target_id IS NOT NULL AND resolved_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS meta_social_webhook_receipts_key_unique
  ON meta_social_webhook_receipts(receipt_key);
CREATE INDEX IF NOT EXISTS meta_social_webhook_receipts_resolution_idx
  ON meta_social_webhook_receipts(resolution_status, created_at DESC);
CREATE INDEX IF NOT EXISTS meta_social_webhook_receipts_account_idx
  ON meta_social_webhook_receipts(platform, external_account_id, resolution_status);
CREATE INDEX IF NOT EXISTS meta_social_webhook_receipts_tenant_target_idx
  ON meta_social_webhook_receipts(tenant_id, target_id, created_at DESC);
CREATE INDEX IF NOT EXISTS meta_social_webhook_receipts_checksum_idx
  ON meta_social_webhook_receipts(payload_checksum);
