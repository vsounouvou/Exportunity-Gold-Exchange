-- Exportunity Territory Media-to-Commerce OS
-- Tenant-owned ad accounts, hierarchical budget authority, paid-rights gates,
-- immutable spend reconciliation, conversions, attribution, and account health.
-- This migration does not create provider credentials, campaigns, or spend.

create table if not exists ad_account_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id integer not null references tenants(id) on delete cascade,
  publication_target_id integer references social_publication_targets(id) on delete set null,
  integration_connection_id uuid references mindbase_integration_connections(id) on delete set null,
  provider text not null,
  platform text not null,
  external_ad_account_id text not null,
  external_ad_account_label text,
  business_owner_reference text,
  ownership_status text not null default 'unverified',
  billing_ownership_status text not null default 'unverified',
  authorization_status text not null default 'unknown',
  health_status text not null default 'unknown',
  restriction_status text not null default 'unknown',
  capabilities jsonb not null default '[]'::jsonb,
  permissions jsonb not null default '[]'::jsonb,
  verification_evidence jsonb not null default '{}'::jsonb,
  last_verified_at timestamptz,
  created_by_user_id integer,
  updated_by_user_id integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ad_account_connections_provider_check check (provider in ('meta', 'google', 'tiktok', 'linkedin', 'x')),
  constraint ad_account_connections_platform_check check (platform in ('facebook', 'instagram', 'youtube', 'tiktok', 'linkedin', 'x')),
  constraint ad_account_connections_ownership_check check (ownership_status in ('unverified', 'business_owned', 'ownership_disputed', 'not_business_owned')),
  constraint ad_account_connections_billing_check check (billing_ownership_status in ('unverified', 'tenant_owned', 'billing_disputed', 'not_tenant_owned')),
  unique (tenant_id, provider, external_ad_account_id)
);
create index if not exists ad_account_connections_tenant_health_idx
  on ad_account_connections(tenant_id, health_status, updated_at desc);

create table if not exists ad_budget_envelopes (
  id uuid primary key default gen_random_uuid(),
  tenant_id integer not null references tenants(id) on delete cascade,
  parent_envelope_id uuid references ad_budget_envelopes(id) on delete restrict,
  ad_account_connection_id uuid references ad_account_connections(id) on delete restrict,
  territory_id integer references geo_territories(id) on delete restrict,
  idempotency_key text not null,
  name text not null,
  scope_type text not null,
  scope_reference_id text,
  currency_code text not null default 'XOF',
  status text not null default 'approval_required',
  period_start timestamptz not null,
  period_end timestamptz not null,
  total_cap_minor integer not null default 0,
  daily_cap_minor integer not null default 0,
  weekly_cap_minor integer not null default 0,
  monthly_cap_minor integer not null default 0,
  committed_minor integer not null default 0,
  spent_minor integer not null default 0,
  maximum_cac_minor integer not null default 0,
  minimum_margin_bps integer not null default 0,
  agent_reallocation_allowed boolean not null default false,
  maximum_reallocation_bps integer not null default 0,
  stopping_conditions jsonb not null default '{}'::jsonb,
  approval_evidence jsonb not null default '{}'::jsonb,
  approved_by_user_id integer,
  approved_at timestamptz,
  created_by_user_id integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ad_budget_envelopes_scope_check check (scope_type in ('global', 'brand', 'tenant', 'country', 'city', 'neighborhood', 'channel', 'campaign', 'test', 'production', 'rights')),
  constraint ad_budget_envelopes_status_check check (status in ('draft', 'approval_required', 'active', 'paused', 'exhausted', 'expired', 'revoked')),
  constraint ad_budget_envelopes_period_check check (period_end > period_start),
  constraint ad_budget_envelopes_amounts_check check (
    total_cap_minor >= 0 and daily_cap_minor >= 0 and weekly_cap_minor >= 0 and monthly_cap_minor >= 0 and
    committed_minor >= 0 and spent_minor >= 0 and maximum_cac_minor >= 0 and minimum_margin_bps between 0 and 10000 and
    maximum_reallocation_bps between 0 and 10000
  ),
  constraint ad_budget_envelopes_active_approval_check check (
    status <> 'active' or (approved_by_user_id is not null and approved_at is not null)
  ),
  unique (tenant_id, idempotency_key)
);
create index if not exists ad_budget_envelopes_tenant_scope_idx
  on ad_budget_envelopes(tenant_id, scope_type, status, period_end desc);
create index if not exists ad_budget_envelopes_parent_idx on ad_budget_envelopes(parent_envelope_id);

create table if not exists media_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id integer not null references tenants(id) on delete cascade,
  envelope_id uuid not null references ad_budget_envelopes(id) on delete restrict,
  territory_id integer not null references geo_territories(id) on delete restrict,
  action_run_id integer,
  idempotency_key text not null,
  title text not null,
  objective text not null,
  status text not null default 'blocked',
  eligible_products jsonb not null default '[]'::jsonb,
  stock_capacity_evidence jsonb not null default '{}'::jsonb,
  delivery_coverage_evidence jsonb not null default '{}'::jsonb,
  landing_page_url text not null,
  tracking_plan jsonb not null default '{}'::jsonb,
  margin_bps integer not null default 0,
  maximum_cac_minor integer not null default 0,
  rights_evidence jsonb not null default '{}'::jsonb,
  policy_status text not null default 'unknown',
  requested_budget_minor integer not null default 0,
  stopping_conditions jsonb not null default '{}'::jsonb,
  readiness_snapshot jsonb not null default '{}'::jsonb,
  blockers jsonb not null default '[]'::jsonb,
  requested_by_user_id integer,
  approved_by_user_id integer,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint media_plans_status_check check (status in ('blocked', 'approval_required', 'approved', 'archived')),
  constraint media_plans_amounts_check check (margin_bps between 0 and 10000 and maximum_cac_minor >= 0 and requested_budget_minor >= 0),
  constraint media_plans_approved_check check (status <> 'approved' or (approved_by_user_id is not null and approved_at is not null)),
  unique (tenant_id, idempotency_key)
);
create index if not exists media_plans_tenant_status_idx on media_plans(tenant_id, status, updated_at desc);
create index if not exists media_plans_envelope_idx on media_plans(envelope_id, updated_at desc);

create table if not exists ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  tenant_id integer not null references tenants(id) on delete cascade,
  media_plan_id uuid not null references media_plans(id) on delete cascade,
  ad_account_connection_id uuid not null references ad_account_connections(id) on delete restrict,
  envelope_id uuid not null references ad_budget_envelopes(id) on delete restrict,
  territory_id integer not null references geo_territories(id) on delete restrict,
  name text not null,
  objective text not null,
  status text not null default 'DRAFT',
  provider_campaign_id text,
  requested_budget_minor integer not null default 0,
  tracking_code text not null,
  stopping_conditions jsonb not null default '{}'::jsonb,
  provider_state jsonb not null default '{}'::jsonb,
  provider_confirmed_at timestamptz,
  activated_at timestamptz,
  paused_at timestamptz,
  created_by_user_id integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ad_campaigns_status_check check (status in (
    'DRAFT', 'AWAITING_ACCOUNT', 'AWAITING_RIGHTS', 'AWAITING_STOCK', 'AWAITING_DELIVERY',
    'AWAITING_BUDGET', 'NEEDS_REVIEW', 'APPROVED', 'SUBMISSION_READY', 'ACTIVE', 'PAUSED',
    'RESTRICTED', 'COMPLETED', 'FAILED', 'REMOVED'
  )),
  constraint ad_campaigns_amount_check check (requested_budget_minor >= 0),
  constraint ad_campaigns_active_confirmation_check check (
    status <> 'ACTIVE' or (provider_campaign_id is not null and provider_confirmed_at is not null and activated_at is not null)
  ),
  unique (tenant_id, tracking_code),
  unique (tenant_id, ad_account_connection_id, provider_campaign_id)
);
create index if not exists ad_campaigns_tenant_status_idx on ad_campaigns(tenant_id, status, updated_at desc);

create table if not exists ad_groups_or_ad_sets (
  id uuid primary key default gen_random_uuid(),
  tenant_id integer not null references tenants(id) on delete cascade,
  campaign_id uuid not null references ad_campaigns(id) on delete cascade,
  name text not null,
  status text not null default 'DRAFT',
  provider_group_id text,
  audience_definition jsonb not null default '{}'::jsonb,
  territory_targeting jsonb not null default '{}'::jsonb,
  placements jsonb not null default '[]'::jsonb,
  bid_strategy text,
  daily_cap_minor integer not null default 0,
  lifetime_cap_minor integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ad_groups_or_ad_sets_caps_check check (daily_cap_minor >= 0 and lifetime_cap_minor >= 0)
);
create index if not exists ad_groups_or_ad_sets_campaign_idx
  on ad_groups_or_ad_sets(tenant_id, campaign_id, updated_at desc);

create table if not exists ad_creatives (
  id uuid primary key default gen_random_uuid(),
  tenant_id integer not null references tenants(id) on delete cascade,
  campaign_id uuid not null references ad_campaigns(id) on delete cascade,
  group_id uuid references ad_groups_or_ad_sets(id) on delete set null,
  media_item_id text not null references marketing_media_items(id) on delete restrict,
  source_reference_id integer not null references source_content_references(id) on delete restrict,
  rights_grant_id integer not null references media_rights_grants(id) on delete restrict,
  status text not null default 'NEEDS_REVIEW',
  provider_creative_id text,
  title text not null,
  body text not null,
  call_to_action text not null,
  destination_url text not null,
  asset_snapshot jsonb not null default '{}'::jsonb,
  fact_snapshot jsonb not null default '{}'::jsonb,
  rights_snapshot jsonb not null default '{}'::jsonb,
  created_by_user_id integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ad_creatives_status_check check (status in ('NEEDS_REVIEW', 'APPROVED', 'RESTRICTED', 'REMOVED'))
);
create index if not exists ad_creatives_campaign_idx on ad_creatives(tenant_id, campaign_id, updated_at desc);

create table if not exists spend_authorizations (
  id uuid primary key default gen_random_uuid(),
  tenant_id integer not null references tenants(id) on delete cascade,
  envelope_id uuid not null references ad_budget_envelopes(id) on delete restrict,
  media_plan_id uuid not null references media_plans(id) on delete restrict,
  campaign_id uuid references ad_campaigns(id) on delete restrict,
  action_run_id integer,
  idempotency_key text not null,
  status text not null default 'approval_required',
  amount_minor integer not null,
  currency_code text not null,
  valid_from timestamptz not null,
  valid_until timestamptz not null,
  purpose text not null,
  authority_bounds jsonb not null default '{}'::jsonb,
  approval_evidence jsonb not null default '{}'::jsonb,
  requested_by_user_id integer,
  approved_by_user_id integer,
  approved_at timestamptz,
  revoked_by_user_id integer,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint spend_authorizations_status_check check (status in ('approval_required', 'approved', 'denied', 'revoked', 'exhausted', 'expired')),
  constraint spend_authorizations_amount_check check (amount_minor > 0 and valid_until > valid_from),
  constraint spend_authorizations_approved_check check (status <> 'approved' or (approved_by_user_id is not null and approved_at is not null)),
  unique (tenant_id, idempotency_key)
);
create index if not exists spend_authorizations_envelope_status_idx
  on spend_authorizations(tenant_id, envelope_id, status, valid_until desc);

create table if not exists spend_ledger (
  id uuid primary key default gen_random_uuid(),
  tenant_id integer not null references tenants(id) on delete cascade,
  envelope_id uuid not null references ad_budget_envelopes(id) on delete restrict,
  authorization_id uuid not null references spend_authorizations(id) on delete restrict,
  campaign_id uuid references ad_campaigns(id) on delete restrict,
  provider text not null,
  provider_transaction_id text not null,
  entry_type text not null,
  direction text not null,
  amount_minor integer not null,
  currency_code text not null,
  reconciliation_status text not null default 'pending',
  provider_evidence jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  reconciled_at timestamptz,
  created_at timestamptz not null default now(),
  constraint spend_ledger_entry_check check (entry_type in ('authorization_reserved', 'spend_reported', 'refund', 'reversal', 'reconciliation_adjustment')),
  constraint spend_ledger_direction_check check (direction in ('debit', 'credit')),
  constraint spend_ledger_amount_check check (amount_minor >= 0),
  constraint spend_ledger_reconciliation_check check (reconciliation_status in ('pending', 'verified', 'disputed', 'rejected')),
  unique (tenant_id, provider, provider_transaction_id)
);
create index if not exists spend_ledger_envelope_occurred_idx on spend_ledger(envelope_id, occurred_at desc);

create or replace function exportunity_guard_spend_ledger_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'spend_ledger is append-only';
end;
$$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'spend_ledger_no_update') then
    create trigger spend_ledger_no_update before update on spend_ledger
    for each row execute function exportunity_guard_spend_ledger_immutable();
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'spend_ledger_no_delete') then
    create trigger spend_ledger_no_delete before delete on spend_ledger
    for each row execute function exportunity_guard_spend_ledger_immutable();
  end if;
end $$;

create table if not exists conversion_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id integer not null references tenants(id) on delete cascade,
  campaign_id uuid not null references ad_campaigns(id) on delete restrict,
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  order_reference text,
  product_reference text,
  value_minor integer not null default 0,
  currency_code text not null,
  verification_status text not null default 'unverified',
  evidence jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint conversion_events_value_check check (value_minor >= 0),
  constraint conversion_events_verification_check check (verification_status in ('unverified', 'verified', 'rejected', 'disputed')),
  unique (tenant_id, provider, provider_event_id)
);
create index if not exists conversion_events_campaign_occurred_idx on conversion_events(campaign_id, occurred_at desc);

create table if not exists attribution_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id integer not null references tenants(id) on delete cascade,
  conversion_event_id uuid not null references conversion_events(id) on delete cascade,
  campaign_id uuid not null references ad_campaigns(id) on delete restrict,
  creative_id uuid references ad_creatives(id) on delete set null,
  territory_id integer references geo_territories(id) on delete set null,
  attribution_model text not null,
  touchpoint_reference text not null,
  weight_bps integer not null,
  attributed_value_minor integer not null default 0,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint attribution_records_weight_check check (weight_bps between 0 and 10000),
  constraint attribution_records_value_check check (attributed_value_minor >= 0)
);
create index if not exists attribution_records_conversion_idx on attribution_records(tenant_id, conversion_event_id);

create table if not exists account_health_incidents (
  id uuid primary key default gen_random_uuid(),
  tenant_id integer not null references tenants(id) on delete cascade,
  ad_account_connection_id uuid not null references ad_account_connections(id) on delete cascade,
  incident_type text not null,
  severity text not null,
  status text not null default 'open',
  provider_code text,
  summary text not null,
  restrictions jsonb not null default '[]'::jsonb,
  evidence jsonb not null default '{}'::jsonb,
  detected_at timestamptz not null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_health_incidents_severity_check check (severity in ('info', 'warning', 'high', 'critical')),
  constraint account_health_incidents_status_check check (status in ('open', 'investigating', 'resolved', 'dismissed'))
);
create index if not exists account_health_incidents_account_open_idx
  on account_health_incidents(tenant_id, ad_account_connection_id, status, detected_at desc);
