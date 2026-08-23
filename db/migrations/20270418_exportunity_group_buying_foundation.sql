-- Exportunity group purchase, production batch, and explainable settlement foundation.
-- This is commerce only. It does not create a securities rail, collect funds,
-- reserve funds, execute production, book a carrier, or submit settlement.

DO $$ BEGIN
  CREATE TYPE group_buying_campaign_type AS ENUM (
    'preorder','group_order','buyer_club','production_batch','recurring_procurement'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE group_buying_campaign_status AS ENUM (
    'draft','verification_required','live','threshold_pending','moq_reached',
    'payment_confirmed','production','ready_for_pickup','in_transit','delivered',
    'settled','failed','refunding','refunded'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE group_buying_commitment_status AS ENUM (
    'interest_recorded','order_required','payment_pending','payment_confirmed',
    'allocated_to_batch','fulfilled','cancelled','refund_pending','refunded'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE group_buying_update_status AS ENUM (
    'draft','approved','published','withdrawn'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE production_batch_status AS ENUM (
    'planned','capacity_confirmed','funded_by_orders','production','quality_review',
    'ready_for_pickup','in_transit','delivered','settlement_pending','settled',
    'failed','refunding','refunded'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE group_settlement_status AS ENUM (
    'draft','approval_required','approved_submission_ready','submitted',
    'provider_confirmed','reconciled','reversed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS group_buying_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  reference_code text NOT NULL,
  slug text NOT NULL,
  campaign_type group_buying_campaign_type NOT NULL,
  status group_buying_campaign_status NOT NULL DEFAULT 'draft',
  catalog_item_id uuid NOT NULL REFERENCES industrial_catalog_items(id) ON DELETE RESTRICT,
  producer_factory_id uuid NOT NULL REFERENCES industrial_factories(id) ON DELETE RESTRICT,
  supplier_profile_id uuid REFERENCES industrial_supplier_profiles(id) ON DELETE SET NULL,
  territory_id integer NOT NULL REFERENCES geo_territories(id) ON DELETE RESTRICT,
  campaign_media_item_id text REFERENCES marketing_media_items(id) ON DELETE SET NULL,
  media_rights_grant_id integer REFERENCES media_rights_grants(id) ON DELETE SET NULL,
  title text NOT NULL,
  public_summary text NOT NULL,
  unit_of_measure text NOT NULL,
  minimum_quantity numeric(18,4) NOT NULL,
  interest_quantity numeric(18,4) NOT NULL DEFAULT 0,
  pending_quantity numeric(18,4) NOT NULL DEFAULT 0,
  committed_quantity numeric(18,4) NOT NULL DEFAULT 0,
  fulfilled_quantity numeric(18,4) NOT NULL DEFAULT 0,
  refunded_quantity numeric(18,4) NOT NULL DEFAULT 0,
  currency_code text NOT NULL,
  base_unit_price_minor bigint NOT NULL,
  deadline timestamptz NOT NULL,
  production_lead_time_days integer NOT NULL,
  estimated_ready_at timestamptz,
  delivery_options jsonb NOT NULL DEFAULT '[]'::jsonb,
  payment_terms text NOT NULL,
  refund_conditions text NOT NULL,
  capacity_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  campaign_content jsonb NOT NULL DEFAULT '{}'::jsonb,
  verification_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  commerce_rail text NOT NULL DEFAULT 'preorder_or_group_purchase',
  regulated_capital_enabled boolean NOT NULL DEFAULT false,
  risk_classification text NOT NULL DEFAULT 'standard_commerce',
  external_payment_collection_executed boolean NOT NULL DEFAULT false,
  external_settlement_executed boolean NOT NULL DEFAULT false,
  preparation_action_run_id integer,
  approval_action_run_id integer,
  prepared_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  approved_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  live_at timestamptz,
  threshold_reached_at timestamptz,
  payment_confirmed_at timestamptz,
  failed_at timestamptz,
  refunded_at timestamptz,
  settled_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT group_buying_campaigns_quantity_check CHECK (
    minimum_quantity > 0 AND interest_quantity >= 0 AND pending_quantity >= 0 AND
    committed_quantity >= 0 AND fulfilled_quantity >= 0 AND refunded_quantity >= 0 AND
    fulfilled_quantity <= committed_quantity AND refunded_quantity <= committed_quantity
  ),
  CONSTRAINT group_buying_campaigns_price_currency_check CHECK (
    base_unit_price_minor >= 0 AND currency_code ~ '^[A-Z]{3}$'
  ),
  CONSTRAINT group_buying_campaigns_lead_time_check CHECK (production_lead_time_days >= 0),
  CONSTRAINT group_buying_campaigns_commerce_rail_check CHECK (
    commerce_rail = 'preorder_or_group_purchase' AND regulated_capital_enabled = false
  ),
  CONSTRAINT group_buying_campaigns_media_rights_pair_check CHECK (
    campaign_media_item_id IS NULL OR media_rights_grant_id IS NOT NULL
  ),
  CONSTRAINT group_buying_campaigns_live_truth_check CHECK (
    status NOT IN (
      'live','threshold_pending','moq_reached','payment_confirmed','production',
      'ready_for_pickup','in_transit','delivered','settled','refunding','refunded'
    ) OR (
      approved_by_user_id IS NOT NULL AND live_at IS NOT NULL AND
      verification_evidence @> '{"verified": true}'::jsonb AND
      verification_evidence @> '{"credentialsExcluded": true}'::jsonb AND
      capacity_evidence @> '{"verified": true}'::jsonb AND
      jsonb_typeof(delivery_options) = 'array' AND jsonb_array_length(delivery_options) > 0 AND
      length(trim(payment_terms)) >= 8 AND length(trim(refund_conditions)) >= 8
    )
  ),
  CONSTRAINT group_buying_campaigns_threshold_truth_check CHECK (
    status NOT IN (
      'moq_reached','payment_confirmed','production','ready_for_pickup','in_transit',
      'delivered','settled'
    ) OR (
      committed_quantity >= minimum_quantity AND threshold_reached_at IS NOT NULL
    )
  ),
  CONSTRAINT group_buying_campaigns_payment_truth_check CHECK (
    status NOT IN (
      'payment_confirmed','production','ready_for_pickup','in_transit','delivered','settled'
    ) OR payment_confirmed_at IS NOT NULL
  ),
  CONSTRAINT group_buying_campaigns_settlement_truth_check CHECK (
    status <> 'settled' OR (
      external_settlement_executed = true AND settled_at IS NOT NULL
    )
  ),
  CONSTRAINT group_buying_campaigns_refund_truth_check CHECK (
    status <> 'refunded' OR refunded_at IS NOT NULL
  ),
  UNIQUE (tenant_id, reference_code),
  UNIQUE (tenant_id, slug)
);

CREATE INDEX IF NOT EXISTS group_buying_campaigns_tenant_status_idx
  ON group_buying_campaigns(tenant_id, status, deadline);
CREATE INDEX IF NOT EXISTS group_buying_campaigns_territory_status_idx
  ON group_buying_campaigns(territory_id, status, deadline);

CREATE TABLE IF NOT EXISTS group_buying_price_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES group_buying_campaigns(id) ON DELETE CASCADE,
  minimum_quantity numeric(18,4) NOT NULL,
  maximum_quantity numeric(18,4),
  unit_price_minor bigint NOT NULL,
  currency_code text NOT NULL,
  label text,
  status text NOT NULL DEFAULT 'draft',
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  verified_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  verified_at timestamptz,
  created_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT group_buying_price_tiers_range_check CHECK (
    minimum_quantity > 0 AND (maximum_quantity IS NULL OR maximum_quantity >= minimum_quantity)
  ),
  CONSTRAINT group_buying_price_tiers_amount_check CHECK (
    unit_price_minor >= 0 AND currency_code ~ '^[A-Z]{3}$'
  ),
  CONSTRAINT group_buying_price_tiers_status_check CHECK (status IN ('draft','verified','active','retired')),
  CONSTRAINT group_buying_price_tiers_verified_truth_check CHECK (
    status NOT IN ('verified','active') OR (
      evidence @> '{"verified": true}'::jsonb AND verified_by_user_id IS NOT NULL AND verified_at IS NOT NULL
    )
  ),
  UNIQUE (campaign_id, minimum_quantity)
);

CREATE INDEX IF NOT EXISTS group_buying_price_tiers_campaign_status_idx
  ON group_buying_price_tiers(campaign_id, status, minimum_quantity);

CREATE TABLE IF NOT EXISTS group_buying_commitments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES group_buying_campaigns(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  buyer_user_id integer REFERENCES ece_users(id) ON DELETE RESTRICT,
  buyer_contact_id integer REFERENCES contacts(id) ON DELETE SET NULL,
  status group_buying_commitment_status NOT NULL DEFAULT 'interest_recorded',
  quantity numeric(18,4) NOT NULL,
  price_tier_id uuid REFERENCES group_buying_price_tiers(id) ON DELETE SET NULL,
  unit_price_minor bigint NOT NULL,
  total_amount_minor bigint NOT NULL,
  currency_code text NOT NULL,
  industrial_order_id uuid REFERENCES industrial_orders(id) ON DELETE RESTRICT,
  payment_id uuid REFERENCES payments(id) ON DELETE RESTRICT,
  canonical_payment_verified boolean NOT NULL DEFAULT false,
  payment_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  delivery_option_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  buyer_notes text,
  refund_conditions_accepted_at timestamptz,
  payment_confirmed_at timestamptz,
  cancelled_at timestamptz,
  refunded_at timestamptz,
  created_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  updated_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT group_buying_commitments_identity_check CHECK (
    buyer_user_id IS NOT NULL OR buyer_contact_id IS NOT NULL
  ),
  CONSTRAINT group_buying_commitments_quantity_amount_check CHECK (
    quantity > 0 AND unit_price_minor >= 0 AND total_amount_minor >= 0 AND currency_code ~ '^[A-Z]{3}$'
  ),
  CONSTRAINT group_buying_commitments_payment_truth_check CHECK (
    status NOT IN ('payment_confirmed','allocated_to_batch','fulfilled','refund_pending','refunded') OR (
      industrial_order_id IS NOT NULL AND payment_id IS NOT NULL AND
      canonical_payment_verified = true AND payment_confirmed_at IS NOT NULL AND
      payment_evidence @> '{"providerVerified": true}'::jsonb
    )
  ),
  CONSTRAINT group_buying_commitments_refund_truth_check CHECK (
    status <> 'refunded' OR (
      refunded_at IS NOT NULL AND payment_evidence @> '{"refundVerified": true}'::jsonb
    )
  ),
  CONSTRAINT group_buying_commitments_cancelled_truth_check CHECK (
    status <> 'cancelled' OR cancelled_at IS NOT NULL
  ),
  UNIQUE (tenant_id, idempotency_key),
  UNIQUE (industrial_order_id),
  UNIQUE (payment_id)
);

CREATE INDEX IF NOT EXISTS group_buying_commitments_campaign_status_idx
  ON group_buying_commitments(campaign_id, status, created_at);
CREATE INDEX IF NOT EXISTS group_buying_commitments_buyer_idx
  ON group_buying_commitments(tenant_id, buyer_user_id, created_at);

CREATE TABLE IF NOT EXISTS group_buying_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES group_buying_campaigns(id) ON DELETE CASCADE,
  status group_buying_update_status NOT NULL DEFAULT 'draft',
  audience text NOT NULL DEFAULT 'buyers',
  title text NOT NULL,
  body text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  approved_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  published_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT group_buying_updates_audience_check CHECK (audience IN ('buyers','public','operations')),
  CONSTRAINT group_buying_updates_approval_truth_check CHECK (
    status NOT IN ('approved','published') OR (
      approved_by_user_id IS NOT NULL AND approved_at IS NOT NULL AND evidence <> '{}'::jsonb
    )
  ),
  CONSTRAINT group_buying_updates_publication_truth_check CHECK (
    status <> 'published' OR published_at IS NOT NULL
  ),
  CONSTRAINT group_buying_updates_withdrawal_truth_check CHECK (
    status <> 'withdrawn' OR withdrawn_at IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS group_buying_updates_campaign_status_idx
  ON group_buying_updates(campaign_id, status, created_at);

CREATE TABLE IF NOT EXISTS group_buying_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES group_buying_campaigns(id) ON DELETE CASCADE,
  sequence integer NOT NULL,
  idempotency_key text NOT NULL,
  event_type text NOT NULL,
  previous_status group_buying_campaign_status,
  next_status group_buying_campaign_status,
  actor_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  public_message text,
  internal_note text,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT group_buying_events_sequence_check CHECK (sequence > 0),
  CONSTRAINT group_buying_events_evidence_check CHECK (jsonb_typeof(evidence) = 'array'),
  UNIQUE (campaign_id, sequence),
  UNIQUE (tenant_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS group_buying_events_campaign_created_idx
  ON group_buying_events(campaign_id, created_at);

CREATE TABLE IF NOT EXISTS production_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES group_buying_campaigns(id) ON DELETE CASCADE,
  reference_code text NOT NULL,
  status production_batch_status NOT NULL DEFAULT 'planned',
  target_quantity numeric(18,4) NOT NULL,
  allocated_quantity numeric(18,4) NOT NULL DEFAULT 0,
  produced_quantity numeric(18,4) NOT NULL DEFAULT 0,
  passed_inspection_quantity numeric(18,4) NOT NULL DEFAULT 0,
  ready_quantity numeric(18,4) NOT NULL DEFAULT 0,
  handed_to_carrier_quantity numeric(18,4) NOT NULL DEFAULT 0,
  delivered_quantity numeric(18,4) NOT NULL DEFAULT 0,
  carrier_booking_authorization_id uuid REFERENCES carrier_booking_authorizations(id) ON DELETE SET NULL,
  capacity_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  production_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  inspection_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  handoff_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  delivery_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  settlement_evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  external_production_executed boolean NOT NULL DEFAULT false,
  external_carrier_handoff_executed boolean NOT NULL DEFAULT false,
  external_settlement_executed boolean NOT NULL DEFAULT false,
  approved_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  started_at timestamptz,
  ready_at timestamptz,
  handed_to_carrier_at timestamptz,
  delivered_at timestamptz,
  settled_at timestamptz,
  failed_at timestamptz,
  created_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  updated_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT production_batches_quantity_check CHECK (
    target_quantity > 0 AND allocated_quantity >= 0 AND produced_quantity >= 0 AND
    passed_inspection_quantity >= 0 AND ready_quantity >= 0 AND
    handed_to_carrier_quantity >= 0 AND delivered_quantity >= 0 AND
    allocated_quantity <= target_quantity AND produced_quantity <= allocated_quantity AND
    passed_inspection_quantity <= produced_quantity AND ready_quantity <= passed_inspection_quantity AND
    handed_to_carrier_quantity <= ready_quantity AND delivered_quantity <= handed_to_carrier_quantity
  ),
  CONSTRAINT production_batches_capacity_truth_check CHECK (
    status = 'planned' OR (
      capacity_evidence @> '{"verified": true}'::jsonb AND approved_by_user_id IS NOT NULL
    )
  ),
  CONSTRAINT production_batches_funded_truth_check CHECK (
    status NOT IN (
      'funded_by_orders','production','quality_review','ready_for_pickup','in_transit',
      'delivered','settlement_pending','settled'
    ) OR allocated_quantity = target_quantity
  ),
  CONSTRAINT production_batches_production_truth_check CHECK (
    status NOT IN (
      'production','quality_review','ready_for_pickup','in_transit','delivered',
      'settlement_pending','settled'
    ) OR (
      external_production_executed = true AND started_at IS NOT NULL AND
      jsonb_array_length(production_evidence) > 0
    )
  ),
  CONSTRAINT production_batches_ready_truth_check CHECK (
    status NOT IN ('ready_for_pickup','in_transit','delivered','settlement_pending','settled') OR (
      ready_at IS NOT NULL AND ready_quantity > 0 AND jsonb_array_length(inspection_evidence) > 0
    )
  ),
  CONSTRAINT production_batches_handoff_truth_check CHECK (
    status NOT IN ('in_transit','delivered','settlement_pending','settled') OR (
      external_carrier_handoff_executed = true AND carrier_booking_authorization_id IS NOT NULL AND
      handed_to_carrier_at IS NOT NULL AND jsonb_array_length(handoff_evidence) > 0
    )
  ),
  CONSTRAINT production_batches_delivery_truth_check CHECK (
    status NOT IN ('delivered','settlement_pending','settled') OR (
      delivered_at IS NOT NULL AND delivered_quantity > 0 AND jsonb_array_length(delivery_evidence) > 0
    )
  ),
  CONSTRAINT production_batches_settlement_truth_check CHECK (
    status <> 'settled' OR (
      external_settlement_executed = true AND settled_at IS NOT NULL AND
      jsonb_array_length(settlement_evidence) > 0
    )
  ),
  CONSTRAINT production_batches_failed_truth_check CHECK (status <> 'failed' OR failed_at IS NOT NULL),
  UNIQUE (campaign_id),
  UNIQUE (tenant_id, reference_code)
);

CREATE INDEX IF NOT EXISTS production_batches_tenant_status_idx
  ON production_batches(tenant_id, status, updated_at);

CREATE TABLE IF NOT EXISTS production_batch_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  production_batch_id uuid NOT NULL REFERENCES production_batches(id) ON DELETE CASCADE,
  commitment_id uuid NOT NULL REFERENCES group_buying_commitments(id) ON DELETE RESTRICT,
  industrial_order_id uuid NOT NULL REFERENCES industrial_orders(id) ON DELETE RESTRICT,
  quantity numeric(18,4) NOT NULL,
  status text NOT NULL DEFAULT 'allocated',
  allocated_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  allocated_at timestamptz NOT NULL DEFAULT now(),
  fulfilled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT production_batch_allocations_quantity_check CHECK (quantity > 0),
  CONSTRAINT production_batch_allocations_status_check CHECK (status IN ('allocated','fulfilled','cancelled','refunded')),
  CONSTRAINT production_batch_allocations_fulfilled_truth_check CHECK (
    status <> 'fulfilled' OR fulfilled_at IS NOT NULL
  ),
  UNIQUE (commitment_id)
);

CREATE INDEX IF NOT EXISTS production_batch_allocations_batch_status_idx
  ON production_batch_allocations(production_batch_id, status);

CREATE TABLE IF NOT EXISTS group_settlement_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES group_buying_campaigns(id) ON DELETE CASCADE,
  production_batch_id uuid NOT NULL REFERENCES production_batches(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  status group_settlement_status NOT NULL DEFAULT 'draft',
  gross_collected_minor bigint NOT NULL,
  refund_exposure_minor bigint NOT NULL DEFAULT 0,
  distributable_minor bigint NOT NULL,
  currency_code text NOT NULL,
  calculation_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  approval_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider_settlement_reference text,
  external_settlement_executed boolean NOT NULL DEFAULT false,
  preparation_action_run_id integer,
  approval_action_run_id integer,
  prepared_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  approved_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  provider_confirmed_at timestamptz,
  reconciled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT group_settlement_plans_amount_check CHECK (
    gross_collected_minor >= 0 AND refund_exposure_minor >= 0 AND
    distributable_minor >= 0 AND distributable_minor = gross_collected_minor - refund_exposure_minor AND
    currency_code ~ '^[A-Z]{3}$'
  ),
  CONSTRAINT group_settlement_plans_approval_truth_check CHECK (
    status <> 'approved_submission_ready' OR (
      approved_by_user_id IS NOT NULL AND approved_at IS NOT NULL AND
      approval_evidence @> '{"humanApproved": true}'::jsonb AND
      external_settlement_executed = false
    )
  ),
  CONSTRAINT group_settlement_plans_submission_truth_check CHECK (
    status NOT IN ('submitted','provider_confirmed','reconciled') OR (
      external_settlement_executed = true AND provider_settlement_reference IS NOT NULL
    )
  ),
  CONSTRAINT group_settlement_plans_provider_truth_check CHECK (
    status NOT IN ('provider_confirmed','reconciled') OR (
      provider_confirmed_at IS NOT NULL AND provider_evidence @> '{"providerConfirmed": true}'::jsonb
    )
  ),
  CONSTRAINT group_settlement_plans_reconciled_truth_check CHECK (
    status <> 'reconciled' OR reconciled_at IS NOT NULL
  ),
  UNIQUE (tenant_id, idempotency_key),
  UNIQUE (production_batch_id)
);

CREATE INDEX IF NOT EXISTS group_settlement_plans_tenant_status_idx
  ON group_settlement_plans(tenant_id, status, updated_at);

CREATE TABLE IF NOT EXISTS group_settlement_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  settlement_plan_id uuid NOT NULL REFERENCES group_settlement_plans(id) ON DELETE CASCADE,
  commitment_id uuid REFERENCES group_buying_commitments(id) ON DELETE SET NULL,
  recipient_role text NOT NULL,
  recipient_reference text,
  amount_minor bigint NOT NULL,
  currency_code text NOT NULL,
  calculation_basis text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT group_settlement_allocations_role_check CHECK (
    recipient_role IN (
      'producer_proceeds','creator_affiliate_commission','salesperson_commission',
      'territory_operator_commission','carrier_fee','taxes','payment_provider_fee',
      'exportunity_commission','reserve','refund_exposure'
    )
  ),
  CONSTRAINT group_settlement_allocations_amount_check CHECK (
    amount_minor >= 0 AND currency_code ~ '^[A-Z]{3}$'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS group_settlement_allocations_plan_role_commitment_unique
  ON group_settlement_allocations(
    settlement_plan_id,
    recipient_role,
    COALESCE(commitment_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );
CREATE INDEX IF NOT EXISTS group_settlement_allocations_plan_idx
  ON group_settlement_allocations(settlement_plan_id, recipient_role);
