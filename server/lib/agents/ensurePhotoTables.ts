import { db } from "@db";
import { sql } from "drizzle-orm";

export async function ensureAgentPhotoColumns() {
  // Agents table columns (must exist before any agent queries run)
  await db.execute(sql`alter table agents add column if not exists photo_asset_id uuid;`);
  await db.execute(sql`alter table agents add column if not exists photo_prompt text;`);
  await db.execute(sql`alter table agents add column if not exists photo_locked boolean not null default false;`);
  await db.execute(sql`alter table agents add column if not exists photo_updated_at timestamp;`);
  await db.execute(sql`alter table agents add column if not exists photo_updated_by text;`);
}

export async function ensureAgentPhotoTables() {
  await ensureAgentPhotoColumns();

  // Generation history table (variants + audit). Safe to run after image tables exist.
  await db.execute(sql`
    create table if not exists agent_photo_generations (
      id uuid primary key default gen_random_uuid(),
      tenant_id integer not null references tenants(id) on delete cascade,
      agent_id integer not null references agents(id) on delete cascade,
      prompt text not null,
      asset_id uuid references image_assets(id) on delete set null,
      image_id uuid references generated_images(id) on delete set null,
      status text not null default 'queued',
      provider text not null default 'replicate',
      error text,
      created_by text,
      created_at timestamptz not null default now()
    );
  `);

  await db.execute(sql`
    create index if not exists agent_photo_generations_lookup
      on agent_photo_generations (tenant_id, agent_id, created_at desc);
  `);
}
