import { db } from "@db";
import { sql } from "drizzle-orm";

export async function ensureWorkstationTables() {
  await db.execute(sql`
    create table if not exists agent_capabilities (
      tenant_id int not null references tenants(id) on delete cascade,
      agent_id int not null references agents(id) on delete cascade,
      workstation_enabled bool not null default false,
      internet_enabled bool not null default false,
      allowed_domains text[] not null default '{}',
      downloads_allowed bool not null default false,
      clipboard_allowed bool not null default false,
      requires_approval bool not null default true,
      max_session_minutes int not null default 30,
      updated_at timestamptz not null default now(),
      created_at timestamptz not null default now(),
      primary key (tenant_id, agent_id)
    );
  `);

  await db.execute(
    sql`create index if not exists agent_capabilities_tenant_enabled_idx on agent_capabilities(tenant_id, workstation_enabled, updated_at desc);`,
  );

  await db.execute(sql`
    insert into agent_capabilities (tenant_id, agent_id)
    select a.tenant_id, a.id
    from agents a
    where a.tenant_id is not null
      and coalesce(a.domain, 'INTERNAL') = 'INTERNAL'
    on conflict (tenant_id, agent_id) do nothing;
  `);

  await db.execute(sql`
    create table if not exists workstation_network_policies (
      id text primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      mode text not null check (mode in ('DEFAULT_DENY', 'ALLOWLIST', 'FULL_EGRESS')),
      allowed_domains jsonb not null default '[]'::jsonb,
      allowed_ip_ranges jsonb not null default '[]'::jsonb,
      notes text,
      updated_by_user_id int references ece_users(id) on delete set null,
      updated_at timestamptz not null default now(),
      created_at timestamptz not null default now()
    );
  `);

  await db.execute(sql`
    create table if not exists agent_workstations (
      id text primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      agent_id int not null references agents(id) on delete cascade,
      owner_user_id int references ece_users(id) on delete set null,
      provider text not null check (provider in ('DOCKER', 'K8S', 'FUTURE_MICROVM')),
      provider_ref text,
      status text not null check (status in ('CREATING', 'RUNNING', 'STOPPED', 'FAILED', 'DESTROYED')),
      workspace_type text not null check (workspace_type in ('EPHEMERAL', 'PERSISTENT')) default 'EPHEMERAL',
      ide_url text,
      terminal_url text,
      desktop_url text,
      cpu int not null default 1,
      ram_mb int not null default 2048,
      disk_mb int not null default 10240,
      network_policy_id text references workstation_network_policies(id) on delete set null,
      network_policy_mode text not null check (network_policy_mode in ('DEFAULT_DENY', 'ALLOWLIST', 'FULL_EGRESS')) default 'DEFAULT_DENY',
      repo_url text,
      repo_branch text,
      task_id int references tasks(id) on delete set null,
      objective_id int references goals(id) on delete set null,
      expires_at timestamptz,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);

  await db.execute(sql`
    create table if not exists workstation_artifacts (
      id text primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      workstation_id text not null references agent_workstations(id) on delete cascade,
      agent_id int references agents(id) on delete set null,
      task_id int references tasks(id) on delete set null,
      type text not null check (type in ('DOCX', 'PDF', 'ZIP', 'LOG', 'DIFF')),
      storage_key text not null,
      url text,
      sha256 text,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
  `);

  await db.execute(sql`
    create table if not exists workstation_sessions (
      id text primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      workstation_id text not null references agent_workstations(id) on delete cascade,
      user_id int references ece_users(id) on delete set null,
      agent_id int references agents(id) on delete set null,
      session_type text not null check (session_type in ('IDE', 'DESKTOP', 'TERMINAL', 'API')),
      started_at timestamptz not null default now(),
      ended_at timestamptz,
      ip text,
      user_agent text,
      metadata jsonb not null default '{}'::jsonb
    );
  `);

  await db.execute(sql`
    create table if not exists workstation_events (
      id text primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      workstation_id text not null references agent_workstations(id) on delete cascade,
      session_id text references workstation_sessions(id) on delete set null,
      actor_user_id int references ece_users(id) on delete set null,
      actor_agent_id int references agents(id) on delete set null,
      event_type text not null,
      command text,
      origin text,
      correlation_id text,
      event_payload_json jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
  `);

  await db.execute(sql`alter table workstation_events add column if not exists command text;`);
  await db.execute(sql`alter table workstation_events add column if not exists origin text;`);
  await db.execute(sql`alter table workstation_events add column if not exists correlation_id text;`);

  await db.execute(sql`
    create table if not exists workstation_view_tokens (
      id text primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      workstation_id text not null references agent_workstations(id) on delete cascade,
      viewer_user_id int references ece_users(id) on delete set null,
      viewer_agent_id int references agents(id) on delete set null,
      session_id text references workstation_sessions(id) on delete set null,
      token text not null unique,
      scope text not null check (scope in ('IDE', 'DESKTOP', 'TERMINAL')),
      expires_at timestamptz not null,
      used_at timestamptz,
      created_at timestamptz not null default now()
    );
  `);

  await db.execute(
    sql`create index if not exists workstation_network_policies_tenant_idx on workstation_network_policies(tenant_id, mode);`,
  );
  await db.execute(
    sql`create index if not exists agent_workstations_tenant_agent_idx on agent_workstations(tenant_id, agent_id, created_at desc);`,
  );
  await db.execute(
    sql`create index if not exists agent_workstations_tenant_status_idx on agent_workstations(tenant_id, status, updated_at desc);`,
  );
  await db.execute(
    sql`create index if not exists workstation_artifacts_tenant_ws_idx on workstation_artifacts(tenant_id, workstation_id, created_at desc);`,
  );
  await db.execute(
    sql`create index if not exists workstation_sessions_tenant_ws_idx on workstation_sessions(tenant_id, workstation_id, started_at desc);`,
  );
  await db.execute(
    sql`create index if not exists workstation_events_tenant_ws_idx on workstation_events(tenant_id, workstation_id, created_at desc);`,
  );
  await db.execute(
    sql`create index if not exists workstation_events_tenant_corr_idx on workstation_events(tenant_id, correlation_id, created_at desc);`,
  );
  await db.execute(
    sql`create index if not exists workstation_view_tokens_tenant_ws_idx on workstation_view_tokens(tenant_id, workstation_id, expires_at desc);`,
  );

  // Ensure one logical workstation row exists per internal agent.
  // Runtime containers are provisioned lazily on first start request.
  await db.execute(sql`
    insert into agent_workstations (
      id,
      tenant_id,
      agent_id,
      provider,
      status,
      workspace_type,
      network_policy_mode,
      metadata,
      created_at,
      updated_at
    )
    select
      concat('ws_', substr(md5(random()::text || clock_timestamp()::text || a.id::text), 1, 16)),
      a.tenant_id,
      a.id,
      'DOCKER',
      'STOPPED',
      'EPHEMERAL',
      'DEFAULT_DENY',
      jsonb_build_object('autoProvisioned', true, 'autoProvisionedAt', now()),
      now(),
      now()
    from agents a
    where a.tenant_id is not null
      and coalesce(a.domain, 'INTERNAL') = 'INTERNAL'
      and not exists (
        select 1
        from agent_workstations w
        where w.tenant_id = a.tenant_id
          and w.agent_id = a.id
          and w.status <> 'DESTROYED'
      );
  `);
}
