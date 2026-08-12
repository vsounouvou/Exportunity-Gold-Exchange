-- Read-only Google Workspace connector foundation for the Exportunity Company Brain.
-- Additive only. Existing integration, CRM, knowledge, agent, and communication tables remain authoritative.

create table if not exists company_brain_source_connectors (
  id serial primary key,
  tenant_id integer not null references tenants(id) on delete cascade,
  company_id integer references companies(id) on delete cascade,
  connection_id uuid not null references mindbase_integration_connections(id) on delete cascade,
  service text not null check (service in ('drive', 'gmail', 'contacts')),
  mode text not null default 'review_only',
  status text not null default 'connected',
  read_only boolean not null default true check (read_only = true),
  granted_scopes jsonb not null default '[]'::jsonb,
  policy jsonb not null default '{}'::jsonb,
  sync_settings jsonb not null default '{}'::jsonb,
  last_sync_at timestamptz,
  last_successful_sync_at timestamptz,
  last_error text,
  paused_at timestamptz,
  revoked_at timestamptz,
  created_by_user_id integer references ece_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists company_brain_source_connectors_tenant_service_idx
  on company_brain_source_connectors (tenant_id, service, status);
create unique index if not exists company_brain_source_connectors_connection_service_uniq
  on company_brain_source_connectors (connection_id, service);

create table if not exists company_brain_oauth_states (
  state_hash text primary key,
  tenant_id integer not null references tenants(id) on delete cascade,
  user_id integer not null references ece_users(id) on delete cascade,
  service text not null check (service in ('drive', 'gmail', 'contacts')),
  return_to text not null default '/admin/settings/integrations/google-workspace',
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists company_brain_oauth_states_tenant_expiry_idx
  on company_brain_oauth_states (tenant_id, expires_at);

create table if not exists company_brain_sync_runs (
  id serial primary key,
  tenant_id integer not null references tenants(id) on delete cascade,
  connector_id integer not null references company_brain_source_connectors(id) on delete cascade,
  service text not null check (service in ('drive', 'gmail', 'contacts')),
  trigger text not null default 'manual',
  sync_mode text not null default 'incremental',
  status text not null default 'queued',
  phase text not null default 'queued',
  counters jsonb not null default '{}'::jsonb,
  cursor_before jsonb not null default '{}'::jsonb,
  cursor_after jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  created_by_user_id integer references ece_users(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists company_brain_sync_runs_connector_created_idx
  on company_brain_sync_runs (connector_id, created_at);
create index if not exists company_brain_sync_runs_tenant_status_idx
  on company_brain_sync_runs (tenant_id, status, created_at);

create table if not exists company_brain_sync_cursors (
  id serial primary key,
  connector_id integer not null references company_brain_source_connectors(id) on delete cascade,
  cursor_type text not null,
  cursor_value text,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create unique index if not exists company_brain_sync_cursors_connector_type_uniq
  on company_brain_sync_cursors (connector_id, cursor_type);

create table if not exists company_brain_sync_dead_letters (
  id serial primary key,
  tenant_id integer not null references tenants(id) on delete cascade,
  connector_id integer not null references company_brain_source_connectors(id) on delete cascade,
  sync_run_id integer references company_brain_sync_runs(id) on delete set null,
  provider_item_id text,
  stage text not null,
  error_code text,
  error_message text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'open',
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists company_brain_sync_dead_letters_connector_status_idx
  on company_brain_sync_dead_letters (connector_id, status, created_at);

alter table company_brain_sources add column if not exists connector_id integer;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'company_brain_sources_connector_id_fkey') then
    alter table company_brain_sources
      add constraint company_brain_sources_connector_id_fkey
      foreign key (connector_id) references company_brain_source_connectors(id) on delete set null;
  end if;
end $$;
create index if not exists company_brain_sources_connector_status_idx
  on company_brain_sources (connector_id, status);

