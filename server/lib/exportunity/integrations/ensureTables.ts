import { db } from "@db";
import { sql } from "drizzle-orm";

let ready: Promise<void> | null = null;

async function createTables() {
  await db.execute(sql`create extension if not exists pgcrypto`);
  await db.execute(sql`
    create table if not exists exportunity_integration_connections (
      id uuid primary key default gen_random_uuid(),
      tenant_id integer not null references tenants(id) on delete cascade,
      integration_id text not null,
      provider text not null,
      account_label text,
      status text not null default 'connected',
      scopes jsonb not null default '[]'::jsonb,
      token_ciphertext text not null,
      token_iv text not null,
      token_auth_tag text not null,
      token_meta jsonb not null default '{}'::jsonb,
      expires_at timestamptz,
      last_verified_at timestamptz,
      revoked_at timestamptz,
      connected_by_user_id integer references ece_users(id) on delete set null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint exportunity_integration_connections_status_check
        check (status in ('connected', 'reconnect_required', 'revoked', 'error'))
    )
  `);
  await db.execute(sql`
    create unique index if not exists exportunity_integration_connections_tenant_integration_unique
      on exportunity_integration_connections(tenant_id, integration_id)
  `);
  await db.execute(sql`
    create index if not exists exportunity_integration_connections_tenant_status_idx
      on exportunity_integration_connections(tenant_id, status, updated_at)
  `);
  await db.execute(sql`
    create table if not exists exportunity_integration_oauth_states (
      id uuid primary key default gen_random_uuid(),
      state_digest text not null,
      tenant_id integer not null references tenants(id) on delete cascade,
      actor_user_id integer references ece_users(id) on delete set null,
      integration_id text not null,
      provider text not null,
      return_to text not null default '/admin/exportunity/integrations',
      expires_at timestamptz not null,
      consumed_at timestamptz,
      created_at timestamptz not null default now()
    )
  `);
  await db.execute(sql`
    create unique index if not exists exportunity_integration_oauth_states_digest_unique
      on exportunity_integration_oauth_states(state_digest)
  `);
  await db.execute(sql`
    create index if not exists exportunity_integration_oauth_states_tenant_expiry_idx
      on exportunity_integration_oauth_states(tenant_id, expires_at)
  `);
  await db.execute(sql`
    create table if not exists exportunity_integration_audit_events (
      id uuid primary key default gen_random_uuid(),
      tenant_id integer not null references tenants(id) on delete cascade,
      connection_id uuid references exportunity_integration_connections(id) on delete set null,
      actor_user_id integer references ece_users(id) on delete set null,
      integration_id text not null,
      provider text not null,
      event_type text not null,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    )
  `);
  await db.execute(sql`
    create index if not exists exportunity_integration_audit_events_tenant_created_idx
      on exportunity_integration_audit_events(tenant_id, created_at)
  `);
  await db.execute(sql`
    create index if not exists exportunity_integration_audit_events_connection_idx
      on exportunity_integration_audit_events(connection_id, created_at)
  `);
}

export async function ensureExportunityIntegrationTables() {
  if (!ready) {
    ready = createTables().catch((error) => {
      ready = null;
      throw error;
    });
  }
  return ready;
}
