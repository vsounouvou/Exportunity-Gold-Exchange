import { db } from "@db";
import { sql } from "drizzle-orm";

export async function ensureBrainstormTables() {
  await db.execute(sql`
    create table if not exists brainstorm_sessions (
      id text primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      conversation_id text,
      meeting_id int references meetings(id) on delete set null,
      company_id int references companies(id) on delete set null,
      created_by_user_id int references ece_users(id) on delete set null,
      topic text not null,
      duration_sec int not null check (duration_sec > 0),
      status text not null check (status in ('running', 'stopped', 'done', 'failed')),
      started_at timestamptz not null default now(),
      ended_at timestamptz,
      settings_json jsonb not null default '{}'::jsonb,
      participants_agent_ids jsonb not null default '[]'::jsonb,
      summary_message_id int references messages(id) on delete set null,
      message_count int not null default 0,
      token_usage int not null default 0,
      max_tokens int not null default 12000,
      error text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);

  await db.execute(sql`
    create index if not exists brainstorm_sessions_tenant_status_idx
      on brainstorm_sessions (tenant_id, status, started_at desc);
  `);
  await db.execute(sql`
    create index if not exists brainstorm_sessions_tenant_conversation_idx
      on brainstorm_sessions (tenant_id, conversation_id, started_at desc);
  `);
  await db.execute(sql`
    create index if not exists brainstorm_sessions_tenant_meeting_idx
      on brainstorm_sessions (tenant_id, meeting_id, started_at desc);
  `);
}
