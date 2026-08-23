-- Canonical agent task queue required by Territory Media, Social Inbox, and
-- the Agent Economy control surfaces. This migration is additive and creates
-- no tasks or external actions.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'agent_key') then
    create type agent_key as enum (
      'marketing', 'client_hunter', 'media', 'ops', 'compliance', 'data', 'seo_autopilot'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'agent_task_status') then
    create type agent_task_status as enum (
      'queued', 'running', 'paused', 'completed', 'error', 'cancelled'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'agent_action_log_status') then
    create type agent_action_log_status as enum ('running', 'ok', 'error', 'skipped');
  end if;
end $$;

create table if not exists agent_tasks (
  id serial primary key,
  tenant_id integer not null references tenants(id) on delete cascade,
  agent_id integer,
  agent agent_key not null,
  task_type text not null default 'general',
  task_source text not null default 'manual',
  script_generated boolean not null default false,
  execution_status text not null default 'queued',
  goal text not null,
  budget_usd_cap numeric(10,2) not null default 0.00,
  budget_max_calls integer not null default 0,
  budget_max_tokens integer not null default 0,
  budget_used_usd numeric(10,4) not null default 0.0000,
  calls_used integer not null default 0,
  tokens_used integer not null default 0,
  status agent_task_status not null default 'queued',
  constraints jsonb not null default '{}'::jsonb,
  created_by_user_id integer references ece_users(id) on delete set null,
  started_at timestamp,
  finished_at timestamp,
  created_at timestamp default now(),
  updated_at timestamp default now(),
  constraint agent_tasks_task_source_check
    check (task_source in ('manual', 'cron', 'event')),
  constraint agent_tasks_execution_status_check
    check (execution_status in ('queued', 'running', 'success', 'failed', 'cancelled'))
);

create index if not exists agent_tasks_tenant_idx
  on agent_tasks(tenant_id);
create index if not exists agent_tasks_tenant_agent_idx
  on agent_tasks(tenant_id, agent);
create index if not exists agent_tasks_status_idx
  on agent_tasks(status);
create index if not exists agent_tasks_execution_status_idx
  on agent_tasks(tenant_id, execution_status);
create index if not exists agent_tasks_tenant_agent_id_idx
  on agent_tasks(tenant_id, agent_id);

create table if not exists agent_action_logs (
  id serial primary key,
  tenant_id integer not null references tenants(id) on delete cascade,
  agent agent_key not null,
  task_id integer references agent_tasks(id) on delete cascade,
  action text not null,
  estimated_cost_usd numeric(10,4) not null default 0.0000,
  status agent_action_log_status not null default 'ok',
  output_summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp default now()
);

create index if not exists agent_action_logs_tenant_idx
  on agent_action_logs(tenant_id);
create index if not exists agent_action_logs_task_idx
  on agent_action_logs(task_id);
create index if not exists agent_action_logs_agent_idx
  on agent_action_logs(agent);
create index if not exists agent_action_logs_status_idx
  on agent_action_logs(status);
