-- Conversation governance + agent accountability
-- Adds tenant-scoped membership audit and task progress evidence.

create table if not exists conversation_membership_events (
  id bigserial primary key,
  tenant_id int not null references tenants(id) on delete cascade,
  conversation_id text not null,
  actor_user_id int references ece_users(id) on delete set null,
  actor_agent_id int references agents(id) on delete set null,
  event_type text not null check (event_type in ('ADD_MEMBER', 'REMOVE_MEMBER', 'ROLE_CHANGE')),
  target_agent_id int references agents(id) on delete set null,
  target_user_id int references ece_users(id) on delete set null,
  reason_code text not null check (reason_code in ('MANUAL_INVITE', 'TASK_ASSIGNED', 'ESCALATION', 'WATCHER', 'SYSTEM_DEFAULT')),
  reason_text text,
  related_task_id int references tasks(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists conversation_membership_events_tenant_conversation_idx
  on conversation_membership_events (tenant_id, conversation_id, created_at desc);

create index if not exists conversation_membership_events_tenant_target_agent_idx
  on conversation_membership_events (tenant_id, target_agent_id, created_at desc);

create table if not exists task_progress_events (
  id bigserial primary key,
  tenant_id int not null references tenants(id) on delete cascade,
  task_id int not null references tasks(id) on delete cascade,
  actor_agent_id int references agents(id) on delete set null,
  actor_user_id int references ece_users(id) on delete set null,
  status text not null check (status in ('ATTEMPTED', 'PROGRESSED', 'DONE', 'BLOCKED', 'NEEDS_APPROVAL')),
  evidence_json jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists task_progress_events_tenant_task_idx
  on task_progress_events (tenant_id, task_id, created_at desc);

create index if not exists task_progress_events_tenant_status_idx
  on task_progress_events (tenant_id, status, created_at desc);
