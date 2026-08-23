import { db } from "@db";
import { sql } from "drizzle-orm";
import { ensureExportunityIntegrationTables } from "../exportunity/integrations/ensureTables";
import { ensureAdvertisingGovernanceTables } from "./ensureAdvertisingTables";
import { ensureMediaStudioTables } from "./ensureMediaStudioTables";

/**
 * Runtime parity for deployments that boot before the migration runner. This is
 * schema-only: it never seeds, activates, publishes, or starts background work.
 */
export async function ensureTerritoryMediaCommerceTables() {
  await ensureExportunityIntegrationTables();
  await db.execute(sql`
    alter table if exists territory_kpis
      add column if not exists fulfilled_gmv_minor bigint,
      add column if not exists producer_income_minor bigint,
      add column if not exists contribution_margin_minor bigint,
      add column if not exists creator_attributed_sales_minor bigint,
      add column if not exists media_spend_minor bigint,
      add column if not exists product_page_sessions integer,
      add column if not exists qualified_leads integer,
      add column if not exists acquired_customers integer,
      add column if not exists attributable_completed_orders integer,
      add column if not exists group_order_campaigns integer,
      add column if not exists group_order_thresholds_reached integer,
      add column if not exists payment_attempts integer,
      add column if not exists payment_successes integer,
      add column if not exists delivery_attempts integer,
      add column if not exists successful_deliveries integer,
      add column if not exists on_time_deliveries integer,
      add column if not exists disputes integer,
      add column if not exists refunds integer,
      add column if not exists repeat_buyers integer,
      add column if not exists rights_cleared_assets integer,
      add column if not exists published_content_assets integer,
      add column if not exists currency_code text,
      add column if not exists evidence_status text not null default 'unknown',
      add column if not exists metric_evidence jsonb not null default '{}'::jsonb,
      add column if not exists source_window_start timestamptz,
      add column if not exists source_window_end timestamptz,
      add column if not exists evidence_idempotency_key text,
      add column if not exists evidence_version integer not null default 0,
      add column if not exists scorecard_action_run_id integer,
      add column if not exists recorded_by_user_id integer,
      add column if not exists recorded_at timestamptz,
      add column if not exists updated_at timestamptz default now();

    do $$
    begin
      if not exists (select 1 from pg_constraint where conname = 'territory_kpis_evidence_status_check') then
        alter table territory_kpis add constraint territory_kpis_evidence_status_check
          check (evidence_status in ('unknown', 'partial', 'verified')) not valid;
      end if;
      if not exists (select 1 from pg_constraint where conname = 'territory_kpis_currency_check') then
        alter table territory_kpis add constraint territory_kpis_currency_check
          check (currency_code is null or currency_code ~ '^[A-Z]{3}$') not valid;
      end if;
      if not exists (select 1 from pg_constraint where conname = 'territory_kpis_metric_counts_check') then
        alter table territory_kpis add constraint territory_kpis_metric_counts_check check (
          (fulfilled_gmv_minor is null or fulfilled_gmv_minor >= 0)
          and (producer_income_minor is null or producer_income_minor >= 0)
          and (creator_attributed_sales_minor is null or creator_attributed_sales_minor >= 0)
          and (media_spend_minor is null or media_spend_minor >= 0)
          and (product_page_sessions is null or product_page_sessions >= 0)
          and (qualified_leads is null or qualified_leads >= 0)
          and (acquired_customers is null or acquired_customers >= 0)
          and (attributable_completed_orders is null or attributable_completed_orders >= 0)
          and (group_order_campaigns is null or group_order_campaigns >= 0)
          and (group_order_thresholds_reached is null or group_order_thresholds_reached >= 0)
          and (payment_attempts is null or payment_attempts >= 0)
          and (payment_successes is null or payment_successes >= 0)
          and (delivery_attempts is null or delivery_attempts >= 0)
          and (successful_deliveries is null or successful_deliveries >= 0)
          and (on_time_deliveries is null or on_time_deliveries >= 0)
          and (disputes is null or disputes >= 0)
          and (refunds is null or refunds >= 0)
          and (repeat_buyers is null or repeat_buyers >= 0)
          and (rights_cleared_assets is null or rights_cleared_assets >= 0)
          and (published_content_assets is null or published_content_assets >= 0)
          and evidence_version >= 0
        ) not valid;
      end if;
      if not exists (select 1 from pg_constraint where conname = 'territory_kpis_metric_bounds_check') then
        alter table territory_kpis add constraint territory_kpis_metric_bounds_check check (
          (group_order_thresholds_reached is null or group_order_campaigns is null or group_order_thresholds_reached <= group_order_campaigns)
          and (payment_successes is null or payment_attempts is null or payment_successes <= payment_attempts)
          and (successful_deliveries is null or delivery_attempts is null or successful_deliveries <= delivery_attempts)
          and (on_time_deliveries is null or successful_deliveries is null or on_time_deliveries <= successful_deliveries)
          and (disputes is null or attributable_completed_orders is null or disputes <= attributable_completed_orders)
          and (refunds is null or attributable_completed_orders is null or refunds <= attributable_completed_orders)
          and (acquired_customers is null or qualified_leads is null or acquired_customers <= qualified_leads)
        ) not valid;
      end if;
      if not exists (select 1 from pg_constraint where conname = 'territory_kpis_evidence_binding_check') then
        alter table territory_kpis add constraint territory_kpis_evidence_binding_check check (
          evidence_status = 'unknown'
          or (
            currency_code is not null
            and source_window_start is not null
            and source_window_end is not null
            and source_window_end >= source_window_start
            and recorded_at is not null
            and evidence_idempotency_key is not null
            and evidence_version > 0
            and metric_evidence @> '{"credentialsExcluded": true}'::jsonb
            and jsonb_typeof(metric_evidence -> 'metricKeys') = 'array'
            and jsonb_array_length(metric_evidence -> 'metricKeys') > 0
            and jsonb_typeof(metric_evidence -> 'metrics') = 'object'
          )
        ) not valid;
      end if;
    end $$;

    create unique index if not exists territory_kpis_evidence_idempotency_uniq
      on territory_kpis(territory_id, evidence_idempotency_key)
      where evidence_idempotency_key is not null;
    create index if not exists territory_kpis_evidence_status_idx
      on territory_kpis(territory_id, evidence_status, month desc);
  `);

  await db.execute(sql`
    create table if not exists territory_operational_profiles (
      id serial primary key,
      tenant_id integer not null references tenants(id) on delete cascade,
      territory_id integer not null references geo_territories(id) on delete cascade,
      operating_mode text not null default 'research_only',
      operational_status text not null default 'draft',
      primary_language text,
      secondary_languages jsonb not null default '[]'::jsonb,
      priority_sectors jsonb not null default '[]'::jsonb,
      geography_evidence jsonb not null default '{}'::jsonb,
      operating_rules jsonb not null default '{}'::jsonb,
      data_gaps jsonb not null default '[]'::jsonb,
      readiness_status text not null default 'unknown',
      last_verified_at timestamptz,
      created_by_user_id integer,
      updated_by_user_id integer,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (tenant_id, territory_id)
    );
  `);
  await db.execute(sql`
    create index if not exists territory_operational_profiles_tenant_status_idx
      on territory_operational_profiles(tenant_id, operational_status, updated_at desc);
  `);

  await db.execute(sql`
    create table if not exists territory_activations (
      id serial primary key,
      tenant_id integer not null references tenants(id) on delete cascade,
      territory_id integer not null references geo_territories(id) on delete cascade,
      profile_id integer not null references territory_operational_profiles(id) on delete cascade,
      version integer not null default 1,
      status text not null default 'approval_required',
      operating_mode text not null default 'research_only',
      idempotency_key text not null,
      preparation_action_run_id integer,
      activation_action_run_id integer,
      readiness_snapshot jsonb not null default '{}'::jsonb,
      activation_scope jsonb not null default '{}'::jsonb,
      blockers jsonb not null default '[]'::jsonb,
      evidence jsonb not null default '{}'::jsonb,
      requested_by_user_id integer,
      approved_by_user_id integer,
      requested_at timestamptz not null default now(),
      approved_at timestamptz,
      activated_at timestamptz,
      paused_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (tenant_id, idempotency_key)
    );
  `);
  await db.execute(sql`
    create index if not exists territory_activations_territory_status_idx
      on territory_activations(tenant_id, territory_id, status, updated_at desc);
  `);
  await db.execute(sql`
    create unique index if not exists territory_activations_one_active_idx
      on territory_activations(tenant_id, territory_id) where status = 'active';
  `);

  await db.execute(sql`
    create table if not exists territory_agent_teams (
      id serial primary key,
      tenant_id integer not null references tenants(id) on delete cascade,
      territory_id integer not null references geo_territories(id) on delete cascade,
      activation_id integer not null references territory_activations(id) on delete cascade,
      department_key text not null,
      role_key text not null,
      agent_id integer,
      autonomy_level text not null default 'approval_required',
      responsibility text not null,
      budget_usd_cap text not null default '0.00',
      status text not null default 'planned',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (activation_id, role_key)
    );
  `);
  await db.execute(sql`
    create index if not exists territory_agent_teams_territory_idx
      on territory_agent_teams(tenant_id, territory_id, status);
  `);

  await db.execute(sql`
    create table if not exists territory_coverage_snapshots (
      id serial primary key,
      tenant_id integer not null references tenants(id) on delete cascade,
      territory_id integer not null references geo_territories(id) on delete cascade,
      activation_id integer references territory_activations(id) on delete set null,
      status text not null default 'gaps_identified',
      dimensions jsonb not null default '{}'::jsonb,
      gaps jsonb not null default '[]'::jsonb,
      evidence jsonb not null default '{}'::jsonb,
      captured_by_user_id integer,
      captured_at timestamptz not null default now(),
      created_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`
    create index if not exists territory_coverage_snapshots_territory_captured_idx
      on territory_coverage_snapshots(tenant_id, territory_id, captured_at desc);
  `);

  await db.execute(sql`
    create table if not exists source_content_references (
      id serial primary key,
      tenant_id integer not null references tenants(id) on delete cascade,
      media_item_id text not null references marketing_media_items(id) on delete cascade,
      territory_id integer references geo_territories(id) on delete set null,
      source_platform text,
      source_content_id text,
      source_url text not null,
      canonical_source_url text,
      source_creator_name text,
      source_creator_url text,
      source_published_at timestamptz,
      discovered_by_agent_id integer,
      discovery_evidence jsonb not null default '{}'::jsonb,
      reuse_status text not null default 'reference_only',
      takedown_state text not null default 'clear',
      created_by_user_id integer,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (tenant_id, media_item_id)
    );
  `);
  await db.execute(sql`
    create index if not exists source_content_references_source_lookup_idx
      on source_content_references(tenant_id, source_platform, source_content_id);
  `);

  await db.execute(sql`
    create table if not exists media_rights_grants (
      id serial primary key,
      tenant_id integer not null references tenants(id) on delete cascade,
      source_reference_id integer not null references source_content_references(id) on delete cascade,
      creator_profile_id text,
      rights_holder_name text not null,
      rights_basis text not null,
      status text not null default 'pending',
      usage_types jsonb not null default '[]'::jsonb,
      channels jsonb not null default '[]'::jsonb,
      territory_ids jsonb not null default '[]'::jsonb,
      all_territories boolean not null default false,
      starts_at timestamptz,
      expires_at timestamptz,
      producer_consent_status text not null default 'unknown',
      subject_release_status text not null default 'unknown',
      music_license_status text not null default 'unknown',
      attribution_text text,
      attribution_rules jsonb not null default '{}'::jsonb,
      evidence jsonb not null default '{}'::jsonb,
      granted_by_user_id integer,
      granted_at timestamptz,
      revoked_by_user_id integer,
      revoked_at timestamptz,
      revocation_reason text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`
    create index if not exists media_rights_grants_source_status_idx
      on media_rights_grants(tenant_id, source_reference_id, status, updated_at desc);
  `);

  await db.execute(sql`
    create table if not exists media_rights_events (
      id serial primary key,
      tenant_id integer not null references tenants(id) on delete cascade,
      source_reference_id integer not null references source_content_references(id) on delete cascade,
      grant_id integer references media_rights_grants(id) on delete set null,
      event_type text not null,
      actor_user_id integer,
      payload jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`
    create index if not exists media_rights_events_source_created_idx
      on media_rights_events(tenant_id, source_reference_id, created_at desc);
  `);

  await db.execute(sql`
    create table if not exists social_publication_targets (
      id serial primary key,
      tenant_id integer not null references tenants(id) on delete cascade,
      territory_id integer references geo_territories(id) on delete set null,
      integration_connection_id uuid references mindbase_integration_connections(id) on delete set null,
      exportunity_integration_connection_id uuid references exportunity_integration_connections(id) on delete set null,
      provider text not null,
      platform text not null,
      channel text not null,
      external_account_id text,
      external_account_label text,
      authorization_status text not null default 'unknown',
      health_status text not null default 'unknown',
      capabilities jsonb not null default '[]'::jsonb,
      permissions jsonb not null default '[]'::jsonb,
      verification_evidence jsonb not null default '{}'::jsonb,
      last_verified_at timestamptz,
      created_by_user_id integer,
      updated_by_user_id integer,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`
    create index if not exists social_publication_targets_tenant_platform_idx
      on social_publication_targets(tenant_id, platform, health_status);
  `);
  await db.execute(sql`
    create index if not exists social_publication_targets_connection_idx
      on social_publication_targets(integration_connection_id);

    alter table social_publication_targets
      add column if not exists exportunity_integration_connection_id uuid
      references exportunity_integration_connections(id) on delete set null;

    create index if not exists social_publication_targets_exportunity_connection_idx
      on social_publication_targets(exportunity_integration_connection_id);

    create unique index if not exists social_publication_targets_tenant_platform_account_unique
      on social_publication_targets(tenant_id, platform, external_account_id);
  `);

  await db.execute(sql`
    create table if not exists social_publication_attempts (
      id uuid primary key default gen_random_uuid(),
      tenant_id integer not null references tenants(id) on delete cascade,
      media_item_id text not null references marketing_media_items(id) on delete cascade,
      source_reference_id integer not null references source_content_references(id) on delete restrict,
      rights_grant_id integer not null references media_rights_grants(id) on delete restrict,
      territory_id integer references geo_territories(id) on delete set null,
      target_id integer references social_publication_targets(id) on delete set null,
      integration_connection_id uuid references mindbase_integration_connections(id) on delete set null,
      exportunity_integration_connection_id uuid references exportunity_integration_connections(id) on delete set null,
      action_run_id integer,
      idempotency_key text not null,
      provider text not null,
      platform text not null,
      channel text not null,
      mode text not null default 'manual_package',
      status text not null default 'DRAFT',
      manual_package jsonb not null default '{}'::jsonb,
      provider_state jsonb not null default '{}'::jsonb,
      error_code text,
      error_message text,
      requested_by_user_id integer,
      approved_by_user_id integer,
      scheduled_at timestamptz,
      provider_confirmed_at timestamptz,
      published_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (tenant_id, idempotency_key)
    );
  `);
  await db.execute(sql`
    alter table social_publication_attempts
      add column if not exists exportunity_integration_connection_id uuid
      references exportunity_integration_connections(id) on delete set null;

    create index if not exists social_publication_attempts_exportunity_connection_idx
      on social_publication_attempts(exportunity_integration_connection_id);

    do $$
    begin
      if not exists (
        select 1 from pg_constraint where conname = 'social_publication_attempts_mode_check'
      ) then
        alter table social_publication_attempts
          add constraint social_publication_attempts_mode_check
          check (mode in ('official_api', 'manual_package'));
      end if;
      if not exists (
        select 1 from pg_constraint where conname = 'social_publication_attempts_status_check'
      ) then
        alter table social_publication_attempts
          add constraint social_publication_attempts_status_check
          check (status in (
            'DRAFT', 'AWAITING_RIGHTS', 'AWAITING_CONSENT', 'AWAITING_FACTS',
            'NEEDS_REVIEW', 'APPROVED', 'SCHEDULED', 'UPLOADING', 'PROCESSING',
            'PUBLISHED', 'FAILED', 'RESTRICTED', 'MANUAL_REQUIRED',
            'TAKEDOWN_REQUESTED', 'REMOVED'
          ));
      end if;
      if not exists (
        select 1 from pg_constraint where conname = 'social_publication_attempts_manual_not_published_check'
      ) then
        alter table social_publication_attempts
          add constraint social_publication_attempts_manual_not_published_check
          check (mode <> 'manual_package' or status <> 'PUBLISHED');
      end if;
      if not exists (
        select 1 from pg_constraint where conname = 'social_publication_attempts_provider_confirmation_check'
      ) then
        alter table social_publication_attempts
          add constraint social_publication_attempts_provider_confirmation_check
          check (status <> 'PUBLISHED' or (provider_confirmed_at is not null and published_at is not null));
      end if;
    end $$;
  `);
  await db.execute(sql`
    create index if not exists social_publication_attempts_media_created_idx
      on social_publication_attempts(tenant_id, media_item_id, created_at desc);
  `);
  await db.execute(sql`
    create index if not exists social_publication_attempts_status_idx
      on social_publication_attempts(tenant_id, platform, status, updated_at desc);
  `);

  await db.execute(sql`
    create table if not exists social_publication_events (
      id serial primary key,
      tenant_id integer not null references tenants(id) on delete cascade,
      attempt_id uuid not null references social_publication_attempts(id) on delete cascade,
      event_type text not null,
      status text not null,
      actor_user_id integer,
      payload jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`
    create index if not exists social_publication_events_attempt_created_idx
      on social_publication_events(tenant_id, attempt_id, created_at desc);
  `);

  await db.execute(sql`
    create table if not exists social_inbox_events (
      id uuid primary key default gen_random_uuid(),
      tenant_id integer not null references tenants(id) on delete cascade,
      target_id integer references social_publication_targets(id) on delete set null,
      provider text not null,
      platform text not null,
      channel text not null,
      event_type text not null,
      provider_event_id text not null,
      external_account_id text not null,
      external_actor_id text not null,
      external_actor_label text,
      external_thread_id text,
      parent_content_id text,
      parent_content_url text,
      thread_id integer not null references communications_threads(id) on delete restrict,
      message_id integer not null references communications_messages(id) on delete restrict,
      work_order_id integer not null references communications_work_orders(id) on delete restrict,
      contact_id integer references contacts(id) on delete set null,
      agent_task_id integer references agent_tasks(id) on delete set null,
      classification text not null,
      classification_confidence_bps integer not null,
      classification_evidence jsonb not null default '{}'::jsonb,
      moderation_status text not null default 'normal',
      lead_status text not null default 'not_applicable',
      reply_policy_status text not null default 'fact_pack_required',
      verification_evidence jsonb not null default '{}'::jsonb,
      received_at timestamptz not null,
      created_at timestamptz not null default now(),
      constraint social_inbox_events_provider_check check (
        provider in ('meta', 'google', 'tiktok', 'linkedin', 'x', 'manual')
      ),
      constraint social_inbox_events_platform_check check (
        platform in ('facebook', 'instagram', 'youtube', 'tiktok', 'linkedin', 'x')
      ),
      constraint social_inbox_events_channel_check check (
        channel in (
          'facebook_comment', 'facebook_messenger',
          'instagram_comment', 'instagram_dm',
          'youtube_comment',
          'tiktok_comment', 'tiktok_dm',
          'linkedin_comment', 'linkedin_dm',
          'x_reply', 'x_dm'
        )
      ),
      constraint social_inbox_events_event_type_check check (
        event_type in ('comment', 'direct_message', 'mention', 'reply')
      ),
      constraint social_inbox_events_classification_check check (
        classification in (
          'interest', 'purchase_request', 'wholesale_request', 'partnership',
          'producer_application', 'creator_application', 'delivery_question',
          'complaint', 'misinformation', 'spam', 'abuse', 'sensitive_issue',
          'press_request'
        )
      ),
      constraint social_inbox_events_confidence_check check (
        classification_confidence_bps between 0 and 10000
      ),
      constraint social_inbox_events_moderation_check check (
        moderation_status in ('normal', 'complaint', 'misinformation', 'spam', 'abuse', 'sensitive')
      ),
      constraint social_inbox_events_lead_status_check check (
        lead_status in ('not_applicable', 'created', 'matched', 'review_required')
      ),
      constraint social_inbox_events_reply_policy_check check (
        reply_policy_status in ('fact_pack_required', 'approval_required', 'human_only', 'adapter_unavailable')
      ),
      constraint social_inbox_events_verification_check check (
        verification_evidence @> '{"verified": true}'::jsonb
      ),
      unique (tenant_id, provider, provider_event_id)
    );
  `);
  await db.execute(sql`
    create index if not exists social_inbox_events_tenant_received_idx
      on social_inbox_events(tenant_id, received_at desc);
  `);
  await db.execute(sql`
    create index if not exists social_inbox_events_thread_idx
      on social_inbox_events(thread_id, received_at desc);
  `);
  await db.execute(sql`
    create index if not exists social_inbox_events_classification_idx
      on social_inbox_events(tenant_id, classification, received_at desc);
  `);

  await db.execute(sql`
    create table if not exists social_inbox_event_audit (
      id serial primary key,
      tenant_id integer not null references tenants(id) on delete cascade,
      social_inbox_event_id uuid not null references social_inbox_events(id) on delete cascade,
      event_type text not null,
      actor_user_id integer,
      payload jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`
    create index if not exists social_inbox_event_audit_event_created_idx
      on social_inbox_event_audit(tenant_id, social_inbox_event_id, created_at desc);
  `);

  await db.execute(sql`
    create table if not exists meta_social_webhook_receipts (
      id uuid primary key default gen_random_uuid(),
      receipt_key text not null,
      payload_checksum text not null,
      object_type text not null,
      platform text,
      external_account_id text,
      provider_event_id text,
      event_kind text not null,
      parse_status text not null,
      resolution_status text not null default 'received',
      reason_code text,
      tenant_id integer references tenants(id) on delete set null,
      target_id integer references social_publication_targets(id) on delete set null,
      sanitized_payload jsonb not null default '{}'::jsonb,
      verification_evidence jsonb not null default '{}'::jsonb,
      delivery_count integer not null default 1,
      attempt_count integer not null default 0,
      last_error_code text,
      last_error_message text,
      received_at timestamptz not null,
      last_received_at timestamptz not null default now(),
      retention_until timestamptz not null,
      resolved_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint meta_social_webhook_receipts_key_format_check check (
        receipt_key ~ '^[0-9a-f]{64}$'
      ),
      constraint meta_social_webhook_receipts_checksum_format_check check (
        payload_checksum ~ '^[0-9a-f]{64}$'
      ),
      constraint meta_social_webhook_receipts_object_check check (
        object_type in ('page', 'instagram', 'unknown')
      ),
      constraint meta_social_webhook_receipts_platform_check check (
        platform is null or platform in ('facebook', 'instagram')
      ),
      constraint meta_social_webhook_receipts_parse_check check (
        parse_status in ('parsed', 'unsupported')
      ),
      constraint meta_social_webhook_receipts_resolution_check check (
        resolution_status in (
          'received', 'unmatched_target', 'ambiguous_target', 'ineligible_target',
          'unsupported_payload', 'ignored_outbound', 'ingested',
          'ingestion_failed', 'dead_letter'
        )
      ),
      constraint meta_social_webhook_receipts_count_check check (
        delivery_count >= 1 and attempt_count >= 0
      ),
      constraint meta_social_webhook_receipts_verification_check check (
        verification_evidence @> '{"verified": true, "credentialsExcluded": true}'::jsonb
      ),
      constraint meta_social_webhook_receipts_ingested_binding_check check (
        resolution_status <> 'ingested'
        or (tenant_id is not null and target_id is not null and resolved_at is not null)
      )
    );
  `);
  await db.execute(sql`
    create unique index if not exists meta_social_webhook_receipts_key_unique
      on meta_social_webhook_receipts(receipt_key);
    create index if not exists meta_social_webhook_receipts_resolution_idx
      on meta_social_webhook_receipts(resolution_status, created_at desc);
    create index if not exists meta_social_webhook_receipts_account_idx
      on meta_social_webhook_receipts(platform, external_account_id, resolution_status);
    create index if not exists meta_social_webhook_receipts_tenant_target_idx
      on meta_social_webhook_receipts(tenant_id, target_id, created_at desc);
    create index if not exists meta_social_webhook_receipts_checksum_idx
      on meta_social_webhook_receipts(payload_checksum);
  `);

  await ensureAdvertisingGovernanceTables();
  await ensureMediaStudioTables();
}
