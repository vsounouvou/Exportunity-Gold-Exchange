import { db } from "@db";
import { sql } from "drizzle-orm";

export async function ensureActionRouterTables() {
  await db.execute(sql`
    create table if not exists action_requests (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      requested_by_agent_key text,
      requested_by_user_id int references ece_users(id) on delete set null,
      action_type text not null,
      payload jsonb not null default '{}'::jsonb,
      status text not null default 'PENDING',
      mode text not null default 'REAL',
      outcome text not null default 'APPROVAL_PENDING',
      priority int not null default 0,
      idempotency_key text,
      correlation_id text,
      model_used text,
      related_conversation_id text,
      related_thread_id int,
      approved_by_user_id int references ece_users(id) on delete set null,
      approved_at timestamptz,
      started_at timestamptz,
      finished_at timestamptz,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);

  await db.execute(sql`alter table action_requests add column if not exists mode text not null default 'REAL';`);
  await db.execute(sql`alter table action_requests add column if not exists outcome text not null default 'APPROVAL_PENDING';`);
  await db.execute(sql`alter table action_requests add column if not exists correlation_id text;`);
  await db.execute(sql`alter table action_requests add column if not exists model_used text;`);
  await db.execute(sql`alter table action_requests add column if not exists public_action_id text;`);
  await db.execute(sql`alter table action_requests add column if not exists lifecycle_state text not null default 'CREATED';`);
  await db.execute(sql`alter table action_requests add column if not exists created_by_user_id int references ece_users(id) on delete set null;`);
  await db.execute(sql`alter table action_requests add column if not exists assigned_agent_id int;`);
  await db.execute(sql`alter table action_requests add column if not exists evidence_required boolean not null default false;`);
  await db.execute(sql`alter table action_requests add column if not exists evidence_status text not null default 'NONE';`);
  await db.execute(sql`alter table action_requests add column if not exists attempt_count int not null default 0;`);
  await db.execute(sql`alter table action_requests add column if not exists next_retry_at timestamptz;`);
  await db.execute(sql`alter table action_requests add column if not exists claimed_until timestamptz;`);
  await db.execute(sql`alter table action_requests add column if not exists claimed_by text;`);
  await db.execute(sql`alter table action_requests add column if not exists error_code text;`);
  await db.execute(sql`alter table action_requests add column if not exists error_message text;`);

  await db.execute(sql`
    alter table action_requests
    drop constraint if exists action_requests_lifecycle_state_check;
  `);
  await db.execute(sql`
    alter table action_requests
    add constraint action_requests_lifecycle_state_check
    check (lifecycle_state in ('CREATED','QUEUED','RUNNING','SUCCEEDED','FAILED','CANCELED'));
  `);
  await db.execute(sql`
    alter table action_requests
    drop constraint if exists action_requests_evidence_status_check;
  `);
  await db.execute(sql`
    alter table action_requests
    add constraint action_requests_evidence_status_check
    check (evidence_status in ('NONE','PENDING','SATISFIED'));
  `);

  await db.execute(sql`
    create index if not exists action_requests_tenant_created_idx
      on action_requests (tenant_id, created_at desc);
  `);

  await db.execute(sql`
    create index if not exists action_requests_tenant_status_idx
      on action_requests (tenant_id, status, updated_at desc);
  `);

  await db.execute(sql`
    create index if not exists action_requests_status_idx
      on action_requests (status, updated_at desc);
  `);

  await db.execute(sql`
    create index if not exists action_requests_correlation_idx
      on action_requests (correlation_id, updated_at desc);
  `);

  await db.execute(sql`
    create index if not exists action_requests_lifecycle_idx
      on action_requests (tenant_id, lifecycle_state, updated_at desc);
  `);

  await db.execute(sql`
    create index if not exists action_requests_queue_lease_idx
      on action_requests (status, claimed_until, next_retry_at, priority, created_at);
  `);

  await db.execute(sql`
    create unique index if not exists action_requests_public_action_id_idx
      on action_requests (public_action_id)
      where public_action_id is not null;
  `);

  // Keep idempotency best-effort (duplicates with null allowed).
  await db.execute(sql`
    create unique index if not exists action_requests_tenant_idempotency_idx
      on action_requests (tenant_id, idempotency_key);
  `);

  await db.execute(sql`
    update action_requests
    set public_action_id = 'ACT-' || lpad(id::text, 6, '0')
    where public_action_id is null;
  `);

  await db.execute(sql`
    update action_requests
    set created_by_user_id = requested_by_user_id
    where created_by_user_id is null and requested_by_user_id is not null;
  `);

  await db.execute(sql`
    update action_requests
    set lifecycle_state = case
      when status = 'QUEUED' then 'QUEUED'
      when status = 'RUNNING' then 'RUNNING'
      when status = 'DONE' then 'SUCCEEDED'
      when status = 'FAILED' then 'FAILED'
      when status in ('DENIED','CANCELLED') then 'CANCELED'
      when status = 'REQUIRES_APPROVAL' then 'CREATED'
      else coalesce(lifecycle_state, 'CREATED')
    end
    where lifecycle_state is null
      or lifecycle_state not in ('CREATED','QUEUED','RUNNING','SUCCEEDED','FAILED','CANCELED');
  `);

  await db.execute(sql`
    create table if not exists action_results (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      action_request_id int not null references action_requests(id) on delete cascade,
      result jsonb not null default '{}'::jsonb,
      error jsonb,
      created_at timestamptz not null default now()
    );
  `);

  await db.execute(sql`
    create index if not exists action_results_tenant_idx
      on action_results (tenant_id, created_at desc);
  `);

  await db.execute(sql`
    create index if not exists action_results_request_idx
      on action_results (action_request_id, created_at desc);
  `);

  await db.execute(sql`
    create table if not exists action_receipts (
      id text primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      action_run_id int not null references action_requests(id) on delete cascade,
      receipt_type text not null,
      entity_type text,
      entity_ids_json jsonb default '[]'::jsonb,
      affected_rows int,
      before_hash text,
      after_hash text,
      external_ref text,
      evidence_url text,
      created_at timestamptz not null default now()
    );
  `);

  await db.execute(sql`
    create index if not exists action_receipts_tenant_created_idx
      on action_receipts (tenant_id, created_at desc);
  `);

  await db.execute(sql`
    create index if not exists action_receipts_action_run_idx
      on action_receipts (action_run_id, created_at desc);
  `);

  await db.execute(sql`
    create table if not exists action_events (
      id serial primary key,
      action_id int not null references action_requests(id) on delete cascade,
      correlation_id text,
      event_type text not null,
      payload_json jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
  `);

  await db.execute(sql`
    create index if not exists action_events_action_idx
      on action_events (action_id, created_at desc);
  `);

  await db.execute(sql`
    create index if not exists action_events_correlation_idx
      on action_events (correlation_id, created_at desc);
  `);

  await db.execute(sql`alter table messages add column if not exists tenant_id int references tenants(id) on delete set null;`);

  await db.execute(sql`
    create index if not exists messages_tenant_conversation_agent_idx
      on messages (tenant_id, conversation_id, from_agent_id, created_at desc);
  `);

  await db.execute(sql`
    create index if not exists messages_tenant_conversation_idx
      on messages (tenant_id, conversation_id, created_at desc);
  `);

  await db.execute(sql`
    create or replace function set_message_tenant_id_from_context()
    returns trigger
    language plpgsql
    as $$
    declare
      room_tenant_id int;
      from_agent_tenant_id int;
      to_agent_tenant_id int;
    begin
      if new.tenant_id is not null then
        return new;
      end if;

      if new.conversation_id is not null then
        begin
          select nullif(cr.metadata->>'tenantId', '')::int
          into room_tenant_id
          from chat_rooms cr
          where cr.conversation_id = new.conversation_id
          limit 1;
        exception when others then
          room_tenant_id := null;
        end;
      end if;

      if room_tenant_id is null and new.from_agent_id is not null then
        select a.tenant_id into from_agent_tenant_id
        from agents a
        where a.id = new.from_agent_id
        limit 1;
        room_tenant_id := from_agent_tenant_id;
      end if;

      if room_tenant_id is null and new.to_agent_id is not null then
        select a.tenant_id into to_agent_tenant_id
        from agents a
        where a.id = new.to_agent_id
        limit 1;
        room_tenant_id := to_agent_tenant_id;
      end if;

      new.tenant_id := room_tenant_id;
      return new;
    end;
    $$;
  `);

  await db.execute(sql`drop trigger if exists messages_set_tenant_id on messages;`);
  await db.execute(sql`
    create trigger messages_set_tenant_id
    before insert on messages
    for each row
    execute function set_message_tenant_id_from_context();
  `);

  await db.execute(sql`
    update messages m
    set tenant_id = nullif(cr.metadata->>'tenantId', '')::int
    from chat_rooms cr
    where m.tenant_id is null
      and m.conversation_id = cr.conversation_id
      and nullif(cr.metadata->>'tenantId', '') is not null;
  `);

  await db.execute(sql`
    update messages m
    set tenant_id = a.tenant_id
    from agents a
    where m.tenant_id is null
      and m.from_agent_id = a.id
      and a.tenant_id is not null;
  `);

  await db.execute(sql`
    update messages m
    set tenant_id = a.tenant_id
    from agents a
    where m.tenant_id is null
      and m.to_agent_id = a.id
      and a.tenant_id is not null;
  `);

  await db.execute(sql`
    create table if not exists agent_memory (
      id serial primary key,
      agent_id int not null references agents(id) on delete cascade,
      scope text not null default 'CONVERSATION',
      tenant_id int references tenants(id) on delete cascade,
      workspace_id text,
      conversation_id text,
      memory_blob jsonb not null default '{}'::jsonb,
      updated_at timestamptz not null default now(),
      created_at timestamptz not null default now(),
      constraint agent_memory_scope_check check (scope in ('CONVERSATION','TENANT','GLOBAL')),
      constraint agent_memory_tenant_required_check check (
        (scope = 'GLOBAL' and tenant_id is null)
        or (scope <> 'GLOBAL' and tenant_id is not null)
      )
    );
  `);

  await db.execute(sql`
    create index if not exists agent_memory_tenant_conversation_agent_idx
      on agent_memory (tenant_id, conversation_id, agent_id, updated_at desc);
  `);

  await db.execute(sql`
    create index if not exists agent_memory_agent_scope_tenant_idx
      on agent_memory (agent_id, scope, tenant_id, updated_at desc);
  `);

  await db.execute(sql`
    create table if not exists conversation_membership_events (
      id bigserial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      conversation_id text not null,
      actor_user_id int references ece_users(id) on delete set null,
      actor_agent_id int references agents(id) on delete set null,
      event_type text not null,
      target_agent_id int references agents(id) on delete set null,
      target_user_id int references ece_users(id) on delete set null,
      reason_code text not null,
      reason_text text,
      related_task_id int references tasks(id) on delete set null,
      created_at timestamptz not null default now()
    );
  `);

  await db.execute(sql`
    create index if not exists conversation_membership_events_tenant_conversation_idx
      on conversation_membership_events (tenant_id, conversation_id, created_at desc);
  `);

  await db.execute(sql`
    create index if not exists conversation_membership_events_tenant_target_agent_idx
      on conversation_membership_events (tenant_id, target_agent_id, created_at desc);
  `);

  await db.execute(sql`
    create table if not exists task_progress_events (
      id bigserial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      task_id int not null references tasks(id) on delete cascade,
      actor_agent_id int references agents(id) on delete set null,
      actor_user_id int references ece_users(id) on delete set null,
      status text not null,
      evidence_json jsonb not null default '{}'::jsonb,
      notes text,
      created_at timestamptz not null default now()
    );
  `);

  await db.execute(sql`
    create index if not exists task_progress_events_tenant_task_idx
      on task_progress_events (tenant_id, task_id, created_at desc);
  `);

  await db.execute(sql`
    create index if not exists task_progress_events_tenant_status_idx
      on task_progress_events (tenant_id, status, created_at desc);
  `);

  await db.execute(sql`
    create table if not exists transcription_jobs (
      id bigserial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      user_id int references ece_users(id) on delete set null,
      status text not null,
      provider text,
      duration_ms int not null default 0,
      error_code text,
      created_at timestamptz not null default now()
    );
  `);

  await db.execute(sql`
    create index if not exists transcription_jobs_tenant_created_idx
      on transcription_jobs (tenant_id, created_at desc);
  `);

  await db.execute(sql`
    create index if not exists transcription_jobs_tenant_status_created_idx
      on transcription_jobs (tenant_id, status, created_at desc);
  `);
}
