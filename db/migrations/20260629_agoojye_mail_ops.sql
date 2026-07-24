create table if not exists agoojye_mail_threads (
  id serial primary key,
  tenant_id integer not null references tenants(id) on delete cascade,
  provider_thread_id text,
  mailbox_identity_id integer references agoojye_email_identities(id) on delete set null,
  organization_id integer references agoojye_crm_organizations(id) on delete set null,
  contact_id integer references agoojye_crm_contacts(id) on delete set null,
  opportunity_id integer references agoojye_sponsor_opportunities(id) on delete set null,
  assigned_to integer references agoojye_project_users(id) on delete set null,
  direction text not null default 'inbound',
  subject text not null default '(Sans sujet)',
  status text not null default 'open',
  source text not null default 'manual',
  last_message_at timestamptz,
  tags jsonb not null default '[]'::jsonb,
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists agoojye_mail_threads_tenant_provider_uidx on agoojye_mail_threads(tenant_id, provider_thread_id);
create index if not exists agoojye_mail_threads_tenant_status_idx on agoojye_mail_threads(tenant_id, status, last_message_at);
create index if not exists agoojye_mail_threads_tenant_opportunity_idx on agoojye_mail_threads(tenant_id, opportunity_id);

create table if not exists agoojye_mail_messages (
  id serial primary key,
  tenant_id integer not null references tenants(id) on delete cascade,
  thread_id integer not null references agoojye_mail_threads(id) on delete cascade,
  provider_message_id text,
  message_id_header text,
  in_reply_to text,
  references_header text,
  from_email text,
  to_emails jsonb not null default '[]'::jsonb,
  cc_emails jsonb not null default '[]'::jsonb,
  subject text not null default '(Sans sujet)',
  body_text text,
  body_preview text,
  direction text not null default 'inbound',
  delivery_status text not null default 'received',
  received_at timestamptz,
  sent_at timestamptz,
  attachment_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists agoojye_mail_messages_tenant_provider_uidx on agoojye_mail_messages(tenant_id, provider_message_id);
create index if not exists agoojye_mail_messages_tenant_thread_idx on agoojye_mail_messages(tenant_id, thread_id, created_at);
create index if not exists agoojye_mail_messages_tenant_direction_idx on agoojye_mail_messages(tenant_id, direction, created_at);

create table if not exists agoojye_outreach_sequences (
  id serial primary key,
  tenant_id integer not null references tenants(id) on delete cascade,
  name text not null,
  sponsor_category_id integer references agoojye_sponsor_categories(id) on delete set null,
  owner_user_id integer references agoojye_project_users(id) on delete set null,
  status text not null default 'draft',
  template_ids jsonb not null default '[]'::jsonb,
  max_steps integer not null default 3,
  min_delay_hours integer not null default 72,
  daily_limit integer not null default 10,
  business_hours text,
  stop_on_reply boolean not null default true,
  stop_on_bounce boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists agoojye_outreach_sequences_tenant_name_uidx on agoojye_outreach_sequences(tenant_id, name);
create index if not exists agoojye_outreach_sequences_tenant_status_idx on agoojye_outreach_sequences(tenant_id, status);

create table if not exists agoojye_import_batches (
  id serial primary key,
  tenant_id integer not null references tenants(id) on delete cascade,
  file_name text not null,
  source_type text not null default 'csv',
  target_resource text not null default 'organizations',
  status text not null default 'draft',
  row_count integer not null default 0,
  imported_count integer not null default 0,
  skipped_count integer not null default 0,
  duplicate_count integer not null default 0,
  warnings jsonb not null default '{}'::jsonb,
  mapping_json jsonb not null default '{}'::jsonb,
  rollback_notes text,
  created_by text,
  confirmed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agoojye_import_batches_tenant_status_idx on agoojye_import_batches(tenant_id, status, created_at);
create index if not exists agoojye_import_batches_tenant_target_idx on agoojye_import_batches(tenant_id, target_resource);

create table if not exists agoojye_agent_research_records (
  id serial primary key,
  tenant_id integer not null references tenants(id) on delete cascade,
  organization_id integer references agoojye_crm_organizations(id) on delete set null,
  contact_id integer references agoojye_crm_contacts(id) on delete set null,
  opportunity_id integer references agoojye_sponsor_opportunities(id) on delete set null,
  requested_by_user_id integer references agoojye_project_users(id) on delete set null,
  approval_id integer references agoojye_outreach_approvals(id) on delete set null,
  research_status text not null default 'draft',
  source_urls jsonb not null default '[]'::jsonb,
  summary text,
  sponsor_category_guess text,
  relevance_score integer not null default 0,
  confidence_score integer not null default 0,
  recommended_template_id integer references agoojye_email_templates(id) on delete set null,
  recommended_toolbox_asset_ids jsonb not null default '[]'::jsonb,
  draft_subject text,
  draft_body text,
  guardrail_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agoojye_agent_research_tenant_status_idx on agoojye_agent_research_records(tenant_id, research_status, created_at);
create index if not exists agoojye_agent_research_tenant_opportunity_idx on agoojye_agent_research_records(tenant_id, opportunity_id);

create table if not exists agoojye_background_jobs (
  id serial primary key,
  tenant_id integer not null references tenants(id) on delete cascade,
  job_type text not null,
  status text not null default 'queued',
  attempt_count integer not null default 0,
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  error text,
  related_entity_type text,
  related_entity_id integer,
  created_by text,
  payload_json jsonb not null default '{}'::jsonb,
  result_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agoojye_background_jobs_tenant_status_idx on agoojye_background_jobs(tenant_id, status, scheduled_at);
create index if not exists agoojye_background_jobs_tenant_type_idx on agoojye_background_jobs(tenant_id, job_type, created_at);
