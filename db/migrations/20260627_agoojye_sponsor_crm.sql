create table if not exists agoojye_sponsor_categories (
  id serial primary key,
  tenant_id integer not null references tenants(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  status text not null default 'active',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists agoojye_sponsor_categories_tenant_slug_uidx on agoojye_sponsor_categories(tenant_id, slug);
create index if not exists agoojye_sponsor_categories_tenant_status_idx on agoojye_sponsor_categories(tenant_id, status, sort_order);

create table if not exists agoojye_pipeline_stages (
  id serial primary key,
  tenant_id integer not null references tenants(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  stage_group text not null default 'active',
  status text not null default 'active',
  is_terminal boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists agoojye_pipeline_stages_tenant_slug_uidx on agoojye_pipeline_stages(tenant_id, slug);
create index if not exists agoojye_pipeline_stages_tenant_order_idx on agoojye_pipeline_stages(tenant_id, status, sort_order);

create table if not exists agoojye_crm_organizations (
  id serial primary key,
  tenant_id integer not null references tenants(id) on delete cascade,
  name text not null,
  website text,
  country text,
  industry text,
  sponsor_category_id integer references agoojye_sponsor_categories(id) on delete set null,
  sponsor_category text,
  company_size text,
  public_description text,
  strategic_relevance text,
  priority text not null default 'medium',
  pipeline_stage_id integer references agoojye_pipeline_stages(id) on delete set null,
  opportunity_owner integer references agoojye_project_users(id) on delete set null,
  estimated_value text,
  currency text not null default 'XOF',
  source text not null default 'admin',
  last_activity_at timestamptz,
  next_action text,
  next_action_date timestamptz,
  internal_notes text,
  public_notes text,
  do_not_contact boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists agoojye_crm_organizations_tenant_name_uidx on agoojye_crm_organizations(tenant_id, name);
create index if not exists agoojye_crm_organizations_tenant_stage_idx on agoojye_crm_organizations(tenant_id, pipeline_stage_id);
create index if not exists agoojye_crm_organizations_tenant_category_idx on agoojye_crm_organizations(tenant_id, sponsor_category_id);

create table if not exists agoojye_crm_contacts (
  id serial primary key,
  tenant_id integer not null references tenants(id) on delete cascade,
  organization_id integer references agoojye_crm_organizations(id) on delete set null,
  first_name text,
  last_name text,
  job_title text,
  email text,
  phone text,
  country text,
  preferred_language text not null default 'fr',
  public_source_url text,
  verification_status text not null default 'unverified',
  confidence_score integer not null default 0,
  relationship_owner integer references agoojye_project_users(id) on delete set null,
  lawful_contact_note text,
  last_contacted_at timestamptz,
  last_replied_at timestamptz,
  do_not_contact boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists agoojye_crm_contacts_tenant_email_uidx on agoojye_crm_contacts(tenant_id, email);
create index if not exists agoojye_crm_contacts_tenant_org_idx on agoojye_crm_contacts(tenant_id, organization_id);
create index if not exists agoojye_crm_contacts_tenant_verification_idx on agoojye_crm_contacts(tenant_id, verification_status);

create table if not exists agoojye_sponsor_opportunities (
  id serial primary key,
  tenant_id integer not null references tenants(id) on delete cascade,
  organization_id integer not null references agoojye_crm_organizations(id) on delete cascade,
  contact_id integer references agoojye_crm_contacts(id) on delete set null,
  sponsor_category_id integer references agoojye_sponsor_categories(id) on delete set null,
  stage_id integer references agoojye_pipeline_stages(id) on delete set null,
  title text not null,
  priority text not null default 'medium',
  owner_user_id integer references agoojye_project_users(id) on delete set null,
  estimated_value text,
  currency text not null default 'XOF',
  source text not null default 'admin',
  status text not null default 'active',
  next_action text,
  next_action_date timestamptz,
  last_activity_at timestamptz,
  internal_notes text,
  public_notes text,
  do_not_contact boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists agoojye_sponsor_opportunities_tenant_title_uidx on agoojye_sponsor_opportunities(tenant_id, title);
create index if not exists agoojye_sponsor_opportunities_tenant_stage_idx on agoojye_sponsor_opportunities(tenant_id, stage_id);
create index if not exists agoojye_sponsor_opportunities_tenant_owner_idx on agoojye_sponsor_opportunities(tenant_id, owner_user_id);

create table if not exists agoojye_crm_activities (
  id serial primary key,
  tenant_id integer not null references tenants(id) on delete cascade,
  organization_id integer references agoojye_crm_organizations(id) on delete cascade,
  contact_id integer references agoojye_crm_contacts(id) on delete set null,
  opportunity_id integer references agoojye_sponsor_opportunities(id) on delete cascade,
  actor_user_id integer references agoojye_project_users(id) on delete set null,
  activity_type text not null default 'note',
  channel text not null default 'admin',
  subject text,
  body text,
  outcome text,
  due_date timestamptz,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agoojye_crm_activities_tenant_created_idx on agoojye_crm_activities(tenant_id, created_at);
create index if not exists agoojye_crm_activities_tenant_opportunity_idx on agoojye_crm_activities(tenant_id, opportunity_id);

create table if not exists agoojye_email_templates (
  id serial primary key,
  tenant_id integer not null references tenants(id) on delete cascade,
  name text not null,
  template_group text not null default 'Initial introduction',
  sponsor_category_id integer references agoojye_sponsor_categories(id) on delete set null,
  language text not null default 'fr',
  subject text not null,
  body text not null,
  sender_identity_id integer references agoojye_email_identities(id) on delete set null,
  signature text,
  status text not null default 'draft',
  version text not null default '1.0',
  approved_by text,
  approved_at timestamptz,
  variables jsonb not null default '[]'::jsonb,
  attachment_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists agoojye_email_templates_tenant_name_version_uidx on agoojye_email_templates(tenant_id, name, version);
create index if not exists agoojye_email_templates_tenant_status_idx on agoojye_email_templates(tenant_id, status);

create table if not exists agoojye_toolbox_assets (
  id serial primary key,
  tenant_id integer not null references tenants(id) on delete cascade,
  title text not null,
  category text not null default 'Core',
  sponsor_category_id integer references agoojye_sponsor_categories(id) on delete set null,
  description text,
  file_url text,
  asset_type text not null default 'document',
  status text not null default 'needed',
  version text not null default '1.0',
  tags jsonb not null default '[]'::jsonb,
  approved_claims jsonb not null default '[]'::jsonb,
  prohibited_claims jsonb not null default '[]'::jsonb,
  visibility text not null default 'admin_only',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists agoojye_toolbox_assets_tenant_title_uidx on agoojye_toolbox_assets(tenant_id, title);
create index if not exists agoojye_toolbox_assets_tenant_category_idx on agoojye_toolbox_assets(tenant_id, category);
create index if not exists agoojye_toolbox_assets_tenant_status_idx on agoojye_toolbox_assets(tenant_id, status);

create table if not exists agoojye_suppression_entries (
  id serial primary key,
  tenant_id integer not null references tenants(id) on delete cascade,
  email text not null,
  organization_id integer references agoojye_crm_organizations(id) on delete set null,
  contact_id integer references agoojye_crm_contacts(id) on delete set null,
  reason text not null,
  source text not null default 'admin',
  status text not null default 'active',
  notes text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists agoojye_suppression_entries_tenant_email_uidx on agoojye_suppression_entries(tenant_id, email);
create index if not exists agoojye_suppression_entries_tenant_status_idx on agoojye_suppression_entries(tenant_id, status);

create table if not exists agoojye_outreach_approvals (
  id serial primary key,
  tenant_id integer not null references tenants(id) on delete cascade,
  opportunity_id integer references agoojye_sponsor_opportunities(id) on delete cascade,
  contact_id integer references agoojye_crm_contacts(id) on delete set null,
  template_id integer references agoojye_email_templates(id) on delete set null,
  requester_user_id integer references agoojye_project_users(id) on delete set null,
  reviewer_user_id integer references agoojye_project_users(id) on delete set null,
  sender_identity_id integer references agoojye_email_identities(id) on delete set null,
  subject text not null,
  body text not null,
  status text not null default 'awaiting_approval',
  scheduled_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  sent_at timestamptz,
  decision_notes text,
  agent_research_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agoojye_outreach_approvals_tenant_status_idx on agoojye_outreach_approvals(tenant_id, status, created_at);
create index if not exists agoojye_outreach_approvals_tenant_opportunity_idx on agoojye_outreach_approvals(tenant_id, opportunity_id);
