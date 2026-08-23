-- Canonical fulfilled-commerce attribution.
-- Extends the existing conversion_events / attribution_records ledger rather
-- than creating a parallel commerce or scorecard truth. Legacy provider rows
-- remain valid with canonical_binding_status='legacy_unknown'.

ALTER TABLE IF EXISTS conversion_events
  ALTER COLUMN campaign_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS territory_id integer REFERENCES geo_territories(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS industrial_order_id uuid REFERENCES industrial_orders(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS payment_id uuid REFERENCES payments(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS fulfillment_plan_id uuid REFERENCES industrial_fulfillment_plans(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS publication_attempt_id uuid REFERENCES social_publication_attempts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS source_kind text,
  ADD COLUMN IF NOT EXISTS canonical_binding_status text NOT NULL DEFAULT 'legacy_unknown',
  ADD COLUMN IF NOT EXISTS binding_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS reconciliation_action_run_id integer,
  ADD COLUMN IF NOT EXISTS reconciled_by_user_id integer,
  ADD COLUMN IF NOT EXISTS reconciled_at timestamptz;

ALTER TABLE IF EXISTS attribution_records
  ALTER COLUMN campaign_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS publication_attempt_id uuid REFERENCES social_publication_attempts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS media_item_id text REFERENCES marketing_media_items(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS source_reference_id integer REFERENCES source_content_references(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS rights_grant_id integer REFERENCES media_rights_grants(id) ON DELETE RESTRICT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'conversion_events_source_kind_check'
  ) THEN
    ALTER TABLE conversion_events
      ADD CONSTRAINT conversion_events_source_kind_check
      CHECK (source_kind IS NULL OR source_kind IN ('ad_campaign', 'social_publication')) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'conversion_events_binding_status_check'
  ) THEN
    ALTER TABLE conversion_events
      ADD CONSTRAINT conversion_events_binding_status_check
      CHECK (canonical_binding_status IN ('legacy_unknown', 'verified', 'rejected')) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'conversion_events_canonical_binding_check'
  ) THEN
    ALTER TABLE conversion_events
      ADD CONSTRAINT conversion_events_canonical_binding_check CHECK (
        canonical_binding_status <> 'verified'
        OR (
          provider = 'exportunity'
          AND event_type = 'fulfilled_order'
          AND verification_status = 'verified'
          AND territory_id IS NOT NULL
          AND industrial_order_id IS NOT NULL
          AND payment_id IS NOT NULL
          AND fulfillment_plan_id IS NOT NULL
          AND source_kind IS NOT NULL
          AND idempotency_key IS NOT NULL
          AND reconciliation_action_run_id IS NOT NULL
          AND reconciled_by_user_id IS NOT NULL
          AND reconciled_at IS NOT NULL
          AND verified_at IS NOT NULL
          AND (
            (source_kind = 'ad_campaign' AND campaign_id IS NOT NULL AND publication_attempt_id IS NULL)
            OR
            (source_kind = 'social_publication' AND campaign_id IS NULL AND publication_attempt_id IS NOT NULL)
          )
          AND evidence @> '{"canonicalBinding": true, "credentialsExcluded": true}'::jsonb
          AND binding_evidence @> '{"verified": true, "credentialsExcluded": true}'::jsonb
        )
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attribution_records_canonical_binding_check'
  ) THEN
    ALTER TABLE attribution_records
      ADD CONSTRAINT attribution_records_canonical_binding_check CHECK (
        NOT (evidence @> '{"canonicalBinding": true}'::jsonb)
        OR (
          territory_id IS NOT NULL
          AND media_item_id IS NOT NULL
          AND source_reference_id IS NOT NULL
          AND rights_grant_id IS NOT NULL
          AND weight_bps = 10000
          AND attributed_value_minor >= 0
          AND evidence @> '{"canonicalBinding": true, "credentialsExcluded": true}'::jsonb
          AND (
            (campaign_id IS NOT NULL AND publication_attempt_id IS NULL AND creative_id IS NOT NULL)
            OR
            (campaign_id IS NULL AND publication_attempt_id IS NOT NULL AND creative_id IS NULL)
          )
        )
      ) NOT VALID;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS conversion_events_tenant_idempotency_uniq
  ON conversion_events(tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS conversion_events_verified_order_uniq
  ON conversion_events(tenant_id, industrial_order_id)
  WHERE canonical_binding_status = 'verified';

CREATE INDEX IF NOT EXISTS conversion_events_territory_binding_idx
  ON conversion_events(tenant_id, territory_id, canonical_binding_status, occurred_at DESC);

CREATE INDEX IF NOT EXISTS attribution_records_territory_created_idx
  ON attribution_records(tenant_id, territory_id, created_at DESC);

-- Enforce the exact canonical order -> payment -> delivery -> touchpoint chain at
-- the database boundary as well as in the application policy.
CREATE OR REPLACE FUNCTION exportunity_validate_canonical_conversion_binding()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  order_row industrial_orders%ROWTYPE;
  payment_row payments%ROWTYPE;
  fulfillment_row industrial_fulfillment_plans%ROWTYPE;
  campaign_row ad_campaigns%ROWTYPE;
  publication_row social_publication_attempts%ROWTYPE;
BEGIN
  IF NEW.canonical_binding_status <> 'verified' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO order_row FROM industrial_orders
   WHERE id = NEW.industrial_order_id AND tenant_id = NEW.tenant_id;
  IF NOT FOUND OR order_row.status::text <> 'completed' OR order_row.payment_status <> 'paid'
     OR order_row.completed_at IS NULL OR order_row.last_payment_id IS DISTINCT FROM NEW.payment_id THEN
    RAISE EXCEPTION 'canonical conversion requires the tenant completed and paid industrial order';
  END IF;

  SELECT * INTO payment_row FROM payments
   WHERE id = NEW.payment_id AND tenant_id = NEW.tenant_id;
  IF NOT FOUND OR payment_row.status::text <> 'succeeded'
     OR payment_row.purpose <> 'INDUSTRIAL_ORDER_PAYMENT'
     OR payment_row.target_type <> 'INDUSTRIAL_ORDER'
     OR payment_row.target_id <> NEW.industrial_order_id::text
     OR payment_row.credited_at IS NULL
     OR payment_row.amount <> NEW.value_minor
     OR upper(payment_row.currency) <> upper(NEW.currency_code) THEN
    RAISE EXCEPTION 'canonical conversion requires the exact succeeded industrial-order payment';
  END IF;

  SELECT * INTO fulfillment_row FROM industrial_fulfillment_plans
   WHERE id = NEW.fulfillment_plan_id AND tenant_id = NEW.tenant_id;
  IF NOT FOUND OR fulfillment_row.order_id <> NEW.industrial_order_id
     OR fulfillment_row.status::text <> 'delivered' OR fulfillment_row.delivered_at IS NULL THEN
    RAISE EXCEPTION 'canonical conversion requires the delivered fulfillment plan';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM geo_territories WHERE id = NEW.territory_id AND tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'canonical conversion territory is missing or cross-tenant';
  END IF;

  IF NEW.source_kind = 'ad_campaign' THEN
    SELECT * INTO campaign_row FROM ad_campaigns
     WHERE id = NEW.campaign_id AND tenant_id = NEW.tenant_id;
    IF NOT FOUND OR campaign_row.territory_id <> NEW.territory_id
       OR campaign_row.status NOT IN ('ACTIVE', 'COMPLETED')
       OR campaign_row.provider_confirmed_at IS NULL THEN
      RAISE EXCEPTION 'canonical ad conversion requires a provider-confirmed active or completed campaign in the territory';
    END IF;
  ELSIF NEW.source_kind = 'social_publication' THEN
    SELECT * INTO publication_row FROM social_publication_attempts
     WHERE id = NEW.publication_attempt_id AND tenant_id = NEW.tenant_id;
    IF NOT FOUND OR publication_row.territory_id IS DISTINCT FROM NEW.territory_id
       OR publication_row.status <> 'PUBLISHED'
       OR publication_row.provider_confirmed_at IS NULL
       OR publication_row.published_at IS NULL THEN
      RAISE EXCEPTION 'canonical organic conversion requires a provider-confirmed publication in the territory';
    END IF;
  ELSE
    RAISE EXCEPTION 'canonical conversion source kind is invalid';
  END IF;

  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'conversion_events_validate_canonical_binding'
  ) THEN
    CREATE TRIGGER conversion_events_validate_canonical_binding
      BEFORE INSERT OR UPDATE ON conversion_events
      FOR EACH ROW EXECUTE FUNCTION exportunity_validate_canonical_conversion_binding();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION exportunity_validate_canonical_attribution_binding()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  conversion_row conversion_events%ROWTYPE;
BEGIN
  IF NOT (NEW.evidence @> '{"canonicalBinding": true}'::jsonb) THEN
    RETURN NEW;
  END IF;

  SELECT * INTO conversion_row FROM conversion_events
   WHERE id = NEW.conversion_event_id AND tenant_id = NEW.tenant_id;
  IF NOT FOUND OR conversion_row.canonical_binding_status <> 'verified'
     OR conversion_row.territory_id IS DISTINCT FROM NEW.territory_id
     OR conversion_row.campaign_id IS DISTINCT FROM NEW.campaign_id
     OR conversion_row.publication_attempt_id IS DISTINCT FROM NEW.publication_attempt_id
     OR conversion_row.value_minor <> NEW.attributed_value_minor THEN
    RAISE EXCEPTION 'canonical attribution must exactly match its verified conversion';
  END IF;

  IF NEW.campaign_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM ad_creatives
       WHERE id = NEW.creative_id AND tenant_id = NEW.tenant_id
         AND campaign_id = NEW.campaign_id
         AND media_item_id = NEW.media_item_id
         AND source_reference_id = NEW.source_reference_id
         AND rights_grant_id = NEW.rights_grant_id
         AND status = 'APPROVED'
    ) THEN
      RAISE EXCEPTION 'canonical ad attribution requires the approved creative and exact provenance';
    END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM social_publication_attempts
       WHERE id = NEW.publication_attempt_id AND tenant_id = NEW.tenant_id
         AND media_item_id = NEW.media_item_id
         AND source_reference_id = NEW.source_reference_id
         AND rights_grant_id = NEW.rights_grant_id
         AND status = 'PUBLISHED'
         AND provider_confirmed_at IS NOT NULL AND published_at IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'canonical organic attribution requires the exact confirmed publication provenance';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM media_rights_grants
     WHERE id = NEW.rights_grant_id AND tenant_id = NEW.tenant_id
       AND source_reference_id = NEW.source_reference_id AND status = 'granted'
  ) THEN
    RAISE EXCEPTION 'canonical attribution requires the active tenant rights grant';
  END IF;

  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'attribution_records_validate_canonical_binding'
  ) THEN
    CREATE TRIGGER attribution_records_validate_canonical_binding
      BEFORE INSERT OR UPDATE ON attribution_records
      FOR EACH ROW EXECUTE FUNCTION exportunity_validate_canonical_attribution_binding();
  END IF;
END $$;

-- Rollback is deliberately manual and destructive: drop the two triggers and
-- functions, indexes, constraints, then the additive columns. Never drop the
-- canonical conversion_events or attribution_records ledgers.
