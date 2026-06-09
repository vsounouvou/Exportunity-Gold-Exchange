import { db } from "@db";
import { sql } from "drizzle-orm";

let ensured = false;
let vectorEnabled = true;

export function isMindbaseVectorEnabled() {
  return vectorEnabled;
}

export async function ensureMindbaseTables() {
  if (ensured) return;

  try {
    await db.execute(sql`create extension if not exists vector;`);
    vectorEnabled = true;
  } catch (error: any) {
    const message = String(error?.message || "").toLowerCase();
    if (
      message.includes('extension "vector" is not available') ||
      message.includes("could not open extension control file") ||
      message.includes('type "vector" does not exist')
    ) {
      vectorEnabled = false;
    } else {
      throw error;
    }
  }

  await db.execute(sql`
    do $$
    begin
      if not exists (select 1 from pg_type where typname = 'creator_verification_status') then
        create type creator_verification_status as enum ('unverified','pending','verified');
      end if;
      if not exists (select 1 from pg_type where typname = 'intellect_access_policy') then
        create type intellect_access_policy as enum ('private','public','paid');
      end if;
      if not exists (select 1 from pg_type where typname = 'intellect_publish_status') then
        create type intellect_publish_status as enum ('draft','pending','approved','rejected');
      end if;
      if not exists (select 1 from pg_type where typname = 'intellect_knowledge_scope') then
        create type intellect_knowledge_scope as enum ('private','public','monetized');
      end if;
      if not exists (select 1 from pg_type where typname = 'intellect_knowledge_file_status') then
        create type intellect_knowledge_file_status as enum ('uploaded','processed','failed');
      end if;
      if not exists (select 1 from pg_type where typname = 'intellect_conversation_channel') then
        create type intellect_conversation_channel as enum ('web','whatsapp','telegram');
      end if;
      if exists (select 1 from pg_type where typname = 'intellect_conversation_channel') then
        alter type intellect_conversation_channel add value if not exists 'email';
        alter type intellect_conversation_channel add value if not exists 'api';
      end if;
      if not exists (select 1 from pg_type where typname = 'intellect_message_sender') then
        create type intellect_message_sender as enum ('user','assistant','system');
      end if;
      if not exists (select 1 from pg_type where typname = 'mindbase_user_role') then
        create type mindbase_user_role as enum ('admin','creator','client');
      end if;
      if not exists (select 1 from pg_type where typname = 'mindbase_workspace_member_role') then
        create type mindbase_workspace_member_role as enum ('owner','admin','member');
      end if;
      if not exists (select 1 from pg_type where typname = 'mindbase_email_direction') then
        create type mindbase_email_direction as enum ('inbound','outbound');
      end if;
      if not exists (select 1 from pg_type where typname = 'mindbase_organization_status') then
        create type mindbase_organization_status as enum ('draft','onboarding','active','paused','archived');
      end if;
      if exists (select 1 from pg_type where typname = 'mindbase_organization_status') then
        alter type mindbase_organization_status add value if not exists 'draft';
      end if;
      if not exists (select 1 from pg_type where typname = 'mindbase_organization_plan') then
        create type mindbase_organization_plan as enum ('starter','growth','enterprise');
      end if;
      if not exists (select 1 from pg_type where typname = 'mindbase_organization_user_role') then
        create type mindbase_organization_user_role as enum ('owner','admin','manager','member','agent');
      end if;
      if not exists (select 1 from pg_type where typname = 'mindbase_tenant_platform_status') then
        create type mindbase_tenant_platform_status as enum ('active','sandbox','disconnected');
      end if;
      if not exists (select 1 from pg_type where typname = 'mindbase_org_channel_type') then
        create type mindbase_org_channel_type as enum ('whatsapp','sms','voice','webchat','facebook_messenger','instagram_dm');
      end if;
      if not exists (select 1 from pg_type where typname = 'mindbase_widget_visibility') then
        create type mindbase_widget_visibility as enum ('visible','hidden');
      end if;
      if not exists (select 1 from pg_type where typname = 'intelligence_asset_type') then
        create type intelligence_asset_type as enum ('agent','knowledge','automation');
      end if;
    end
    $$;
  `);

  await db.execute(sql`
    create table if not exists creator_profiles (
      id uuid primary key default gen_random_uuid(),
      tenant_id integer not null references tenants(id) on delete cascade,
      user_id integer not null references ece_users(id) on delete cascade,
      display_name text not null,
      headline text,
      bio text,
      avatar_url text,
      location text,
      share_slug text not null,
      verification_status creator_verification_status not null default 'unverified',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`create unique index if not exists creator_profiles_tenant_user_unique on creator_profiles(tenant_id, user_id);`);
  await db.execute(sql`create unique index if not exists creator_profiles_tenant_slug_unique on creator_profiles(tenant_id, share_slug);`);

  await db.execute(sql`
    create table if not exists mindbase_mindbases (
      id uuid primary key default gen_random_uuid(),
      tenant_id integer not null references tenants(id) on delete cascade,
      owner_user_id integer not null references ece_users(id) on delete cascade,
      slug text not null,
      title text not null,
      tagline text,
      description text,
      is_published boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`
    create unique index if not exists mindbase_mindbases_tenant_slug_unique
    on mindbase_mindbases(tenant_id, slug);
  `);
  await db.execute(sql`
    create unique index if not exists mindbase_mindbases_tenant_owner_unique
    on mindbase_mindbases(tenant_id, owner_user_id);
  `);

  await db.execute(sql`
    create table if not exists mindbase_profile_drafts (
      id uuid primary key default gen_random_uuid(),
      tenant_id integer not null references tenants(id) on delete cascade,
      user_id integer not null references ece_users(id) on delete cascade,
      conversation_id text not null,
      message_count integer not null default 0,
      messages_json jsonb not null default '[]'::jsonb,
      extracted_json jsonb not null default '{}'::jsonb,
      status text not null default 'draft',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`
    create unique index if not exists mindbase_profile_drafts_tenant_user_conversation_unique
    on mindbase_profile_drafts(tenant_id, user_id, conversation_id);
  `);
  await db.execute(sql`
    create index if not exists mindbase_profile_drafts_tenant_user_updated_idx
    on mindbase_profile_drafts(tenant_id, user_id, updated_at);
  `);

  await db.execute(sql`
    create table if not exists intellects (
      id uuid primary key default gen_random_uuid(),
      tenant_id integer not null references tenants(id) on delete cascade,
      owner_user_id integer not null references ece_users(id) on delete cascade,
      agent_id integer,
      name text not null,
      slug text not null,
      tagline text,
      description text,
      category text not null default 'general',
      tags text[] not null default '{}',
      persona_role text,
      persona_tone text,
      persona_rules jsonb not null default '[]'::jsonb,
      style_constraints jsonb not null default '[]'::jsonb,
      system_prompt text,
      access_policy intellect_access_policy not null default 'private',
      price_per_100_messages integer not null default 0,
      is_published boolean not null default false,
      publish_status intellect_publish_status not null default 'draft',
      usage_count integer not null default 0,
      agent_email text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`alter table intellects add column if not exists agent_email text;`);
  await db.execute(sql`create unique index if not exists intellects_tenant_slug_unique on intellects(tenant_id, slug);`);
  await db.execute(sql`create unique index if not exists intellects_agent_email_unique on intellects(agent_email);`);
  await db.execute(sql`create index if not exists intellects_tenant_owner_idx on intellects(tenant_id, owner_user_id);`);
  await db.execute(sql`create index if not exists intellects_tenant_publish_idx on intellects(tenant_id, is_published, publish_status);`);

  await db.execute(sql`
    create table if not exists intellect_knowledge_files (
      id uuid primary key default gen_random_uuid(),
      tenant_id integer not null references tenants(id) on delete cascade,
      intellect_id uuid not null references intellects(id) on delete cascade,
      scope intellect_knowledge_scope not null default 'private',
      filename text not null,
      mime text,
      storage_url text not null,
      extracted_text text,
      status intellect_knowledge_file_status not null default 'uploaded',
      error_message text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`create index if not exists intellect_knowledge_files_tenant_intellect_idx on intellect_knowledge_files(tenant_id, intellect_id);`);

  await db.execute(sql`
    create table if not exists intellect_knowledge_chunks (
      id uuid primary key default gen_random_uuid(),
      tenant_id integer not null references tenants(id) on delete cascade,
      intellect_id uuid not null references intellects(id) on delete cascade,
      file_id uuid not null references intellect_knowledge_files(id) on delete cascade,
      chunk_index integer not null default 0,
      source_filename text,
      chunk_text text not null,
      embedding jsonb,
      created_at timestamptz not null default now()
    );
  `);
  if (vectorEnabled) {
    await db.execute(sql`
      alter table intellect_knowledge_chunks
      add column if not exists embedding_vector vector(1536);
    `);
  } else {
    await db.execute(sql`
      alter table intellect_knowledge_chunks
      add column if not exists embedding_vector jsonb;
    `);
  }
  await db.execute(sql`create unique index if not exists intellect_knowledge_chunks_file_chunk_unique on intellect_knowledge_chunks(file_id, chunk_index);`);
  await db.execute(sql`create index if not exists intellect_knowledge_chunks_tenant_intellect_idx on intellect_knowledge_chunks(tenant_id, intellect_id);`);
  if (vectorEnabled) {
    await db.execute(sql`
      create index if not exists intellect_knowledge_chunks_embedding_vector_idx
      on intellect_knowledge_chunks using ivfflat (embedding_vector vector_cosine_ops) with (lists = 100);
    `);
  }

  try {
    const columnTypeResult = await db.execute(sql`
      select udt_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'intellect_knowledge_chunks'
        and column_name = 'embedding_vector'
      limit 1
    `);
    const rows = Array.isArray((columnTypeResult as any)?.rows)
      ? ((columnTypeResult as any).rows as Array<{ udt_name?: string | null }>)
      : [];
    const udtName = String(rows[0]?.udt_name || "").toLowerCase();
    vectorEnabled = vectorEnabled && udtName === "vector";
  } catch {
    vectorEnabled = false;
  }

  await db.execute(sql`
    create table if not exists mindbase_user_roles (
      id uuid primary key default gen_random_uuid(),
      tenant_id integer not null references tenants(id) on delete cascade,
      user_id integer not null references ece_users(id) on delete cascade,
      role mindbase_user_role not null default 'client',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`
    create unique index if not exists mindbase_user_roles_tenant_user_role_unique
    on mindbase_user_roles(tenant_id, user_id, role);
  `);
  await db.execute(sql`
    create index if not exists mindbase_user_roles_tenant_user_idx
    on mindbase_user_roles(tenant_id, user_id);
  `);

  await db.execute(sql`
    create table if not exists mindbase_workspaces (
      id uuid primary key default gen_random_uuid(),
      tenant_id integer not null references tenants(id) on delete cascade,
      owner_user_id integer not null references ece_users(id) on delete cascade,
      name text not null,
      description text,
      status text not null default 'draft',
      company_brain_progress integer not null default 0,
      persona_readiness integer not null default 0,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`alter table mindbase_workspaces add column if not exists status text not null default 'draft';`);
  await db.execute(sql`alter table mindbase_workspaces add column if not exists company_brain_progress integer not null default 0;`);
  await db.execute(sql`alter table mindbase_workspaces add column if not exists persona_readiness integer not null default 0;`);
  await db.execute(sql`create index if not exists mindbase_workspaces_tenant_owner_idx on mindbase_workspaces(tenant_id, owner_user_id);`);
  await db.execute(sql`create index if not exists mindbase_workspaces_tenant_name_idx on mindbase_workspaces(tenant_id, name);`);

  await db.execute(sql`
    create table if not exists mindbase_workspace_members (
      id uuid primary key default gen_random_uuid(),
      tenant_id integer not null references tenants(id) on delete cascade,
      workspace_id uuid not null references mindbase_workspaces(id) on delete cascade,
      user_id integer not null references ece_users(id) on delete cascade,
      role mindbase_workspace_member_role not null default 'member',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`
    create unique index if not exists mindbase_workspace_members_workspace_user_unique
    on mindbase_workspace_members(workspace_id, user_id);
  `);
  await db.execute(sql`
    create index if not exists mindbase_workspace_members_tenant_user_idx
    on mindbase_workspace_members(tenant_id, user_id);
  `);

  await db.execute(sql`
    create table if not exists mindbase_workspace_agents (
      id uuid primary key default gen_random_uuid(),
      tenant_id integer not null references tenants(id) on delete cascade,
      workspace_id uuid not null references mindbase_workspaces(id) on delete cascade,
      intellect_id uuid not null references intellects(id) on delete cascade,
      status text not null default 'draft',
      required_integrations jsonb not null default '[]'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`alter table mindbase_workspace_agents add column if not exists status text not null default 'draft';`);
  await db.execute(sql`alter table mindbase_workspace_agents add column if not exists required_integrations jsonb not null default '[]'::jsonb;`);
  await db.execute(sql`alter table mindbase_workspace_agents add column if not exists updated_at timestamptz not null default now();`);
  await db.execute(sql`
    create unique index if not exists mindbase_workspace_agents_workspace_intellect_unique
    on mindbase_workspace_agents(workspace_id, intellect_id);
  `);
  await db.execute(sql`
    create index if not exists mindbase_workspace_agents_tenant_workspace_idx
    on mindbase_workspace_agents(tenant_id, workspace_id);
  `);

  await db.execute(sql`
    create table if not exists mindbase_organizations (
      id uuid primary key default gen_random_uuid(),
      tenant_id integer not null references tenants(id) on delete cascade,
      owner_user_id integer not null references ece_users(id) on delete cascade,
      name text not null,
      slug text not null,
      logo_url text,
      status mindbase_organization_status not null default 'onboarding',
      plan mindbase_organization_plan not null default 'starter',
      chairman_assistant_name text not null default 'Chairman Assistant',
      default_workspace_id uuid references mindbase_workspaces(id) on delete set null,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`
    create unique index if not exists mindbase_organizations_tenant_slug_unique
    on mindbase_organizations(tenant_id, slug);
  `);
  await db.execute(sql`
    create index if not exists mindbase_organizations_tenant_owner_idx
    on mindbase_organizations(tenant_id, owner_user_id);
  `);
  await db.execute(sql`
    create index if not exists mindbase_organizations_tenant_status_idx
    on mindbase_organizations(tenant_id, status, updated_at desc);
  `);

  await db.execute(sql`
    create table if not exists mindbase_organization_users (
      id uuid primary key default gen_random_uuid(),
      tenant_id integer not null references tenants(id) on delete cascade,
      organization_id uuid not null references mindbase_organizations(id) on delete cascade,
      user_id integer not null references ece_users(id) on delete cascade,
      role mindbase_organization_user_role not null default 'member',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`
    create unique index if not exists mindbase_org_users_org_user_unique
    on mindbase_organization_users(organization_id, user_id);
  `);
  await db.execute(sql`
    create index if not exists mindbase_org_users_tenant_user_idx
    on mindbase_organization_users(tenant_id, user_id, updated_at desc);
  `);

  await db.execute(sql`
    create table if not exists mindbase_tenant_platforms (
      id uuid primary key default gen_random_uuid(),
      tenant_id integer not null references tenants(id) on delete cascade,
      platform_tenant_id integer not null references tenants(id) on delete cascade,
      slug text not null,
      name text not null,
      base_url text,
      api_key text,
      status mindbase_tenant_platform_status not null default 'active',
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`
    create unique index if not exists mindbase_tenant_platforms_unique_idx
    on mindbase_tenant_platforms(tenant_id, platform_tenant_id);
  `);
  await db.execute(sql`
    create unique index if not exists mindbase_tenant_platforms_slug_unique
    on mindbase_tenant_platforms(tenant_id, slug);
  `);

  await db.execute(sql`
    create table if not exists mindbase_organization_platforms (
      id uuid primary key default gen_random_uuid(),
      tenant_id integer not null references tenants(id) on delete cascade,
      organization_id uuid not null references mindbase_organizations(id) on delete cascade,
      tenant_platform_id uuid not null references mindbase_tenant_platforms(id) on delete cascade,
      is_primary boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`
    create unique index if not exists mindbase_org_platforms_org_platform_unique
    on mindbase_organization_platforms(organization_id, tenant_platform_id);
  `);
  await db.execute(sql`
    create index if not exists mindbase_org_platforms_tenant_org_idx
    on mindbase_organization_platforms(tenant_id, organization_id, updated_at desc);
  `);

  await db.execute(sql`
    create table if not exists mindbase_org_channels (
      id uuid primary key default gen_random_uuid(),
      tenant_id integer not null references tenants(id) on delete cascade,
      organization_id uuid not null references mindbase_organizations(id) on delete cascade,
      channel_type mindbase_org_channel_type not null,
      twilio_account_sid text,
      phone_number text,
      status text not null default 'disconnected',
      auto_reply_enabled boolean not null default false,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`
    create unique index if not exists mindbase_org_channels_unique_idx
    on mindbase_org_channels(organization_id, channel_type, phone_number);
  `);
  await db.execute(sql`
    create index if not exists mindbase_org_channels_tenant_org_idx
    on mindbase_org_channels(tenant_id, organization_id, updated_at desc);
  `);

  await db.execute(sql`
    create table if not exists mindbase_org_wallets (
      id uuid primary key default gen_random_uuid(),
      tenant_id integer not null references tenants(id) on delete cascade,
      organization_id uuid not null references mindbase_organizations(id) on delete cascade,
      balance numeric(18,2) not null default 0,
      currency text not null default 'USD',
      flutterwave_account_id text,
      status text not null default 'active',
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`
    create unique index if not exists mindbase_org_wallets_org_unique
    on mindbase_org_wallets(organization_id);
  `);
  await db.execute(sql`
    create index if not exists mindbase_org_wallets_tenant_org_idx
    on mindbase_org_wallets(tenant_id, organization_id, updated_at desc);
  `);

  await db.execute(sql`
    create table if not exists intelligence_assets (
      id uuid primary key default gen_random_uuid(),
      type intelligence_asset_type not null,
      name text not null,
      description text,
      category text not null,
      tags text[] not null default '{}',
      creator_user_id integer references ece_users(id) on delete set null,
      price numeric(12,2) not null default 0,
      rating numeric(3,2) not null default 0,
      install_count integer not null default 0,
      visibility text not null default 'public',
      created_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`
    create unique index if not exists intelligence_assets_type_name_unique
    on intelligence_assets(type, name);
  `);
  await db.execute(sql`
    create index if not exists intelligence_assets_category_created_idx
    on intelligence_assets(category, created_at desc);
  `);
  await db.execute(sql`
    create index if not exists intelligence_assets_visibility_installs_idx
    on intelligence_assets(visibility, install_count desc);
  `);

  await db.execute(sql`
    create table if not exists organization_assets (
      id uuid primary key default gen_random_uuid(),
      org_id uuid not null references mindbase_organizations(id) on delete cascade,
      asset_id uuid not null references intelligence_assets(id) on delete cascade,
      installed_by integer references ece_users(id) on delete set null,
      installed_at timestamptz not null default now(),
      status text not null default 'installed'
    );
  `);
  await db.execute(sql`
    create unique index if not exists organization_assets_org_asset_unique
    on organization_assets(org_id, asset_id);
  `);
  await db.execute(sql`
    create index if not exists organization_assets_org_installed_idx
    on organization_assets(org_id, installed_at desc);
  `);
  await db.execute(sql`
    create index if not exists organization_assets_asset_installed_idx
    on organization_assets(asset_id, installed_at desc);
  `);

  await db.execute(sql`
    create table if not exists mindbase_widget_registry (
      id uuid primary key default gen_random_uuid(),
      type text not null,
      component_key text not null,
      schema jsonb not null default '{}'::jsonb,
      version integer not null default 1,
      feature_flags jsonb not null default '[]'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`
    create unique index if not exists mindbase_widget_registry_type_unique
    on mindbase_widget_registry(type);
  `);

  await db.execute(sql`
    create table if not exists mindbase_org_widgets (
      id uuid primary key default gen_random_uuid(),
      tenant_id integer not null references tenants(id) on delete cascade,
      organization_id uuid not null references mindbase_organizations(id) on delete cascade,
      widget_type text not null,
      config_json jsonb not null default '{}'::jsonb,
      widget_permissions jsonb not null default '[]'::jsonb,
      layout_zone text not null default 'center',
      order_index integer not null default 0,
      visibility mindbase_widget_visibility not null default 'visible',
      widget_state jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`
    create unique index if not exists mindbase_org_widgets_org_widget_zone_unique
    on mindbase_org_widgets(organization_id, widget_type, layout_zone, order_index);
  `);
  await db.execute(sql`
    create index if not exists mindbase_org_widgets_tenant_org_idx
    on mindbase_org_widgets(tenant_id, organization_id, updated_at desc);
  `);

  await db.execute(sql`
    create table if not exists mindbase_events (
      id uuid primary key default gen_random_uuid(),
      tenant_id integer not null references tenants(id) on delete cascade,
      organization_id uuid not null references mindbase_organizations(id) on delete cascade,
      workspace_id uuid references mindbase_workspaces(id) on delete set null,
      actor_user_id integer references ece_users(id) on delete set null,
      event_type text not null,
      status text not null default 'pending',
      payload jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`
    create index if not exists mindbase_events_org_created_idx
    on mindbase_events(organization_id, created_at desc);
  `);
  await db.execute(sql`
    create index if not exists mindbase_events_tenant_event_idx
    on mindbase_events(tenant_id, event_type, created_at desc);
  `);

  await db.execute(sql`
    create table if not exists mindbase_payment_events (
      id uuid primary key default gen_random_uuid(),
      tenant_id integer not null references tenants(id) on delete cascade,
      payment_id uuid,
      organization_id uuid,
      provider text not null,
      provider_event_id text not null,
      status text not null default 'received',
      raw_payload jsonb not null default '{}'::jsonb,
      processed_at timestamptz,
      processing_error text,
      created_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`
    create unique index if not exists mindbase_payment_events_provider_event_unique
    on mindbase_payment_events(tenant_id, provider, provider_event_id);
  `);
  await db.execute(sql`
    create index if not exists mindbase_payment_events_payment_idx
    on mindbase_payment_events(payment_id, created_at desc);
  `);

  await db.execute(sql`
    create table if not exists mindbase_dashboard_summaries (
      id uuid primary key default gen_random_uuid(),
      tenant_id integer not null references tenants(id) on delete cascade,
      organization_id uuid not null references mindbase_organizations(id) on delete cascade,
      summary_json jsonb not null default '{}'::jsonb,
      live_json jsonb not null default '[]'::jsonb,
      cached_at timestamptz not null default now(),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`
    create unique index if not exists mindbase_dashboard_summaries_org_unique
    on mindbase_dashboard_summaries(organization_id);
  `);
  await db.execute(sql`
    create index if not exists mindbase_dashboard_summaries_tenant_cached_idx
    on mindbase_dashboard_summaries(tenant_id, cached_at desc);
  `);

  await db.execute(sql`
    create table if not exists mindbase_brain_events (
      id uuid primary key default gen_random_uuid(),
      tenant_id integer not null references tenants(id) on delete cascade,
      organization_id uuid not null references mindbase_organizations(id) on delete cascade,
      event_type text not null,
      entity_type text,
      entity_id text,
      payload jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`
    create index if not exists mindbase_brain_events_org_created_idx
    on mindbase_brain_events(organization_id, created_at desc);
  `);
  await db.execute(sql`
    create index if not exists mindbase_brain_events_tenant_event_idx
    on mindbase_brain_events(tenant_id, event_type, created_at desc);
  `);

  await db.execute(sql`
    create table if not exists mindbase_brain_insights (
      id uuid primary key default gen_random_uuid(),
      tenant_id integer not null references tenants(id) on delete cascade,
      organization_id uuid not null references mindbase_organizations(id) on delete cascade,
      source_event_id uuid references mindbase_brain_events(id) on delete set null,
      insight_type text not null,
      confidence_score numeric(5,2) default 0,
      generated_by_agent text,
      content text not null,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`
    create index if not exists mindbase_brain_insights_org_idx
    on mindbase_brain_insights(organization_id, created_at desc);
  `);
  await db.execute(sql`
    create index if not exists mindbase_brain_insights_source_idx
    on mindbase_brain_insights(source_event_id, created_at desc);
  `);

  await db.execute(sql`
    insert into mindbase_widget_registry (type, component_key, schema, version, feature_flags)
    values
      ('operations_summary', 'OperationsSummaryWidget', '{"title":"Operations summary"}'::jsonb, 1, '[]'::jsonb),
      ('inbox', 'InboxWidget', '{"title":"Inbox"}'::jsonb, 1, '[]'::jsonb),
      ('agenda', 'AgendaWidget', '{"title":"Agenda"}'::jsonb, 1, '[]'::jsonb),
      ('tasks', 'TasksWidget', '{"title":"Tasks"}'::jsonb, 1, '[]'::jsonb),
      ('objectives', 'ObjectivesWidget', '{"title":"Objectives"}'::jsonb, 1, '[]'::jsonb),
      ('live_activity', 'LiveActivityWidget', '{"title":"Live activity"}'::jsonb, 1, '[]'::jsonb),
      ('wallet_summary', 'WalletSummaryWidget', '{"title":"Wallet"}'::jsonb, 1, '[]'::jsonb),
      ('agent_activity', 'AgentActivityWidget', '{"title":"Agent activity"}'::jsonb, 1, '[]'::jsonb),
      ('knowledge', 'KnowledgeWidget', '{"title":"Knowledge"}'::jsonb, 1, '[]'::jsonb),
      ('marketplace', 'MarketplaceWidget', '{"title":"Marketplace"}'::jsonb, 1, '[]'::jsonb)
    on conflict (type) do nothing;
  `);

  await db.execute(sql`
    create table if not exists intellect_conversations (
      id uuid primary key default gen_random_uuid(),
      tenant_id integer not null references tenants(id) on delete cascade,
      channel intellect_conversation_channel not null default 'web',
      external_thread_id text,
      user_id integer references ece_users(id) on delete set null,
      workspace_id uuid references mindbase_workspaces(id) on delete set null,
      intellect_id uuid not null references intellects(id) on delete cascade,
      title text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      archived_at timestamptz
    );
  `);
  await db.execute(sql`alter table intellect_conversations add column if not exists workspace_id uuid;`);
  await db.execute(sql`alter table intellect_conversations add column if not exists title text;`);
  await db.execute(sql`alter table intellect_conversations add column if not exists updated_at timestamptz not null default now();`);
  await db.execute(sql`alter table intellect_conversations add column if not exists archived_at timestamptz;`);
  await db.execute(sql`create index if not exists intellect_conversations_tenant_user_idx on intellect_conversations(tenant_id, user_id);`);
  await db.execute(sql`create index if not exists intellect_conversations_workspace_idx on intellect_conversations(workspace_id);`);

  await db.execute(sql`
    create table if not exists intellect_messages (
      id uuid primary key default gen_random_uuid(),
      conversation_id uuid not null references intellect_conversations(id) on delete cascade,
      sender_type intellect_message_sender not null,
      sender_user_id integer references ece_users(id) on delete set null,
      content text not null,
      citations jsonb,
      created_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`create index if not exists intellect_messages_conversation_created_idx on intellect_messages(conversation_id, created_at);`);

  await db.execute(sql`
    create table if not exists mindbase_usage_events (
      id uuid primary key default gen_random_uuid(),
      tenant_id integer not null references tenants(id) on delete cascade,
      user_id integer references ece_users(id) on delete set null,
      intellect_id uuid not null references intellects(id) on delete cascade,
      conversation_id uuid references intellect_conversations(id) on delete set null,
      event_type text not null,
      amount_int integer not null default 0,
      amount_usd numeric(14,2),
      request_correlation_id text,
      metadata jsonb,
      created_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`alter table mindbase_usage_events add column if not exists conversation_id uuid;`);
  await db.execute(sql`alter table mindbase_usage_events add column if not exists amount_usd numeric(14,2);`);
  await db.execute(sql`alter table mindbase_usage_events add column if not exists request_correlation_id text;`);
  await db.execute(sql`alter table mindbase_usage_events add column if not exists metadata jsonb;`);
  await db.execute(sql`
    create unique index if not exists mindbase_usage_events_unique_correlation_idx
    on mindbase_usage_events(tenant_id, user_id, intellect_id, request_correlation_id)
    where request_correlation_id is not null;
  `);

  await db.execute(sql`
    create table if not exists mindbase_api_keys (
      id uuid primary key default gen_random_uuid(),
      tenant_id integer not null references tenants(id) on delete cascade,
      workspace_id uuid not null references mindbase_workspaces(id) on delete cascade,
      key_hash text not null,
      label text,
      created_by_user_id integer references ece_users(id) on delete set null,
      created_at timestamptz not null default now(),
      revoked_at timestamptz
    );
  `);
  await db.execute(sql`create unique index if not exists mindbase_api_keys_key_hash_unique on mindbase_api_keys(key_hash);`);
  await db.execute(sql`create index if not exists mindbase_api_keys_tenant_workspace_idx on mindbase_api_keys(tenant_id, workspace_id);`);

  await db.execute(sql`
    create table if not exists mindbase_email_threads (
      id uuid primary key default gen_random_uuid(),
      tenant_id integer not null references tenants(id) on delete cascade,
      intellect_id uuid not null references intellects(id) on delete cascade,
      from_email text not null,
      to_email text not null,
      subject text,
      created_at timestamptz not null default now(),
      last_message_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`
    create index if not exists mindbase_email_threads_intellect_last_message_idx
    on mindbase_email_threads(intellect_id, last_message_at desc);
  `);
  await db.execute(sql`
    create index if not exists mindbase_email_threads_tenant_created_idx
    on mindbase_email_threads(tenant_id, created_at desc);
  `);

  await db.execute(sql`
    create table if not exists mindbase_email_messages (
      id uuid primary key default gen_random_uuid(),
      tenant_id integer not null references tenants(id) on delete cascade,
      thread_id uuid not null references mindbase_email_threads(id) on delete cascade,
      direction mindbase_email_direction not null default 'inbound',
      from_email text,
      to_email text,
      message_id text,
      raw_text text,
      parsed_text text,
      metadata jsonb,
      created_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`
    create index if not exists mindbase_email_messages_thread_created_idx
    on mindbase_email_messages(thread_id, created_at);
  `);
  await db.execute(sql`
    create index if not exists mindbase_email_messages_tenant_created_idx
    on mindbase_email_messages(tenant_id, created_at desc);
  `);

  await db.execute(sql`
    create table if not exists mindbase_credits_ledger (
      id uuid primary key default gen_random_uuid(),
      tenant_id integer not null references tenants(id) on delete cascade,
      user_id integer not null references ece_users(id) on delete cascade,
      delta_int integer not null,
      reason text not null,
      metadata jsonb,
      request_correlation_id text,
      created_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`alter table mindbase_credits_ledger add column if not exists metadata jsonb;`);
  await db.execute(sql`alter table mindbase_credits_ledger add column if not exists request_correlation_id text;`);
  await db.execute(sql`
    create index if not exists mindbase_credits_ledger_tenant_user_created_idx
    on mindbase_credits_ledger(tenant_id, user_id, created_at desc);
  `);
  await db.execute(sql`
    create index if not exists mindbase_credits_ledger_correlation_idx
    on mindbase_credits_ledger(request_correlation_id);
  `);

  ensured = true;
}
