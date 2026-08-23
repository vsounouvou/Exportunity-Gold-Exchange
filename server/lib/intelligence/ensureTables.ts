import { db } from "@db";
import { sql } from "drizzle-orm";
import { DEFAULT_POLICY_MATRIX, DEFAULT_WORKER_ROUTES } from "./policyDefaults";

async function seedDefaultPolicies() {
  for (const policy of DEFAULT_POLICY_MATRIX) {
    await db.execute(sql`
      insert into intelligence_agent_policies (
        tenant_id,
        agent_tier,
        max_context,
        max_reasoning_depth,
        max_token_budget_per_task,
        max_tasks_per_hour,
        allow_cross_tenant,
        allow_llm,
        active,
        metadata,
        created_at,
        updated_at
      )
      select
        null,
        ${policy.tier},
        ${policy.maxContext},
        ${policy.maxReasoningDepth},
        ${policy.maxTokenBudgetPerTask},
        ${policy.maxTasksPerHour},
        ${policy.allowCrossTenant},
        ${policy.allowLlm},
        true,
        ${JSON.stringify({ seededBy: "ensureIntelligenceGovernanceTables", version: 1 })}::jsonb,
        now(),
        now()
      where not exists (
        select 1
        from intelligence_agent_policies
        where tenant_id is null
          and agent_tier = ${policy.tier}
          and active = true
      );
    `);
  }
}

async function seedDefaultRoutes() {
  for (const route of DEFAULT_WORKER_ROUTES) {
    await db.execute(sql`
      insert into intelligence_worker_routes (
        tenant_id,
        module_pattern,
        cron_kind,
        preferred_queue,
        preferred_tier,
        concurrency_limit,
        max_retry,
        active,
        metadata,
        created_at,
        updated_at
      )
      select
        null,
        ${route.modulePattern},
        ${route.cronKind},
        ${route.preferredQueue},
        ${route.preferredTier},
        ${route.concurrencyLimit},
        ${route.maxRetry},
        true,
        ${JSON.stringify({ seededBy: "ensureIntelligenceGovernanceTables", version: 1 })}::jsonb,
        now(),
        now()
      where not exists (
        select 1
        from intelligence_worker_routes
        where tenant_id is null
          and module_pattern = ${route.modulePattern}
          and cron_kind = ${route.cronKind}
          and active = true
      );
    `);
  }
}

export async function ensureIntelligenceGovernanceTables() {
  await db.execute(sql`
    create table if not exists intelligence_agent_policies (
      id serial primary key,
      tenant_id int references tenants(id) on delete cascade,
      agent_tier text not null,
      max_context int not null default 2048,
      max_reasoning_depth int not null default 1,
      max_token_budget_per_task int not null default 1000,
      max_tasks_per_hour int not null default 30,
      allow_cross_tenant boolean not null default false,
      allow_llm boolean not null default true,
      active boolean not null default true,
      metadata jsonb not null default '{}'::jsonb,
      created_by_user_id int references ece_users(id) on delete set null,
      updated_by_user_id int references ece_users(id) on delete set null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint intelligence_agent_policies_tier_check check (agent_tier in ('SUPER','MANAGER','EXECUTION'))
    );
  `);

  await db.execute(sql`
    create unique index if not exists intelligence_agent_policies_scope_tier_active_uniq
      on intelligence_agent_policies (coalesce(tenant_id, 0), agent_tier)
      where active = true;
  `);

  await db.execute(sql`
    create index if not exists intelligence_agent_policies_tenant_tier_active_idx
      on intelligence_agent_policies (tenant_id, agent_tier, active);
  `);

  await db.execute(sql`
    create table if not exists intelligence_worker_routes (
      id serial primary key,
      tenant_id int references tenants(id) on delete cascade,
      module_pattern text not null,
      cron_kind text,
      preferred_queue text not null default 'execution-default',
      preferred_tier text not null default 'EXECUTION',
      concurrency_limit int not null default 5,
      max_retry int not null default 3,
      active boolean not null default true,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint intelligence_worker_routes_cron_kind_check check (cron_kind is null or cron_kind in ('TIME','EVENT','MONITOR','REGENERATION')),
      constraint intelligence_worker_routes_tier_check check (preferred_tier in ('SUPER','MANAGER','EXECUTION'))
    );
  `);

  await db.execute(sql`
    create index if not exists intelligence_worker_routes_tenant_active_idx
      on intelligence_worker_routes (tenant_id, active);
  `);

  await db.execute(sql`
    create index if not exists intelligence_worker_routes_pattern_idx
      on intelligence_worker_routes (module_pattern, active);
  `);

  await db.execute(sql`
    create table if not exists intelligence_cron_jobs (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      name text not null,
      cron_kind text not null,
      trigger_mode text not null default 'SCHEDULE',
      schedule_cron text,
      event_key text,
      module_id text not null,
      policy_tier text not null default 'EXECUTION',
      workflow_template jsonb not null default '{}'::jsonb,
      is_active boolean not null default true,
      last_run_at timestamptz,
      next_run_at timestamptz,
      failure_count int not null default 0,
      max_failures int not null default 10,
      metadata jsonb not null default '{}'::jsonb,
      created_by_user_id int references ece_users(id) on delete set null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint intelligence_cron_jobs_kind_check check (cron_kind in ('TIME','EVENT','MONITOR','REGENERATION')),
      constraint intelligence_cron_jobs_trigger_mode_check check (trigger_mode in ('SCHEDULE','EVENT')),
      constraint intelligence_cron_jobs_policy_tier_check check (policy_tier in ('SUPER','MANAGER','EXECUTION'))
    );
  `);

  await db.execute(sql`
    create index if not exists intelligence_cron_jobs_tenant_kind_active_idx
      on intelligence_cron_jobs (tenant_id, cron_kind, is_active);
  `);

  await db.execute(sql`
    create index if not exists intelligence_cron_jobs_due_idx
      on intelligence_cron_jobs (is_active, trigger_mode, next_run_at);
  `);

  await db.execute(sql`
    create index if not exists intelligence_cron_jobs_event_idx
      on intelligence_cron_jobs (tenant_id, event_key, is_active);
  `);

  await db.execute(sql`
    create table if not exists intelligence_tasks (
      id serial primary key,
      public_task_id text,
      idempotency_key text,
      tenant_id int not null references tenants(id) on delete cascade,
      module_id text not null,
      policy_id int references intelligence_agent_policies(id) on delete set null,
      cron_job_id int references intelligence_cron_jobs(id) on delete set null,
      manager_agent_id int,
      execution_agent_id int,
      manager_tier text not null default 'MANAGER',
      execution_tier text not null default 'EXECUTION',
      state text not null default 'CREATED',
      priority int not null default 0,
      title text not null,
      instruction text not null,
      objective text,
      workflow_spec jsonb not null default '{}'::jsonb,
      workflow_hash text,
      script_hash text,
      script_signature text,
      script_version text not null default '1.0.0',
      source text not null default 'MANUAL',
      attempts int not null default 0,
      max_attempts int not null default 3,
      lease_until timestamptz,
      claimed_by text,
      token_budget int not null default 0,
      tokens_used int not null default 0,
      planned_at timestamptz,
      scripted_at timestamptz,
      queued_at timestamptz,
      running_at timestamptz,
      verified_at timestamptz,
      reported_at timestamptz,
      finished_at timestamptz,
      last_error_code text,
      last_error text,
      metadata jsonb not null default '{}'::jsonb,
      created_by_user_id int references ece_users(id) on delete set null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint intelligence_tasks_manager_tier_check check (manager_tier in ('SUPER','MANAGER')),
      constraint intelligence_tasks_execution_tier_check check (execution_tier in ('EXECUTION')),
      constraint intelligence_tasks_state_check check (state in ('CREATED','PLANNED','SCRIPTED','QUEUED','RUNNING','VERIFIED','REPORTED','FAILED','CANCELLED')),
      constraint intelligence_tasks_source_check check (source in ('MANUAL','CRON_TIME','CRON_EVENT','CRON_MONITOR','CRON_REGENERATION','ESCALATION'))
    );
  `);

  await db.execute(sql`
    alter table intelligence_tasks
      add column if not exists idempotency_key text;
  `);

  await db.execute(sql`
    create unique index if not exists intelligence_tasks_public_task_id_idx
      on intelligence_tasks (public_task_id)
      where public_task_id is not null;
  `);

  await db.execute(sql`
    create unique index if not exists intelligence_tasks_tenant_idempotency_key_idx
      on intelligence_tasks (tenant_id, idempotency_key);
  `);

  await db.execute(sql`
    create index if not exists intelligence_tasks_tenant_state_idx
      on intelligence_tasks (tenant_id, state, priority, created_at);
  `);

  await db.execute(sql`
    create index if not exists intelligence_tasks_queue_lease_idx
      on intelligence_tasks (state, lease_until, priority, created_at);
  `);

  await db.execute(sql`
    create index if not exists intelligence_tasks_module_idx
      on intelligence_tasks (tenant_id, module_id, created_at);
  `);

  await db.execute(sql`
    update intelligence_tasks
    set public_task_id = 'INT-' || lpad(id::text, 6, '0')
    where public_task_id is null;
  `);

  await db.execute(sql`
    create table if not exists intelligence_audit_events (
      id serial primary key,
      tenant_id int references tenants(id) on delete cascade,
      task_id int references intelligence_tasks(id) on delete cascade,
      cron_job_id int references intelligence_cron_jobs(id) on delete set null,
      actor_type text not null,
      actor_id text,
      event_type text not null,
      before_state text,
      after_state text,
      payload jsonb not null default '{}'::jsonb,
      immutable_hash text,
      created_at timestamptz not null default now(),
      constraint intelligence_audit_events_actor_type_check check (actor_type in ('SUPER','MANAGER','EXECUTION','SYSTEM','USER'))
    );
  `);

  await db.execute(sql`
    create index if not exists intelligence_audit_events_tenant_created_idx
      on intelligence_audit_events (tenant_id, created_at);
  `);

  await db.execute(sql`
    create index if not exists intelligence_audit_events_task_created_idx
      on intelligence_audit_events (task_id, created_at);
  `);

  await db.execute(sql`
    create index if not exists intelligence_audit_events_type_created_idx
      on intelligence_audit_events (event_type, created_at);
  `);

  await db.execute(sql`
    create table if not exists intelligence_token_ledger (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      task_id int references intelligence_tasks(id) on delete cascade,
      policy_id int references intelligence_agent_policies(id) on delete set null,
      actor_tier text not null,
      event_type text not null,
      tokens_delta int not null,
      token_balance_after int,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      constraint intelligence_token_ledger_actor_tier_check check (actor_tier in ('SUPER','MANAGER','EXECUTION')),
      constraint intelligence_token_ledger_event_type_check check (event_type in ('ALLOCATE','CONSUME','REFUND','VIOLATION','THROTTLE'))
    );
  `);

  await db.execute(sql`
    create index if not exists intelligence_token_ledger_tenant_created_idx
      on intelligence_token_ledger (tenant_id, created_at);
  `);

  await db.execute(sql`
    create index if not exists intelligence_token_ledger_task_created_idx
      on intelligence_token_ledger (task_id, created_at);
  `);

  await db.execute(sql`
    create index if not exists intelligence_token_ledger_type_created_idx
      on intelligence_token_ledger (event_type, created_at);
  `);

  await db.execute(sql`
    create table if not exists intelligence_alerts (
      id serial primary key,
      tenant_id int references tenants(id) on delete cascade,
      task_id int references intelligence_tasks(id) on delete set null,
      cron_job_id int references intelligence_cron_jobs(id) on delete set null,
      severity text not null default 'warning',
      code text not null,
      message text not null,
      details jsonb not null default '{}'::jsonb,
      acknowledged_at timestamptz,
      created_at timestamptz not null default now(),
      constraint intelligence_alerts_severity_check check (severity in ('info','warning','critical'))
    );
  `);

  await db.execute(sql`
    create index if not exists intelligence_alerts_tenant_severity_idx
      on intelligence_alerts (tenant_id, severity, created_at);
  `);

  await db.execute(sql`
    create index if not exists intelligence_alerts_code_idx
      on intelligence_alerts (code, created_at);
  `);

  await db.execute(sql`
    create or replace function intelligence_guard_audit_immutable()
    returns trigger
    language plpgsql
    as $$
    begin
      raise exception 'intelligence_audit_events is append-only';
    end;
    $$;
  `);

  await db.execute(sql`drop trigger if exists intelligence_audit_events_no_update on intelligence_audit_events;`);
  await db.execute(sql`drop trigger if exists intelligence_audit_events_no_delete on intelligence_audit_events;`);

  await db.execute(sql`
    create trigger intelligence_audit_events_no_update
    before update on intelligence_audit_events
    for each row
    execute function intelligence_guard_audit_immutable();
  `);

  await db.execute(sql`
    create trigger intelligence_audit_events_no_delete
    before delete on intelligence_audit_events
    for each row
    execute function intelligence_guard_audit_immutable();
  `);

  await seedDefaultPolicies();
  await seedDefaultRoutes();
}
