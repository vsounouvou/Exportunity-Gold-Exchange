import { db } from "@db";
import { sql } from "drizzle-orm";

export async function ensureOpsCommsTables() {
  await db.execute(sql`
    create table if not exists comms_threads (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      type text not null,
      name text,
      related_entity_type text,
      related_entity_id text,
      visibility_policy text not null default 'TENANT_INTERNAL',
      created_by_agent_key text,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);

  await db.execute(sql`
    create index if not exists comms_threads_tenant_created_idx
      on comms_threads (tenant_id, created_at desc);
  `);

  await db.execute(sql`
    create index if not exists comms_threads_tenant_type_idx
      on comms_threads (tenant_id, type, created_at desc);
  `);

  await db.execute(sql`
    create table if not exists comms_participants (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      thread_id int not null references comms_threads(id) on delete cascade,
      agent_key text not null,
      role_in_thread text not null default 'MEMBER',
      created_at timestamptz not null default now()
    );
  `);

  await db.execute(sql`
    create unique index if not exists comms_participants_thread_agent_idx
      on comms_participants (thread_id, agent_key);
  `);

  await db.execute(sql`
    create index if not exists comms_participants_tenant_idx
      on comms_participants (tenant_id, created_at desc);
  `);

  await db.execute(sql`
    create index if not exists comms_participants_thread_idx
      on comms_participants (thread_id);
  `);

  await db.execute(sql`
    create table if not exists comms_messages (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      thread_id int not null references comms_threads(id) on delete cascade,
      sender_type text not null default 'AGENT',
      sender_agent_key text,
      message_type text not null default 'STATUS_UPDATE',
      content_text text,
      content_json jsonb not null default '{}'::jsonb,
      priority text not null default 'NORMAL',
      requires_ack boolean not null default false,
      ack_by_agent_keys jsonb not null default '[]'::jsonb,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
  `);

  await db.execute(sql`
    create index if not exists comms_messages_thread_created_idx
      on comms_messages (thread_id, created_at asc);
  `);

  await db.execute(sql`
    create index if not exists comms_messages_tenant_created_idx
      on comms_messages (tenant_id, created_at desc);
  `);

  await db.execute(sql`
    create index if not exists comms_messages_tenant_priority_idx
      on comms_messages (tenant_id, priority, created_at desc);
  `);
}

