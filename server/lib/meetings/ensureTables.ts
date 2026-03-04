import { db } from "@db";
import { sql } from "drizzle-orm";

async function ensureMeetingCompatibilityColumns() {
  await db.execute(sql`
    create table if not exists meeting_rooms (
      id serial primary key,
      tenant_id integer references tenants(id) on delete cascade,
      name text not null,
      capacity integer not null default 20,
      capacity_humans integer,
      location text,
      location_label text,
      timezone text default 'UTC',
      is_virtual boolean not null default true,
      default_agents_json jsonb,
      features jsonb not null default '{}'::jsonb,
      is_available boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`alter table meeting_rooms add column if not exists tenant_id integer references tenants(id) on delete cascade;`);
  await db.execute(sql`alter table meeting_rooms add column if not exists capacity_humans integer;`);
  await db.execute(sql`alter table meeting_rooms add column if not exists location_label text;`);
  await db.execute(sql`alter table meeting_rooms add column if not exists timezone text default 'UTC';`);
  await db.execute(sql`alter table meeting_rooms add column if not exists is_virtual boolean not null default true;`);
  await db.execute(sql`alter table meeting_rooms add column if not exists default_agents_json jsonb;`);
  await db.execute(sql`alter table meeting_rooms add column if not exists features jsonb not null default '{}'::jsonb;`);
  await db.execute(sql`alter table meeting_rooms add column if not exists is_available boolean not null default true;`);
  await db.execute(sql`alter table meeting_rooms add column if not exists created_at timestamptz not null default now();`);
  await db.execute(sql`alter table meeting_rooms add column if not exists updated_at timestamptz not null default now();`);
  await db.execute(sql`update meeting_rooms set capacity_humans = coalesce(capacity_humans, capacity);`);
  await db.execute(sql`update meeting_rooms set timezone = coalesce(nullif(timezone, ''), 'UTC');`);
  await db.execute(sql`update meeting_rooms set is_virtual = coalesce(is_virtual, true);`);
  await db.execute(sql`update meeting_rooms set is_available = coalesce(is_available, true);`);
  await db.execute(sql`create index if not exists meeting_rooms_tenant_name_idx on meeting_rooms (tenant_id, name);`);

  await db.execute(sql`alter table meetings add column if not exists tenant_id integer references tenants(id) on delete cascade;`);
  await db.execute(sql`alter table meetings add column if not exists company_id integer references companies(id) on delete set null;`);
  await db.execute(sql`alter table meetings add column if not exists room_id integer references meeting_rooms(id) on delete set null;`);
  await db.execute(sql`alter table meetings add column if not exists meeting_type text default 'general';`);
  await db.execute(sql`alter table meetings add column if not exists actual_start_at timestamptz;`);
  await db.execute(sql`alter table meetings add column if not exists actual_end_at timestamptz;`);
  await db.execute(sql`alter table meetings add column if not exists summary_md text;`);
  await db.execute(sql`alter table meetings add column if not exists notes_md text;`);
  await db.execute(sql`alter table meetings add column if not exists metadata jsonb default '{}'::jsonb;`);
  await db.execute(sql`alter table meetings add column if not exists created_at timestamptz not null default now();`);
  await db.execute(sql`alter table meetings add column if not exists updated_at timestamptz not null default now();`);
  await db.execute(sql`create index if not exists meetings_tenant_status_idx on meetings (tenant_id, status);`);
  await db.execute(sql`create index if not exists meetings_tenant_start_time_idx on meetings (tenant_id, start_time);`);
  await db.execute(sql`create index if not exists meetings_tenant_room_start_idx on meetings (tenant_id, room_id, start_time);`);

  await db.execute(sql`alter table meeting_participants add column if not exists tenant_id integer references tenants(id) on delete cascade;`);
  await db.execute(sql`alter table meeting_participants add column if not exists participant_type text not null default 'agent';`);
  await db.execute(sql`alter table meeting_participants add column if not exists user_id integer;`);
  await db.execute(sql`alter table meeting_participants add column if not exists guest_email text;`);
  await db.execute(sql`alter table meeting_participants add column if not exists required boolean not null default true;`);
  await db.execute(sql`alter table meeting_participants add column if not exists invited_at timestamptz;`);
  await db.execute(sql`alter table meeting_participants add column if not exists joined_at timestamptz;`);
  await db.execute(sql`alter table meeting_participants add column if not exists left_at timestamptz;`);
  await db.execute(sql`alter table meeting_participants add column if not exists status text not null default 'invited';`);
  await db.execute(sql`alter table meeting_participants add column if not exists created_at timestamptz not null default now();`);
  await db.execute(sql`alter table meeting_participants add column if not exists updated_at timestamptz not null default now();`);
  await db.execute(
    sql`create index if not exists meeting_participants_meeting_participant_type_idx on meeting_participants (meeting_id, participant_type);`,
  );
  await db.execute(sql`create index if not exists meeting_participants_meeting_role_idx on meeting_participants (meeting_id, role);`);

  await db.execute(sql`
    create table if not exists meeting_decisions (
      id uuid primary key default (
        (
          substr(md5(random()::text || clock_timestamp()::text), 1, 8) || '-' ||
          substr(md5(random()::text || clock_timestamp()::text), 1, 4) || '-' ||
          substr(md5(random()::text || clock_timestamp()::text), 1, 4) || '-' ||
          substr(md5(random()::text || clock_timestamp()::text), 1, 4) || '-' ||
          substr(md5(random()::text || clock_timestamp()::text), 1, 12)
        )::uuid
      ),
      tenant_id integer references tenants(id) on delete cascade,
      meeting_id integer not null references meetings(id) on delete cascade,
      decision_text text not null,
      owner_type text not null default 'none',
      owner_user_id integer,
      owner_agent_id integer references agents(id) on delete set null,
      due_date timestamptz,
      created_by text,
      created_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`alter table meeting_decisions add column if not exists tenant_id integer references tenants(id) on delete cascade;`);
  await db.execute(sql`alter table meeting_decisions add column if not exists owner_type text not null default 'none';`);
  await db.execute(sql`alter table meeting_decisions add column if not exists owner_user_id integer;`);
  await db.execute(sql`alter table meeting_decisions add column if not exists owner_agent_id integer references agents(id) on delete set null;`);
  await db.execute(sql`alter table meeting_decisions add column if not exists due_date timestamptz;`);
  await db.execute(sql`alter table meeting_decisions add column if not exists created_by text;`);
  await db.execute(sql`create index if not exists meeting_decisions_meeting_idx on meeting_decisions (meeting_id);`);

  await db.execute(sql`alter table tasks add column if not exists execution_type varchar(20);`);
  await db.execute(sql`alter table tasks add column if not exists source_meeting_id integer;`);
}

export async function ensureMeetingContextTables() {
  await ensureMeetingCompatibilityColumns();

  await db.execute(sql`
    create table if not exists meeting_agent_instances (
      id serial primary key,
      tenant_id integer not null references tenants(id) on delete cascade,
      meeting_id integer not null references meetings(id) on delete cascade,
      agent_id integer not null references agents(id) on delete cascade,
      context_key text not null,
      status text not null default 'active',
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (meeting_id, agent_id)
    );
  `);

  await db.execute(
    sql`create index if not exists meeting_agent_instances_tenant_meeting_idx on meeting_agent_instances (tenant_id, meeting_id, updated_at desc);`,
  );
  await db.execute(
    sql`create index if not exists meeting_agent_instances_agent_idx on meeting_agent_instances (tenant_id, agent_id, updated_at desc);`,
  );
}
