import { db } from "@db";
import { sql } from "drizzle-orm";

function rows<T = any>(result: any): T[] {
  if (Array.isArray(result?.rows)) return result.rows as T[];
  if (Array.isArray(result)) return result as T[];
  return [];
}

export async function ensureAgentManagementV2Tables() {
  // Agents V2 fields (domain split + department ownership + model/tool config).
  await db.execute(sql`alter table agents add column if not exists tenant_id integer references tenants(id) on delete set null;`);
  await db.execute(sql`alter table agents add column if not exists runtime_model text;`);
  await db.execute(sql`alter table agents add column if not exists tools_enabled_json jsonb not null default '[]'::jsonb;`);
  await db.execute(sql`alter table agents add column if not exists domain text not null default 'INTERNAL';`);
  await db.execute(sql`alter table agents add column if not exists department_key text;`);
  await db.execute(sql`alter table agents add column if not exists manager_of_page_key text;`);
  await db.execute(sql`alter table agents add column if not exists is_template boolean not null default false;`);
  await db.execute(sql`alter table agents add column if not exists parent_agent_id integer references agents(id) on delete set null;`);

  await db.execute(sql`
    do $$
    begin
      begin
        alter table agents
        add constraint agents_domain_check
        check (domain in ('INTERNAL', 'MARKETPLACE'));
      exception
        when duplicate_object then null;
      end;
    end $$;
  `);

  // Legacy backfill: older agent rows can exist without tenant_id, which breaks tenant-scoped listings.
  // We map company_id=1 legacy agents to the BDO tenant when present.
  const bdoTenantRow = rows<{ id: number }>(
    await db.execute(sql`
      select id
      from tenants
      where key = 'bdo'
      limit 1
    `),
  )[0];
  const bdoTenantId = Number(bdoTenantRow?.id || 0);
  if (Number.isInteger(bdoTenantId) && bdoTenantId > 0) {
    await db.execute(sql`
      update agents a
      set
        tenant_id = ${bdoTenantId},
        metadata = jsonb_set(
          coalesce(a.metadata, '{}'::jsonb),
          '{tenantId}',
          to_jsonb(${String(bdoTenantId)}::text),
          true
        ),
        updated_at = now()
      where a.tenant_id is null
        and a.company_id = 1
    `);
  }

  await db.execute(sql`create index if not exists agents_tenant_domain_idx on agents (tenant_id, domain);`);
  await db.execute(sql`create index if not exists agents_tenant_department_key_idx on agents (tenant_id, department_key);`);

  // Department manager mapping (per-tenant page ownership).
  await db.execute(sql`
    create table if not exists department_managers (
      id bigserial primary key,
      tenant_id integer not null references tenants(id) on delete cascade,
      page_key text not null,
      manager_agent_id integer not null references agents(id) on delete cascade,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (tenant_id, page_key)
    );
  `);
  await db.execute(sql`
    create index if not exists department_managers_tenant_manager_idx
      on department_managers (tenant_id, manager_agent_id, updated_at desc);
  `);

  // Agent config/audit trail for model/tool changes.
  await db.execute(sql`
    create table if not exists agent_config_changes (
      id bigserial primary key,
      tenant_id integer not null references tenants(id) on delete cascade,
      agent_id integer not null references agents(id) on delete cascade,
      changed_by_user_id integer references ece_users(id) on delete set null,
      changed_by_agent_id integer references agents(id) on delete set null,
      before_json jsonb not null default '{}'::jsonb,
      after_json jsonb not null default '{}'::jsonb,
      reason text,
      created_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`
    create index if not exists agent_config_changes_tenant_agent_idx
      on agent_config_changes (tenant_id, agent_id, created_at desc);
  `);

  // Persistent test + direct chat history per agent profile.
  await db.execute(sql`
    create table if not exists agent_profile_history (
      id bigserial primary key,
      tenant_id integer not null references tenants(id) on delete cascade,
      agent_id integer not null references agents(id) on delete cascade,
      entry_type text not null,
      session_id text,
      prompt text not null,
      response text,
      analysis text,
      history_json jsonb not null default '[]'::jsonb,
      metadata jsonb not null default '{}'::jsonb,
      created_by_user_id integer references ece_users(id) on delete set null,
      created_by_agent_id integer references agents(id) on delete set null,
      created_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`
    do $$
    begin
      begin
        alter table agent_profile_history
        add constraint agent_profile_history_entry_type_check
        check (entry_type in ('TEST', 'CHAT'));
      exception
        when duplicate_object then null;
      end;
    end $$;
  `);
  await db.execute(sql`
    create index if not exists agent_profile_history_tenant_agent_type_idx
      on agent_profile_history (tenant_id, agent_id, entry_type, created_at desc);
  `);
  await db.execute(sql`
    create index if not exists agent_profile_history_tenant_agent_session_idx
      on agent_profile_history (tenant_id, agent_id, session_id, created_at asc);
  `);

  await db.execute(sql`
    create table if not exists agent_profile_chat_sessions (
      id bigserial primary key,
      tenant_id integer not null references tenants(id) on delete cascade,
      agent_id integer not null references agents(id) on delete cascade,
      session_id text not null,
      title text,
      archived boolean not null default false,
      metadata jsonb not null default '{}'::jsonb,
      last_message_at timestamptz not null default now(),
      created_by_user_id integer references ece_users(id) on delete set null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (tenant_id, agent_id, session_id)
    );
  `);
  await db.execute(sql`
    create index if not exists agent_profile_chat_sessions_tenant_agent_archived_idx
      on agent_profile_chat_sessions (tenant_id, agent_id, archived, last_message_at desc);
  `);
  await db.execute(sql`
    create index if not exists agent_profile_chat_sessions_tenant_agent_session_idx
      on agent_profile_chat_sessions (tenant_id, agent_id, session_id);
  `);

  // Workstation monitoring sessions (agent-centric view required by Operations audits).
  await db.execute(sql`
    create table if not exists agent_workstation_sessions (
      id text primary key,
      tenant_id integer not null references tenants(id) on delete cascade,
      agent_id integer not null references agents(id) on delete cascade,
      workstation_id text not null,
      started_at timestamptz not null default now(),
      ended_at timestamptz,
      status text not null default 'RUNNING',
      active_tab text,
      last_activity_at timestamptz not null default now(),
      metadata jsonb not null default '{}'::jsonb
    );
  `);
  await db.execute(sql`
    do $$
    begin
      begin
        alter table agent_workstation_sessions
        add constraint agent_workstation_sessions_status_check
        check (status in ('RUNNING', 'CLOSED', 'CRASHED'));
      exception
        when duplicate_object then null;
      end;
    end $$;
  `);
  await db.execute(sql`
    create index if not exists agent_workstation_sessions_tenant_agent_idx
      on agent_workstation_sessions (tenant_id, agent_id, started_at desc);
  `);
  await db.execute(sql`
    create index if not exists agent_workstation_sessions_tenant_ws_idx
      on agent_workstation_sessions (tenant_id, workstation_id, started_at desc);
  `);

  // Action Forge pipeline storage.
  await db.execute(sql`
    create table if not exists action_forge_requests (
      id text primary key,
      tenant_id integer not null references tenants(id) on delete cascade,
      requested_by_user_id integer references ece_users(id) on delete set null,
      requested_by_agent_id integer references agents(id) on delete set null,
      desired_action_key text not null,
      desired_description text,
      desired_entity text,
      status text not null default 'REQUESTED',
      pr_url text,
      error_log text,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`
    do $$
    begin
      begin
        alter table action_forge_requests
        add constraint action_forge_requests_status_check
        check (
          status in (
            'REQUESTED',
            'SPEC_DRAFTED',
            'IMPLEMENTED',
            'TESTED',
            'NEEDS_REVIEW',
            'APPROVED',
            'PUBLISHED',
            'REJECTED'
          )
        );
      exception
        when duplicate_object then null;
      end;
    end $$;
  `);
  await db.execute(sql`
    create index if not exists action_forge_requests_tenant_status_idx
      on action_forge_requests (tenant_id, status, created_at desc);
  `);
  await db.execute(sql`
    create index if not exists action_forge_requests_tenant_key_idx
      on action_forge_requests (tenant_id, desired_action_key, created_at desc);
  `);

  await db.execute(sql`
    create table if not exists action_forge_events (
      id bigserial primary key,
      request_id text not null references action_forge_requests(id) on delete cascade,
      status_from text,
      status_to text not null,
      notes text,
      created_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`
    create index if not exists action_forge_events_request_idx
      on action_forge_events (request_id, created_at desc);
  `);

  // Unified activity views required by Agent Profile V2.
  await db.execute(sql`
    create or replace view agent_action_runs as
    select
      ar.id,
      ar.tenant_id,
      coalesce(
        nullif(ar.payload->>'agentId', '')::int,
        nullif(ar.payload->>'agent_id', '')::int
      ) as agent_id,
      ar.action_type as action_key,
      ar.status,
      ar.outcome,
      ar.mode,
      ar.correlation_id,
      ar.created_at,
      ar.updated_at
    from action_requests ar;
  `);

  await db.execute(sql`
    create or replace view agent_meeting_attendance as
    select
      mp.id,
      mp.tenant_id,
      mp.meeting_id,
      mp.agent_id,
      mp.role,
      mp.status,
      coalesce(mp.joined_at, mp.created_at) as attended_at
    from meeting_participants mp
    where mp.agent_id is not null;
  `);

  await db.execute(sql`
    create or replace view agent_task_assignments as
    select
      t.id,
      t.agent_id,
      t.company_id,
      t.status,
      t.priority,
      t.created_at,
      t.updated_at
    from tasks t
    where t.agent_id is not null;
  `);
}
