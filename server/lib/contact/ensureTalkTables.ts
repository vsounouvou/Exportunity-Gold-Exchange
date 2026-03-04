import { sql } from "drizzle-orm";
import { db } from "@db";

let ready = false;
let inFlight: Promise<void> | null = null;

export async function ensureTalkTables() {
  if (ready) return;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    await db.execute(sql`create extension if not exists pgcrypto;`);

    await db.execute(sql`
      do $$
      begin
        if not exists (select 1 from pg_type where typname = 'chat_lead_status') then
          create type chat_lead_status as enum ('new', 'triaged', 'booked', 'closed');
        end if;
      end $$;
    `);

    await db.execute(sql`
      do $$
      begin
        if not exists (select 1 from pg_type where typname = 'chat_message_role') then
          create type chat_message_role as enum ('user', 'assistant', 'system');
        end if;
      end $$;
    `);

    await db.execute(sql`
      create table if not exists chat_leads (
        id uuid primary key default gen_random_uuid(),
        tenant_id integer not null references tenants(id) on delete cascade,
        intent text not null,
        name text,
        email text,
        phone text,
        country text,
        summary text,
        status chat_lead_status not null default 'new',
        source_url text,
        user_agent text,
        ip text,
        notify_status text not null default 'pending',
        notify_error text,
        notified_at timestamptz,
        metadata jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
    `);

    await db.execute(sql`
      create table if not exists chat_messages (
        id serial primary key,
        tenant_id integer not null references tenants(id) on delete cascade,
        lead_id uuid not null references chat_leads(id) on delete cascade,
        role chat_message_role not null,
        content text not null,
        metadata jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now()
      );
    `);

    await db.execute(sql`
      create table if not exists chat_events (
        id serial primary key,
        tenant_id integer not null references tenants(id) on delete cascade,
        lead_id uuid not null references chat_leads(id) on delete cascade,
        event_type text not null,
        payload jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now()
      );
    `);

    await db.execute(sql`create index if not exists chat_leads_tenant_created_idx on chat_leads(tenant_id, created_at);`);
    await db.execute(sql`create index if not exists chat_leads_tenant_status_idx on chat_leads(tenant_id, status, updated_at);`);
    await db.execute(sql`create index if not exists chat_messages_lead_created_idx on chat_messages(lead_id, created_at);`);
    await db.execute(sql`create index if not exists chat_messages_tenant_created_idx on chat_messages(tenant_id, created_at);`);
    await db.execute(sql`create index if not exists chat_events_lead_created_idx on chat_events(lead_id, created_at);`);
    await db.execute(sql`create index if not exists chat_events_tenant_created_idx on chat_events(tenant_id, created_at);`);

    ready = true;
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
}

