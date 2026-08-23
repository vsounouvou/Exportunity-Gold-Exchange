import { db } from "@db";
import { sql } from "drizzle-orm";

import { ensureExportunityIntegrationTables } from "../exportunity/integrations/ensureTables";

// Additive runtime parity for deployments that boot before migrations are
// promoted. This creates no carrier, contract, quote, booking, or credential.
const statements = [
  `do $$ begin
    if not exists (select 1 from pg_type where typname = 'carrier_profile_status') then
      create type carrier_profile_status as enum ('discovered','contactable','contacted','prequalified','verified','contracted','active','suspended','rejected','archived');
    end if;
    if not exists (select 1 from pg_type where typname = 'carrier_verification_status') then
      create type carrier_verification_status as enum ('unverified','source_verified','contact_verified','document_verified','contract_verified','transaction_verified');
    end if;
    if not exists (select 1 from pg_type where typname = 'carrier_partnership_status') then
      create type carrier_partnership_status as enum ('candidate','verified_provider','contracted_partner','internal_network');
    end if;
    if not exists (select 1 from pg_type where typname = 'carrier_coverage_status') then
      create type carrier_coverage_status as enum ('candidate','evidence_pending','verified','active','suspended','unavailable','expired');
    end if;
    if not exists (select 1 from pg_type where typname = 'carrier_adapter_connection_status') then
      create type carrier_adapter_connection_status as enum ('disconnected','pending_verification','verified','restricted','revoked','error');
    end if;
    if not exists (select 1 from pg_type where typname = 'carrier_quote_request_status') then
      create type carrier_quote_request_status as enum ('prepared','manual_required','submission_ready','submitted','quotes_received','selected','expired','cancelled');
    end if;
    if not exists (select 1 from pg_type where typname = 'carrier_delivery_quote_status') then
      create type carrier_delivery_quote_status as enum ('received','evidence_pending','verified','selected','rejected','expired','withdrawn');
    end if;
    if not exists (select 1 from pg_type where typname = 'carrier_booking_authorization_status') then
      create type carrier_booking_authorization_status as enum ('approval_required','approved_submission_ready','submitted','provider_confirmed','in_progress','completed','cancelled','failed');
    end if;
    if not exists (select 1 from pg_type where typname = 'carrier_provider_receipt_status') then
      create type carrier_provider_receipt_status as enum ('received','verified','projected','rejected','duplicate','error');
    end if;
    if not exists (select 1 from pg_type where typname = 'carrier_incident_severity') then
      create type carrier_incident_severity as enum ('low','medium','high','critical');
    end if;
    if not exists (select 1 from pg_type where typname = 'carrier_incident_status') then
      create type carrier_incident_status as enum ('open','investigating','action_required','resolved','dismissed');
    end if;
  end $$;`,
  `create table if not exists carrier_profiles (
    id uuid primary key default gen_random_uuid(), tenant_id integer not null references tenants(id) on delete cascade,
    reference_code text not null, legal_name text not null, display_name text not null, carrier_type text not null,
    status carrier_profile_status not null default 'discovered',
    verification_status carrier_verification_status not null default 'unverified',
    partnership_status carrier_partnership_status not null default 'candidate', provider_code text,
    headquarters_country_code text, website_url text, support_email text, support_phone text,
    operating_country_codes jsonb not null default '[]'::jsonb, transport_modes jsonb not null default '[]'::jsonb,
    capabilities jsonb not null default '[]'::jsonb, commodity_categories jsonb not null default '[]'::jsonb,
    contact_details jsonb not null default '{}'::jsonb, insurance_evidence jsonb not null default '{}'::jsonb,
    compliance_evidence jsonb not null default '{}'::jsonb, source_provenance jsonb not null default '{}'::jsonb,
    verification_evidence jsonb not null default '{}'::jsonb, restriction_status text not null default 'none',
    risk_flags jsonb not null default '[]'::jsonb, last_verified_at timestamp, verification_expires_at timestamp,
    verified_by_user_id integer references ece_users(id) on delete set null,
    created_by_user_id integer references ece_users(id) on delete set null,
    updated_by_user_id integer references ece_users(id) on delete set null,
    created_at timestamp not null default now(), updated_at timestamp not null default now(),
    constraint carrier_profiles_country_code_check check (headquarters_country_code is null or headquarters_country_code ~ '^[A-Z]{2}$'),
    constraint carrier_profiles_verified_evidence_check check (status not in ('verified','contracted','active') or (verification_status <> 'unverified' and verification_evidence @> '{"verified": true}'::jsonb and last_verified_at is not null and verified_by_user_id is not null)),
    constraint carrier_profiles_partnership_truth_check check (partnership_status = 'candidate' or (verification_status <> 'unverified' and verification_evidence @> '{"verified": true}'::jsonb and last_verified_at is not null and verified_by_user_id is not null)),
    unique (tenant_id, reference_code)
  );`,
  `create index if not exists carrier_profiles_tenant_status_idx on carrier_profiles(tenant_id, status, updated_at);`,
  `create index if not exists carrier_profiles_tenant_provider_idx on carrier_profiles(tenant_id, provider_code);`,
  `create table if not exists carrier_coverages (
    id uuid primary key default gen_random_uuid(), tenant_id integer not null references tenants(id) on delete cascade,
    carrier_profile_id uuid not null references carrier_profiles(id) on delete cascade, idempotency_key text not null,
    origin_territory_id integer references geo_territories(id) on delete set null,
    destination_territory_id integer references geo_territories(id) on delete set null,
    origin_country_code text not null, destination_country_code text not null, service_type text not null,
    transport_mode text not null, service_level text, product_category text,
    vehicle_types jsonb not null default '[]'::jsonb, capabilities jsonb not null default '[]'::jsonb,
    max_weight_kg numeric(16,3), max_volume_m3 numeric(16,3), minimum_transit_days integer,
    maximum_transit_days integer, hazardous_goods_supported boolean not null default false,
    cold_chain_supported boolean not null default false, customs_supported boolean not null default false,
    insurance_supported boolean not null default false, status carrier_coverage_status not null default 'candidate',
    evidence jsonb not null default '[]'::jsonb, source_reference text, last_verified_at timestamp, valid_until timestamp,
    verified_by_user_id integer references ece_users(id) on delete set null,
    created_by_user_id integer references ece_users(id) on delete set null,
    updated_by_user_id integer references ece_users(id) on delete set null,
    metadata jsonb not null default '{}'::jsonb, created_at timestamp not null default now(), updated_at timestamp not null default now(),
    constraint carrier_coverages_country_codes_check check (origin_country_code ~ '^[A-Z]{2}$' and destination_country_code ~ '^[A-Z]{2}$'),
    constraint carrier_coverages_service_type_check check (service_type in ('freight','customs','last_mile')),
    constraint carrier_coverages_transit_check check ((minimum_transit_days is null or minimum_transit_days >= 0) and (maximum_transit_days is null or maximum_transit_days >= 0) and (minimum_transit_days is null or maximum_transit_days is null or maximum_transit_days >= minimum_transit_days)),
    constraint carrier_coverages_capacity_check check ((max_weight_kg is null or max_weight_kg >= 0) and (max_volume_m3 is null or max_volume_m3 >= 0)),
    constraint carrier_coverages_verified_evidence_check check (status not in ('verified','active') or (jsonb_array_length(evidence) > 0 and source_reference is not null and last_verified_at is not null and verified_by_user_id is not null)),
    unique (tenant_id, idempotency_key)
  );`,
  `create index if not exists carrier_coverages_tenant_route_idx on carrier_coverages(tenant_id, origin_country_code, destination_country_code, status);`,
  `create index if not exists carrier_coverages_carrier_status_idx on carrier_coverages(carrier_profile_id, status, updated_at);`,
  `create table if not exists carrier_adapter_connections (
    id uuid primary key default gen_random_uuid(), tenant_id integer not null references tenants(id) on delete cascade,
    carrier_profile_id uuid not null references carrier_profiles(id) on delete cascade,
    exportunity_integration_connection_id uuid,
    provider text not null, environment text not null default 'production',
    status carrier_adapter_connection_status not null default 'pending_verification', external_account_reference text,
    credential_reference text, capabilities jsonb not null default '[]'::jsonb, scopes jsonb not null default '[]'::jsonb,
    callback_status text not null default 'not_configured', restriction_status text not null default 'none',
    verification_evidence jsonb not null default '{}'::jsonb, last_verified_at timestamp,
    verified_by_user_id integer references ece_users(id) on delete set null,
    created_by_user_id integer references ece_users(id) on delete set null,
    updated_by_user_id integer references ece_users(id) on delete set null,
    created_at timestamp not null default now(), updated_at timestamp not null default now(),
    constraint carrier_adapter_connections_exportunity_connection_id_fkey foreign key (exportunity_integration_connection_id) references exportunity_integration_connections(id) on delete set null,
    constraint carrier_adapter_connections_environment_check check (environment in ('sandbox','test','production')),
    constraint carrier_adapter_connections_verified_check check (status <> 'verified' or (verification_evidence @> '{"verified": true}'::jsonb and verification_evidence @> '{"credentialsExcluded": true}'::jsonb and last_verified_at is not null and verified_by_user_id is not null and restriction_status = 'none' and (exportunity_integration_connection_id is not null or credential_reference is not null))),
    unique (tenant_id, carrier_profile_id, provider, environment)
  );`,
  `create index if not exists carrier_adapter_connections_tenant_status_idx on carrier_adapter_connections(tenant_id, status, updated_at);`,
  `alter table carrier_adapter_connections add column if not exists exportunity_integration_connection_id uuid;`,
  `do $$ begin
    if not exists (
      select 1 from pg_constraint
      where conrelid = 'carrier_adapter_connections'::regclass
        and conname = 'carrier_adapter_connections_exportunity_connection_id_fkey'
    ) then
      alter table carrier_adapter_connections add constraint carrier_adapter_connections_exportunity_connection_id_fkey foreign key (exportunity_integration_connection_id) references exportunity_integration_connections(id) on delete set null;
    end if;
  end $$;`,
  `do $$ begin
    if exists (
      select 1 from information_schema.columns
      where table_schema = current_schema() and table_name = 'carrier_adapter_connections' and column_name = 'integration_connection_id'
    ) then
      update carrier_adapter_connections
      set verification_evidence = coalesce(verification_evidence, '{}'::jsonb) || jsonb_build_object(
            'legacyCrossProductReferenceRetired', true,
            'legacyCrossProductConnectionId', integration_connection_id::text,
            'legacyCrossProductReferenceRetiredAt', now()
          ),
          status = case when status = 'verified' then 'restricted'::carrier_adapter_connection_status else status end,
          restriction_status = case when restriction_status = 'none' then 'legacy_cross_product_reference_retired' else restriction_status end,
          integration_connection_id = null,
          updated_at = now()
      where integration_connection_id is not null;
    end if;
  end $$;`,
  `do $$
  declare legacy_constraint record;
  begin
    if exists (
      select 1 from information_schema.columns
      where table_schema = current_schema() and table_name = 'carrier_adapter_connections' and column_name = 'integration_connection_id'
    ) then
      for legacy_constraint in
        select distinct constraint_row.conname
        from pg_constraint constraint_row
        join pg_attribute constrained_column
          on constrained_column.attrelid = constraint_row.conrelid
         and constrained_column.attnum = any(constraint_row.conkey)
        where constraint_row.conrelid = 'carrier_adapter_connections'::regclass
          and constraint_row.contype = 'f'
          and constrained_column.attname = 'integration_connection_id'
      loop
        execute format('alter table carrier_adapter_connections drop constraint %I', legacy_constraint.conname);
      end loop;
    end if;
  end $$;`,
  `alter table carrier_adapter_connections drop constraint if exists carrier_adapter_connections_verified_check;`,
  `alter table carrier_adapter_connections add constraint carrier_adapter_connections_verified_check check (
    status <> 'verified' or (
      verification_evidence @> '{"verified": true}'::jsonb
      and verification_evidence @> '{"credentialsExcluded": true}'::jsonb
      and last_verified_at is not null
      and verified_by_user_id is not null
      and restriction_status = 'none'
      and (exportunity_integration_connection_id is not null or credential_reference is not null)
    )
  );`,
  `do $$ begin
    if exists (
      select 1 from information_schema.columns
      where table_schema = current_schema() and table_name = 'carrier_adapter_connections' and column_name = 'integration_connection_id'
    ) and not exists (
      select 1 from pg_constraint
      where conrelid = 'carrier_adapter_connections'::regclass
        and conname = 'carrier_adapter_connections_legacy_reference_retired_check'
    ) then
      alter table carrier_adapter_connections add constraint carrier_adapter_connections_legacy_reference_retired_check check (integration_connection_id is null);
    end if;
  end $$;`,
  `create index if not exists carrier_adapter_connections_exportunity_connection_idx on carrier_adapter_connections(tenant_id, exportunity_integration_connection_id) where exportunity_integration_connection_id is not null;`,
  `create table if not exists carrier_quote_requests (
    id uuid primary key default gen_random_uuid(), tenant_id integer not null references tenants(id) on delete cascade,
    industrial_order_id uuid not null references industrial_orders(id) on delete cascade,
    fulfillment_plan_id uuid references industrial_fulfillment_plans(id) on delete set null,
    fulfillment_service_id uuid references industrial_fulfillment_services(id) on delete set null,
    idempotency_key text not null, service_type text not null,
    status carrier_quote_request_status not null default 'prepared',
    origin_snapshot jsonb not null default '{}'::jsonb, destination_snapshot jsonb not null default '{}'::jsonb,
    cargo_snapshot jsonb not null default '{}'::jsonb, incoterm text, requested_pickup_at timestamp,
    required_delivery_at timestamp, required_capabilities jsonb not null default '[]'::jsonb,
    matched_coverage_ids jsonb not null default '[]'::jsonb, manual_package jsonb not null default '{}'::jsonb,
    preparation_action_run_id integer, prepared_by_user_id integer references ece_users(id) on delete set null,
    provider_request_executed boolean not null default false,
    provider_request_receipt jsonb not null default '{}'::jsonb, external_submitted_at timestamp,
    expires_at timestamp, selected_quote_id uuid, created_at timestamp not null default now(), updated_at timestamp not null default now(),
    constraint carrier_quote_requests_service_type_check check (service_type in ('freight','customs','last_mile')),
    constraint carrier_quote_requests_route_check check (jsonb_typeof(origin_snapshot) = 'object' and jsonb_typeof(destination_snapshot) = 'object' and origin_snapshot <> '{}'::jsonb and destination_snapshot <> '{}'::jsonb),
    constraint carrier_quote_requests_submission_truth_check check (status <> 'submitted' or (provider_request_executed = true and external_submitted_at is not null and provider_request_receipt <> '{}'::jsonb)),
    unique (tenant_id, idempotency_key)
  );`,
  `create index if not exists carrier_quote_requests_tenant_order_status_idx on carrier_quote_requests(tenant_id, industrial_order_id, status, updated_at);`,
  `create table if not exists carrier_delivery_quotes (
    id uuid primary key default gen_random_uuid(), tenant_id integer not null references tenants(id) on delete cascade,
    quote_request_id uuid not null references carrier_quote_requests(id) on delete cascade,
    industrial_order_id uuid not null references industrial_orders(id) on delete cascade,
    carrier_profile_id uuid not null references carrier_profiles(id) on delete restrict,
    carrier_coverage_id uuid references carrier_coverages(id) on delete set null,
    adapter_connection_id uuid references carrier_adapter_connections(id) on delete set null,
    idempotency_key text not null, status carrier_delivery_quote_status not null default 'received', source_type text not null,
    provider_quote_reference text, total_cost_minor integer not null, customer_price_minor integer, currency_code text not null,
    cost_breakdown jsonb not null default '[]'::jsonb, minimum_transit_days integer, maximum_transit_days integer,
    pickup_window_start timestamp, pickup_window_end timestamp, estimated_delivery_at timestamp,
    valid_until timestamp not null, terms jsonb not null default '{}'::jsonb, evidence jsonb not null default '[]'::jsonb,
    received_at timestamp not null default now(), verified_at timestamp, selected_at timestamp,
    verified_by_user_id integer references ece_users(id) on delete set null,
    recorded_by_user_id integer references ece_users(id) on delete set null, action_run_id integer,
    created_at timestamp not null default now(), updated_at timestamp not null default now(),
    constraint carrier_delivery_quotes_source_type_check check (source_type in ('manual_evidence','provider_callback','approved_import')),
    constraint carrier_delivery_quotes_amount_check check (total_cost_minor >= 0 and (customer_price_minor is null or customer_price_minor >= total_cost_minor) and currency_code ~ '^[A-Z]{3}$'),
    constraint carrier_delivery_quotes_transit_check check ((minimum_transit_days is null or minimum_transit_days >= 0) and (maximum_transit_days is null or maximum_transit_days >= 0) and (minimum_transit_days is null or maximum_transit_days is null or maximum_transit_days >= minimum_transit_days)),
    constraint carrier_delivery_quotes_verified_evidence_check check (status not in ('verified','selected') or (jsonb_array_length(evidence) > 0 and verified_at is not null and verified_by_user_id is not null and (provider_quote_reference is not null or source_type in ('manual_evidence','approved_import')))),
    constraint carrier_delivery_quotes_selected_at_check check (status <> 'selected' or selected_at is not null),
    unique (tenant_id, idempotency_key)
  );`,
  `create unique index if not exists carrier_delivery_quotes_one_selected_per_request on carrier_delivery_quotes(quote_request_id) where status = 'selected';`,
  `create index if not exists carrier_delivery_quotes_request_status_idx on carrier_delivery_quotes(quote_request_id, status, total_cost_minor);`,
  `create index if not exists carrier_delivery_quotes_tenant_carrier_idx on carrier_delivery_quotes(tenant_id, carrier_profile_id, received_at);`,
  `do $$ begin
    if not exists (select 1 from pg_constraint where conname = 'carrier_quote_requests_selected_quote_id_fkey') then
      alter table carrier_quote_requests add constraint carrier_quote_requests_selected_quote_id_fkey foreign key (selected_quote_id) references carrier_delivery_quotes(id) on delete set null;
    end if;
  end $$;`,
  `create table if not exists carrier_booking_authorizations (
    id uuid primary key default gen_random_uuid(), tenant_id integer not null references tenants(id) on delete cascade,
    quote_request_id uuid not null references carrier_quote_requests(id) on delete cascade,
    delivery_quote_id uuid not null references carrier_delivery_quotes(id) on delete restrict,
    industrial_order_id uuid not null references industrial_orders(id) on delete cascade,
    fulfillment_plan_id uuid not null references industrial_fulfillment_plans(id) on delete cascade,
    fulfillment_service_id uuid not null references industrial_fulfillment_services(id) on delete cascade,
    carrier_profile_id uuid not null references carrier_profiles(id) on delete restrict,
    adapter_connection_id uuid references carrier_adapter_connections(id) on delete set null,
    idempotency_key text not null, status carrier_booking_authorization_status not null default 'approval_required',
    authorized_cost_minor integer not null, currency_code text not null, approval_reference text, approval_rationale text,
    approval_evidence jsonb not null default '{}'::jsonb, provider_booking_reference text,
    provider_confirmation_evidence jsonb not null default '{}'::jsonb, preparation_action_run_id integer,
    approval_action_run_id integer, prepared_by_user_id integer references ece_users(id) on delete set null,
    approved_by_user_id integer references ece_users(id) on delete set null,
    prepared_at timestamp not null default now(), approved_at timestamp, provider_submitted_at timestamp,
    provider_confirmed_at timestamp, external_booking_executed boolean not null default false,
    created_at timestamp not null default now(), updated_at timestamp not null default now(),
    constraint carrier_booking_authorizations_amount_check check (authorized_cost_minor >= 0 and currency_code ~ '^[A-Z]{3}$'),
    constraint carrier_booking_authorizations_approval_check check (status <> 'approved_submission_ready' or (approval_reference is not null and approval_rationale is not null and approval_evidence @> '{"humanApproved": true}'::jsonb and approved_by_user_id is not null and approved_at is not null and external_booking_executed = false)),
    constraint carrier_booking_authorizations_submission_truth_check check (status not in ('submitted','provider_confirmed','in_progress','completed') or (external_booking_executed = true and provider_submitted_at is not null)),
    constraint carrier_booking_authorizations_provider_confirmation_check check (status not in ('provider_confirmed','in_progress','completed') or (provider_booking_reference is not null and provider_confirmation_evidence @> '{"providerConfirmed": true}'::jsonb and provider_confirmed_at is not null)),
    unique (tenant_id, idempotency_key), unique (tenant_id, delivery_quote_id)
  );`,
  `create index if not exists carrier_booking_authorizations_tenant_status_idx on carrier_booking_authorizations(tenant_id, status, updated_at);`,
  `create table if not exists carrier_provider_receipts (
    id uuid primary key default gen_random_uuid(), tenant_id integer not null references tenants(id) on delete cascade,
    adapter_connection_id uuid not null references carrier_adapter_connections(id) on delete cascade,
    booking_authorization_id uuid references carrier_booking_authorizations(id) on delete set null,
    provider_event_id text not null, event_type text not null, payload_hash text not null,
    signature_verified boolean not null default false, status carrier_provider_receipt_status not null default 'received',
    normalized_payload jsonb not null default '{}'::jsonb, industrial_fulfillment_event_id uuid,
    rejection_reason text, received_at timestamp not null default now(), processed_at timestamp,
    constraint carrier_provider_receipts_signature_check check (status not in ('verified','projected') or signature_verified = true),
    unique (tenant_id, adapter_connection_id, provider_event_id)
  );`,
  `create index if not exists carrier_provider_receipts_tenant_status_idx on carrier_provider_receipts(tenant_id, status, received_at);`,
  `create table if not exists carrier_incidents (
    id uuid primary key default gen_random_uuid(), tenant_id integer not null references tenants(id) on delete cascade,
    carrier_profile_id uuid not null references carrier_profiles(id) on delete cascade,
    adapter_connection_id uuid references carrier_adapter_connections(id) on delete set null,
    booking_authorization_id uuid references carrier_booking_authorizations(id) on delete set null,
    severity carrier_incident_severity not null, status carrier_incident_status not null default 'open',
    incident_type text not null, title text not null, description text not null,
    operational_impact jsonb not null default '{}'::jsonb, evidence jsonb not null default '[]'::jsonb,
    opened_by_user_id integer references ece_users(id) on delete set null,
    resolved_by_user_id integer references ece_users(id) on delete set null,
    opened_at timestamp not null default now(), resolved_at timestamp,
    created_at timestamp not null default now(), updated_at timestamp not null default now(),
    constraint carrier_incidents_resolution_check check (status not in ('resolved','dismissed') or resolved_at is not null)
  );`,
  `create index if not exists carrier_incidents_tenant_status_idx on carrier_incidents(tenant_id, status, severity, updated_at);`,
  `create index if not exists carrier_incidents_carrier_status_idx on carrier_incidents(carrier_profile_id, status, updated_at);`,
  `alter table industrial_fulfillment_services
    add column if not exists carrier_profile_id uuid,
    add column if not exists carrier_delivery_quote_id uuid,
    add column if not exists carrier_booking_authorization_id uuid;`,
  `do $$ begin
    if not exists (select 1 from pg_constraint where conname = 'industrial_fulfillment_services_carrier_profile_id_fkey') then
      alter table industrial_fulfillment_services add constraint industrial_fulfillment_services_carrier_profile_id_fkey foreign key (carrier_profile_id) references carrier_profiles(id) on delete set null;
    end if;
    if not exists (select 1 from pg_constraint where conname = 'industrial_fulfillment_services_carrier_delivery_quote_id_fkey') then
      alter table industrial_fulfillment_services add constraint industrial_fulfillment_services_carrier_delivery_quote_id_fkey foreign key (carrier_delivery_quote_id) references carrier_delivery_quotes(id) on delete set null;
    end if;
    if not exists (select 1 from pg_constraint where conname = 'industrial_fulfillment_services_carrier_booking_authorization_id_fkey') then
      alter table industrial_fulfillment_services add constraint industrial_fulfillment_services_carrier_booking_authorization_id_fkey foreign key (carrier_booking_authorization_id) references carrier_booking_authorizations(id) on delete set null;
    end if;
  end $$;`,
  `create index if not exists industrial_fulfillment_services_carrier_idx on industrial_fulfillment_services(tenant_id, carrier_profile_id, service_type, status);`,
];

export async function ensureCarrierNetworkTables() {
  await ensureExportunityIntegrationTables();
  for (const statement of statements) {
    await db.execute(sql.raw(statement));
  }
}
