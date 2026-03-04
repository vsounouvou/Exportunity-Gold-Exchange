-- Agent Economy Command Center foundation:
-- hierarchy-aware governance, token usage ledger, and CRON registry.

alter table if exists agents
  add column if not exists hierarchy_level text not null default 'executor',
  add column if not exists intelligence_cap text not null default 'LOW',
  add column if not exists max_context_tokens int not null default 4096,
  add column if not exists max_daily_tokens int not null default 10000,
  add column if not exists is_super_agent boolean not null default false,
  add column if not exists token_multiplier numeric(6,2) not null default 1.00;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'agents_hierarchy_level_check'
  ) then
    alter table agents
      add constraint agents_hierarchy_level_check
      check (hierarchy_level in ('executor','manager','director','super'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'agents_intelligence_cap_check'
  ) then
    alter table agents
      add constraint agents_intelligence_cap_check
      check (intelligence_cap in ('LOW','MEDIUM','HIGH','UNLIMITED'));
  end if;
end $$;

update agents
set
  hierarchy_level = case
    when coalesce(is_super_agent, false) then 'super'
    when lower(coalesce(decision_authority, '')) = 'executive' then 'director'
    when coalesce(role_level, 1) >= 3 then 'manager'
    else 'executor'
  end,
  intelligence_cap = case
    when coalesce(is_super_agent, false) then 'UNLIMITED'
    when lower(coalesce(decision_authority, '')) = 'executive' then 'HIGH'
    when coalesce(role_level, 1) >= 3 then 'MEDIUM'
    else 'LOW'
  end,
  max_context_tokens = coalesce(nullif(max_context_tokens, 0), coalesce(context_window_tokens, 4096)),
  max_daily_tokens = case
    when coalesce(is_super_agent, false) then 100000000
    when lower(coalesce(decision_authority, '')) = 'executive' then greatest(coalesce(max_daily_tokens, 0), 250000)
    when coalesce(role_level, 1) >= 3 then greatest(coalesce(max_daily_tokens, 0), 100000)
    else greatest(coalesce(max_daily_tokens, 0), 10000)
  end,
  token_multiplier = case
    when coalesce(is_super_agent, false) then 10.00
    when lower(coalesce(decision_authority, '')) = 'executive' then 3.00
    when coalesce(role_level, 1) >= 3 then 2.00
    else 1.00
  end;

alter table if exists economy_wallets
  add column if not exists daily_spent numeric(15,2) not null default 0.00,
  add column if not exists lifetime_spent numeric(20,2) not null default 0.00,
  add column if not exists daily_limit numeric(15,2) not null default 100.00,
  add column if not exists tier_limit numeric(15,2) not null default 100000.00,
  add column if not exists auto_refill boolean not null default false;

update economy_wallets
set
  daily_spent = coalesce(daily_spent, 0.00) + 0,
  lifetime_spent = coalesce(nullif(lifetime_spent, 0.00), lifetime_credits_spent::numeric, 0.00),
  daily_limit = coalesce(nullif(daily_limit, 0.00), daily_credit_limit::numeric, 100.00);

create table if not exists agent_token_usage (
  id serial primary key,
  agent_id int not null references agents(id) on delete cascade,
  tenant_id int references tenants(id) on delete cascade,
  task_id int,
  tokens_used int not null default 0,
  reasoning_depth int not null default 1,
  "timestamp" timestamp not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists agent_token_usage_agent_idx
  on agent_token_usage (agent_id, "timestamp");

create index if not exists agent_token_usage_tenant_idx
  on agent_token_usage (tenant_id, "timestamp");

create index if not exists agent_token_usage_task_idx
  on agent_token_usage (task_id);

alter table if exists agent_tasks
  add column if not exists agent_id int,
  add column if not exists task_type text not null default 'general',
  add column if not exists task_source text not null default 'manual',
  add column if not exists script_generated boolean not null default false,
  add column if not exists execution_status text not null default 'queued';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'agent_tasks_task_source_check'
  ) then
    alter table agent_tasks
      add constraint agent_tasks_task_source_check
      check (task_source in ('manual','cron','event'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'agent_tasks_execution_status_check'
  ) then
    alter table agent_tasks
      add constraint agent_tasks_execution_status_check
      check (execution_status in ('queued','running','success','failed','cancelled'));
  end if;
end $$;

update agent_tasks
set execution_status = case
  when status = 'completed' then 'success'
  when status = 'error' then 'failed'
  when status = 'cancelled' then 'cancelled'
  when status = 'running' then 'running'
  else 'queued'
end
where execution_status is null
   or execution_status not in ('queued','running','success','failed','cancelled');

create index if not exists agent_tasks_execution_status_idx
  on agent_tasks (tenant_id, execution_status);

create index if not exists agent_tasks_tenant_agent_id_idx
  on agent_tasks (tenant_id, agent_id);

create table if not exists cron_registry (
  id serial primary key,
  tenant_id int not null references tenants(id) on delete cascade,
  agent_id int references agents(id) on delete set null,
  cron_type text not null,
  schedule text,
  script_reference text,
  budget_tokens int not null default 0,
  is_active boolean not null default true,
  last_run timestamptz,
  next_run timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'cron_registry_cron_type_check'
  ) then
    alter table cron_registry
      add constraint cron_registry_cron_type_check
      check (cron_type in ('time','event','monitor','regeneration'));
  end if;
end $$;

create index if not exists cron_registry_tenant_active_idx
  on cron_registry (tenant_id, is_active, next_run);

create index if not exists cron_registry_agent_idx
  on cron_registry (agent_id, next_run);

create index if not exists cron_registry_type_idx
  on cron_registry (cron_type, next_run);

insert into cron_registry (
  tenant_id,
  agent_id,
  cron_type,
  schedule,
  script_reference,
  budget_tokens,
  is_active,
  last_run,
  next_run,
  metadata,
  created_at,
  updated_at
)
select
  j.tenant_id,
  case when coalesce(j.metadata ->> 'agentId', '') ~ '^[0-9]+$' then (j.metadata ->> 'agentId')::int else null end,
  lower(j.cron_kind),
  coalesce(j.schedule_cron, j.event_key),
  j.module_id,
  coalesce(case when coalesce(j.metadata ->> 'budgetTokens', '') ~ '^[0-9]+$' then (j.metadata ->> 'budgetTokens')::int else 0 end, 0),
  j.is_active,
  j.last_run_at,
  j.next_run_at,
  jsonb_build_object('source', 'intelligence_cron_jobs', 'sourceId', j.id),
  coalesce(j.created_at, now()),
  coalesce(j.updated_at, now())
from intelligence_cron_jobs j
where not exists (
  select 1
  from cron_registry c
  where c.tenant_id = j.tenant_id
    and c.script_reference = j.module_id
    and coalesce(c.schedule, '') = coalesce(j.schedule_cron, j.event_key, '')
);
