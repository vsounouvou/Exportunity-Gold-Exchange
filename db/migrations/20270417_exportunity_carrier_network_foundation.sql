BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'carrier_profile_status') THEN
    CREATE TYPE carrier_profile_status AS ENUM (
      'discovered', 'contactable', 'contacted', 'prequalified', 'verified',
      'contracted', 'active', 'suspended', 'rejected', 'archived'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'carrier_verification_status') THEN
    CREATE TYPE carrier_verification_status AS ENUM (
      'unverified', 'source_verified', 'contact_verified', 'document_verified',
      'contract_verified', 'transaction_verified'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'carrier_partnership_status') THEN
    CREATE TYPE carrier_partnership_status AS ENUM (
      'candidate', 'verified_provider', 'contracted_partner', 'internal_network'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'carrier_coverage_status') THEN
    CREATE TYPE carrier_coverage_status AS ENUM (
      'candidate', 'evidence_pending', 'verified', 'active', 'suspended',
      'unavailable', 'expired'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'carrier_adapter_connection_status') THEN
    CREATE TYPE carrier_adapter_connection_status AS ENUM (
      'disconnected', 'pending_verification', 'verified', 'restricted',
      'revoked', 'error'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'carrier_quote_request_status') THEN
    CREATE TYPE carrier_quote_request_status AS ENUM (
      'prepared', 'manual_required', 'submission_ready', 'submitted',
      'quotes_received', 'selected', 'expired', 'cancelled'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'carrier_delivery_quote_status') THEN
    CREATE TYPE carrier_delivery_quote_status AS ENUM (
      'received', 'evidence_pending', 'verified', 'selected', 'rejected',
      'expired', 'withdrawn'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'carrier_booking_authorization_status') THEN
    CREATE TYPE carrier_booking_authorization_status AS ENUM (
      'approval_required', 'approved_submission_ready', 'submitted',
      'provider_confirmed', 'in_progress', 'completed', 'cancelled', 'failed'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'carrier_provider_receipt_status') THEN
    CREATE TYPE carrier_provider_receipt_status AS ENUM (
      'received', 'verified', 'projected', 'rejected', 'duplicate', 'error'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'carrier_incident_severity') THEN
    CREATE TYPE carrier_incident_severity AS ENUM ('low', 'medium', 'high', 'critical');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'carrier_incident_status') THEN
    CREATE TYPE carrier_incident_status AS ENUM (
      'open', 'investigating', 'action_required', 'resolved', 'dismissed'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS carrier_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  reference_code text NOT NULL,
  legal_name text NOT NULL,
  display_name text NOT NULL,
  carrier_type text NOT NULL,
  status carrier_profile_status NOT NULL DEFAULT 'discovered',
  verification_status carrier_verification_status NOT NULL DEFAULT 'unverified',
  partnership_status carrier_partnership_status NOT NULL DEFAULT 'candidate',
  provider_code text,
  headquarters_country_code text,
  website_url text,
  support_email text,
  support_phone text,
  operating_country_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  transport_modes jsonb NOT NULL DEFAULT '[]'::jsonb,
  capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  commodity_categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  contact_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  insurance_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  compliance_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  verification_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  restriction_status text NOT NULL DEFAULT 'none',
  risk_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_verified_at timestamp,
  verification_expires_at timestamp,
  verified_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  created_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  updated_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT carrier_profiles_country_code_check CHECK (
    headquarters_country_code IS NULL OR headquarters_country_code ~ '^[A-Z]{2}$'
  ),
  CONSTRAINT carrier_profiles_verified_evidence_check CHECK (
    status NOT IN ('verified', 'contracted', 'active') OR (
      verification_status <> 'unverified'
      AND verification_evidence @> '{"verified": true}'::jsonb
      AND last_verified_at IS NOT NULL
      AND verified_by_user_id IS NOT NULL
    )
  ),
  CONSTRAINT carrier_profiles_partnership_truth_check CHECK (
    partnership_status = 'candidate' OR (
      verification_status <> 'unverified'
      AND verification_evidence @> '{"verified": true}'::jsonb
      AND last_verified_at IS NOT NULL
      AND verified_by_user_id IS NOT NULL
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS carrier_profiles_tenant_reference_unique
  ON carrier_profiles(tenant_id, reference_code);
CREATE INDEX IF NOT EXISTS carrier_profiles_tenant_status_idx
  ON carrier_profiles(tenant_id, status, updated_at);
CREATE INDEX IF NOT EXISTS carrier_profiles_tenant_provider_idx
  ON carrier_profiles(tenant_id, provider_code);

CREATE TABLE IF NOT EXISTS carrier_coverages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  carrier_profile_id uuid NOT NULL REFERENCES carrier_profiles(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  origin_territory_id integer REFERENCES geo_territories(id) ON DELETE SET NULL,
  destination_territory_id integer REFERENCES geo_territories(id) ON DELETE SET NULL,
  origin_country_code text NOT NULL,
  destination_country_code text NOT NULL,
  service_type text NOT NULL,
  transport_mode text NOT NULL,
  service_level text,
  product_category text,
  vehicle_types jsonb NOT NULL DEFAULT '[]'::jsonb,
  capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  max_weight_kg numeric(16,3),
  max_volume_m3 numeric(16,3),
  minimum_transit_days integer,
  maximum_transit_days integer,
  hazardous_goods_supported boolean NOT NULL DEFAULT false,
  cold_chain_supported boolean NOT NULL DEFAULT false,
  customs_supported boolean NOT NULL DEFAULT false,
  insurance_supported boolean NOT NULL DEFAULT false,
  status carrier_coverage_status NOT NULL DEFAULT 'candidate',
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_reference text,
  last_verified_at timestamp,
  valid_until timestamp,
  verified_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  created_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  updated_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT carrier_coverages_country_codes_check CHECK (
    origin_country_code ~ '^[A-Z]{2}$' AND destination_country_code ~ '^[A-Z]{2}$'
  ),
  CONSTRAINT carrier_coverages_service_type_check CHECK (
    service_type IN ('freight', 'customs', 'last_mile')
  ),
  CONSTRAINT carrier_coverages_transit_check CHECK (
    (minimum_transit_days IS NULL OR minimum_transit_days >= 0)
    AND (maximum_transit_days IS NULL OR maximum_transit_days >= 0)
    AND (
      minimum_transit_days IS NULL OR maximum_transit_days IS NULL
      OR maximum_transit_days >= minimum_transit_days
    )
  ),
  CONSTRAINT carrier_coverages_capacity_check CHECK (
    (max_weight_kg IS NULL OR max_weight_kg >= 0)
    AND (max_volume_m3 IS NULL OR max_volume_m3 >= 0)
  ),
  CONSTRAINT carrier_coverages_verified_evidence_check CHECK (
    status NOT IN ('verified', 'active') OR (
      jsonb_array_length(evidence) > 0
      AND source_reference IS NOT NULL
      AND last_verified_at IS NOT NULL
      AND verified_by_user_id IS NOT NULL
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS carrier_coverages_tenant_idempotency_unique
  ON carrier_coverages(tenant_id, idempotency_key);
CREATE INDEX IF NOT EXISTS carrier_coverages_tenant_route_idx
  ON carrier_coverages(tenant_id, origin_country_code, destination_country_code, status);
CREATE INDEX IF NOT EXISTS carrier_coverages_carrier_status_idx
  ON carrier_coverages(carrier_profile_id, status, updated_at);

CREATE TABLE IF NOT EXISTS carrier_adapter_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  carrier_profile_id uuid NOT NULL REFERENCES carrier_profiles(id) ON DELETE CASCADE,
  integration_connection_id uuid REFERENCES mindbase_integration_connections(id) ON DELETE SET NULL,
  provider text NOT NULL,
  environment text NOT NULL DEFAULT 'production',
  status carrier_adapter_connection_status NOT NULL DEFAULT 'pending_verification',
  external_account_reference text,
  credential_reference text,
  capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  callback_status text NOT NULL DEFAULT 'not_configured',
  restriction_status text NOT NULL DEFAULT 'none',
  verification_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_verified_at timestamp,
  verified_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  created_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  updated_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT carrier_adapter_connections_environment_check CHECK (
    environment IN ('sandbox', 'test', 'production')
  ),
  CONSTRAINT carrier_adapter_connections_verified_check CHECK (
    status <> 'verified' OR (
      verification_evidence @> '{"verified": true}'::jsonb
      AND verification_evidence @> '{"credentialsExcluded": true}'::jsonb
      AND last_verified_at IS NOT NULL
      AND verified_by_user_id IS NOT NULL
      AND restriction_status = 'none'
      AND (integration_connection_id IS NOT NULL OR credential_reference IS NOT NULL)
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS carrier_adapter_connections_tenant_carrier_provider_unique
  ON carrier_adapter_connections(tenant_id, carrier_profile_id, provider, environment);
CREATE INDEX IF NOT EXISTS carrier_adapter_connections_tenant_status_idx
  ON carrier_adapter_connections(tenant_id, status, updated_at);

CREATE TABLE IF NOT EXISTS carrier_quote_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  industrial_order_id uuid NOT NULL REFERENCES industrial_orders(id) ON DELETE CASCADE,
  fulfillment_plan_id uuid REFERENCES industrial_fulfillment_plans(id) ON DELETE SET NULL,
  fulfillment_service_id uuid REFERENCES industrial_fulfillment_services(id) ON DELETE SET NULL,
  idempotency_key text NOT NULL,
  service_type text NOT NULL,
  status carrier_quote_request_status NOT NULL DEFAULT 'prepared',
  origin_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  destination_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  cargo_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  incoterm text,
  requested_pickup_at timestamp,
  required_delivery_at timestamp,
  required_capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  matched_coverage_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  manual_package jsonb NOT NULL DEFAULT '{}'::jsonb,
  preparation_action_run_id integer,
  prepared_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  provider_request_executed boolean NOT NULL DEFAULT false,
  provider_request_receipt jsonb NOT NULL DEFAULT '{}'::jsonb,
  external_submitted_at timestamp,
  expires_at timestamp,
  selected_quote_id uuid,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT carrier_quote_requests_service_type_check CHECK (
    service_type IN ('freight', 'customs', 'last_mile')
  ),
  CONSTRAINT carrier_quote_requests_route_check CHECK (
    jsonb_typeof(origin_snapshot) = 'object'
    AND jsonb_typeof(destination_snapshot) = 'object'
    AND origin_snapshot <> '{}'::jsonb
    AND destination_snapshot <> '{}'::jsonb
  ),
  CONSTRAINT carrier_quote_requests_submission_truth_check CHECK (
    status <> 'submitted' OR (
      provider_request_executed = true
      AND external_submitted_at IS NOT NULL
      AND provider_request_receipt <> '{}'::jsonb
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS carrier_quote_requests_tenant_idempotency_unique
  ON carrier_quote_requests(tenant_id, idempotency_key);
CREATE INDEX IF NOT EXISTS carrier_quote_requests_tenant_order_status_idx
  ON carrier_quote_requests(tenant_id, industrial_order_id, status, updated_at);

CREATE TABLE IF NOT EXISTS carrier_delivery_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  quote_request_id uuid NOT NULL REFERENCES carrier_quote_requests(id) ON DELETE CASCADE,
  industrial_order_id uuid NOT NULL REFERENCES industrial_orders(id) ON DELETE CASCADE,
  carrier_profile_id uuid NOT NULL REFERENCES carrier_profiles(id) ON DELETE RESTRICT,
  carrier_coverage_id uuid REFERENCES carrier_coverages(id) ON DELETE SET NULL,
  adapter_connection_id uuid REFERENCES carrier_adapter_connections(id) ON DELETE SET NULL,
  idempotency_key text NOT NULL,
  status carrier_delivery_quote_status NOT NULL DEFAULT 'received',
  source_type text NOT NULL,
  provider_quote_reference text,
  total_cost_minor integer NOT NULL,
  customer_price_minor integer,
  currency_code text NOT NULL,
  cost_breakdown jsonb NOT NULL DEFAULT '[]'::jsonb,
  minimum_transit_days integer,
  maximum_transit_days integer,
  pickup_window_start timestamp,
  pickup_window_end timestamp,
  estimated_delivery_at timestamp,
  valid_until timestamp NOT NULL,
  terms jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  received_at timestamp NOT NULL DEFAULT now(),
  verified_at timestamp,
  selected_at timestamp,
  verified_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  recorded_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  action_run_id integer,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT carrier_delivery_quotes_source_type_check CHECK (
    source_type IN ('manual_evidence', 'provider_callback', 'approved_import')
  ),
  CONSTRAINT carrier_delivery_quotes_amount_check CHECK (
    total_cost_minor >= 0
    AND (customer_price_minor IS NULL OR customer_price_minor >= total_cost_minor)
    AND currency_code ~ '^[A-Z]{3}$'
  ),
  CONSTRAINT carrier_delivery_quotes_transit_check CHECK (
    (minimum_transit_days IS NULL OR minimum_transit_days >= 0)
    AND (maximum_transit_days IS NULL OR maximum_transit_days >= 0)
    AND (
      minimum_transit_days IS NULL OR maximum_transit_days IS NULL
      OR maximum_transit_days >= minimum_transit_days
    )
  ),
  CONSTRAINT carrier_delivery_quotes_verified_evidence_check CHECK (
    status NOT IN ('verified', 'selected') OR (
      jsonb_array_length(evidence) > 0
      AND verified_at IS NOT NULL
      AND verified_by_user_id IS NOT NULL
      AND (
        provider_quote_reference IS NOT NULL
        OR source_type IN ('manual_evidence', 'approved_import')
      )
    )
  ),
  CONSTRAINT carrier_delivery_quotes_selected_at_check CHECK (
    status <> 'selected' OR selected_at IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS carrier_delivery_quotes_tenant_idempotency_unique
  ON carrier_delivery_quotes(tenant_id, idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS carrier_delivery_quotes_one_selected_per_request
  ON carrier_delivery_quotes(quote_request_id) WHERE status = 'selected';
CREATE INDEX IF NOT EXISTS carrier_delivery_quotes_request_status_idx
  ON carrier_delivery_quotes(quote_request_id, status, total_cost_minor);
CREATE INDEX IF NOT EXISTS carrier_delivery_quotes_tenant_carrier_idx
  ON carrier_delivery_quotes(tenant_id, carrier_profile_id, received_at);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'carrier_quote_requests_selected_quote_id_fkey'
  ) THEN
    ALTER TABLE carrier_quote_requests
      ADD CONSTRAINT carrier_quote_requests_selected_quote_id_fkey
      FOREIGN KEY (selected_quote_id) REFERENCES carrier_delivery_quotes(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS carrier_booking_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  quote_request_id uuid NOT NULL REFERENCES carrier_quote_requests(id) ON DELETE CASCADE,
  delivery_quote_id uuid NOT NULL REFERENCES carrier_delivery_quotes(id) ON DELETE RESTRICT,
  industrial_order_id uuid NOT NULL REFERENCES industrial_orders(id) ON DELETE CASCADE,
  fulfillment_plan_id uuid NOT NULL REFERENCES industrial_fulfillment_plans(id) ON DELETE CASCADE,
  fulfillment_service_id uuid NOT NULL REFERENCES industrial_fulfillment_services(id) ON DELETE CASCADE,
  carrier_profile_id uuid NOT NULL REFERENCES carrier_profiles(id) ON DELETE RESTRICT,
  adapter_connection_id uuid REFERENCES carrier_adapter_connections(id) ON DELETE SET NULL,
  idempotency_key text NOT NULL,
  status carrier_booking_authorization_status NOT NULL DEFAULT 'approval_required',
  authorized_cost_minor integer NOT NULL,
  currency_code text NOT NULL,
  approval_reference text,
  approval_rationale text,
  approval_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider_booking_reference text,
  provider_confirmation_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  preparation_action_run_id integer,
  approval_action_run_id integer,
  prepared_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  approved_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  prepared_at timestamp NOT NULL DEFAULT now(),
  approved_at timestamp,
  provider_submitted_at timestamp,
  provider_confirmed_at timestamp,
  external_booking_executed boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT carrier_booking_authorizations_amount_check CHECK (
    authorized_cost_minor >= 0 AND currency_code ~ '^[A-Z]{3}$'
  ),
  CONSTRAINT carrier_booking_authorizations_approval_check CHECK (
    status <> 'approved_submission_ready' OR (
      approval_reference IS NOT NULL
      AND approval_rationale IS NOT NULL
      AND approval_evidence @> '{"humanApproved": true}'::jsonb
      AND approved_by_user_id IS NOT NULL
      AND approved_at IS NOT NULL
      AND external_booking_executed = false
    )
  ),
  CONSTRAINT carrier_booking_authorizations_submission_truth_check CHECK (
    status NOT IN ('submitted', 'provider_confirmed', 'in_progress', 'completed') OR (
      external_booking_executed = true
      AND provider_submitted_at IS NOT NULL
    )
  ),
  CONSTRAINT carrier_booking_authorizations_provider_confirmation_check CHECK (
    status NOT IN ('provider_confirmed', 'in_progress', 'completed') OR (
      provider_booking_reference IS NOT NULL
      AND provider_confirmation_evidence @> '{"providerConfirmed": true}'::jsonb
      AND provider_confirmed_at IS NOT NULL
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS carrier_booking_authorizations_tenant_idempotency_unique
  ON carrier_booking_authorizations(tenant_id, idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS carrier_booking_authorizations_tenant_quote_unique
  ON carrier_booking_authorizations(tenant_id, delivery_quote_id);
CREATE INDEX IF NOT EXISTS carrier_booking_authorizations_tenant_status_idx
  ON carrier_booking_authorizations(tenant_id, status, updated_at);

CREATE TABLE IF NOT EXISTS carrier_provider_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  adapter_connection_id uuid NOT NULL REFERENCES carrier_adapter_connections(id) ON DELETE CASCADE,
  booking_authorization_id uuid REFERENCES carrier_booking_authorizations(id) ON DELETE SET NULL,
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  payload_hash text NOT NULL,
  signature_verified boolean NOT NULL DEFAULT false,
  status carrier_provider_receipt_status NOT NULL DEFAULT 'received',
  normalized_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  industrial_fulfillment_event_id uuid,
  rejection_reason text,
  received_at timestamp NOT NULL DEFAULT now(),
  processed_at timestamp,
  CONSTRAINT carrier_provider_receipts_signature_check CHECK (
    status NOT IN ('verified', 'projected') OR signature_verified = true
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS carrier_provider_receipts_tenant_provider_event_unique
  ON carrier_provider_receipts(tenant_id, adapter_connection_id, provider_event_id);
CREATE INDEX IF NOT EXISTS carrier_provider_receipts_tenant_status_idx
  ON carrier_provider_receipts(tenant_id, status, received_at);

CREATE TABLE IF NOT EXISTS carrier_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  carrier_profile_id uuid NOT NULL REFERENCES carrier_profiles(id) ON DELETE CASCADE,
  adapter_connection_id uuid REFERENCES carrier_adapter_connections(id) ON DELETE SET NULL,
  booking_authorization_id uuid REFERENCES carrier_booking_authorizations(id) ON DELETE SET NULL,
  severity carrier_incident_severity NOT NULL,
  status carrier_incident_status NOT NULL DEFAULT 'open',
  incident_type text NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  operational_impact jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  opened_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  resolved_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  opened_at timestamp NOT NULL DEFAULT now(),
  resolved_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT carrier_incidents_resolution_check CHECK (
    status NOT IN ('resolved', 'dismissed') OR resolved_at IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS carrier_incidents_tenant_status_idx
  ON carrier_incidents(tenant_id, status, severity, updated_at);
CREATE INDEX IF NOT EXISTS carrier_incidents_carrier_status_idx
  ON carrier_incidents(carrier_profile_id, status, updated_at);

ALTER TABLE industrial_fulfillment_services
  ADD COLUMN IF NOT EXISTS carrier_profile_id uuid,
  ADD COLUMN IF NOT EXISTS carrier_delivery_quote_id uuid,
  ADD COLUMN IF NOT EXISTS carrier_booking_authorization_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'industrial_fulfillment_services_carrier_profile_id_fkey'
  ) THEN
    ALTER TABLE industrial_fulfillment_services
      ADD CONSTRAINT industrial_fulfillment_services_carrier_profile_id_fkey
      FOREIGN KEY (carrier_profile_id) REFERENCES carrier_profiles(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'industrial_fulfillment_services_carrier_delivery_quote_id_fkey'
  ) THEN
    ALTER TABLE industrial_fulfillment_services
      ADD CONSTRAINT industrial_fulfillment_services_carrier_delivery_quote_id_fkey
      FOREIGN KEY (carrier_delivery_quote_id) REFERENCES carrier_delivery_quotes(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'industrial_fulfillment_services_carrier_booking_authorization_id_fkey'
  ) THEN
    ALTER TABLE industrial_fulfillment_services
      ADD CONSTRAINT industrial_fulfillment_services_carrier_booking_authorization_id_fkey
      FOREIGN KEY (carrier_booking_authorization_id) REFERENCES carrier_booking_authorizations(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS industrial_fulfillment_services_carrier_idx
  ON industrial_fulfillment_services(tenant_id, carrier_profile_id, service_type, status);

COMMIT;
