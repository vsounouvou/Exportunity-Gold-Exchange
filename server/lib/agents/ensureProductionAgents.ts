import { db } from "@db";
import { sql } from "drizzle-orm";

export async function ensureAgentsProductionTables() {
  await db.execute(sql`
    create table if not exists agents_production (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      agent_id int references agents(id) on delete cascade,
      agent_key text not null,
      display_name text,
      is_enabled boolean not null default true,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);

  await db.execute(sql`
    create unique index if not exists agents_production_tenant_key_idx
      on agents_production (tenant_id, agent_key);
  `);

  await db.execute(sql`
    create unique index if not exists agents_production_tenant_agent_id_idx
      on agents_production (tenant_id, agent_id);
  `);

  await db.execute(sql`
    create index if not exists agents_production_tenant_created_idx
      on agents_production (tenant_id, created_at desc);
  `);

  await db.execute(sql`
    create index if not exists agents_production_tenant_enabled_idx
      on agents_production (tenant_id, is_enabled, updated_at desc);
  `);
}

