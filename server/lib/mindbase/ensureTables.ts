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
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);
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
      created_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`
    create unique index if not exists mindbase_workspace_agents_workspace_intellect_unique
    on mindbase_workspace_agents(workspace_id, intellect_id);
  `);
  await db.execute(sql`
    create index if not exists mindbase_workspace_agents_tenant_workspace_idx
    on mindbase_workspace_agents(tenant_id, workspace_id);
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
