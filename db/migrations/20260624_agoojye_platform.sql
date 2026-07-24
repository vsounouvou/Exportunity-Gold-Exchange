create table if not exists agoojye_roles (
  id serial primary key,
  tenant_id integer not null references tenants(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  permissions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists agoojye_roles_tenant_slug_uidx on agoojye_roles(tenant_id, slug);
create index if not exists agoojye_roles_tenant_idx on agoojye_roles(tenant_id);

create table if not exists agoojye_permissions (
  id serial primary key,
  tenant_id integer not null references tenants(id) on delete cascade,
  key text not null,
  label text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists agoojye_permissions_tenant_key_uidx on agoojye_permissions(tenant_id, key);

create table if not exists agoojye_teams (
  id serial primary key,
  tenant_id integer not null references tenants(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  mission text,
  lead_user_id integer,
  status text not null default 'active',
  visibility text not null default 'public',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists agoojye_teams_tenant_slug_uidx on agoojye_teams(tenant_id, slug);
create index if not exists agoojye_teams_tenant_status_idx on agoojye_teams(tenant_id, status);

create table if not exists agoojye_project_users (
  id serial primary key,
  tenant_id integer not null references tenants(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  display_name text not null,
  email text not null,
  phone text,
  role text not null default 'Participant',
  team_id integer references agoojye_teams(id) on delete set null,
  status text not null default 'Invited',
  profile_photo_url text,
  bio text,
  confirmed_role boolean not null default false,
  email_account_created boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists agoojye_project_users_tenant_email_uidx on agoojye_project_users(tenant_id, email);
create index if not exists agoojye_project_users_tenant_team_idx on agoojye_project_users(tenant_id, team_id);
create index if not exists agoojye_project_users_tenant_status_idx on agoojye_project_users(tenant_id, status);

create table if not exists agoojye_participants (
  id serial primary key,
  tenant_id integer not null references tenants(id) on delete cascade,
  user_id integer references agoojye_project_users(id) on delete cascade,
  team_id integer references agoojye_teams(id) on delete set null,
  role_title text,
  confirmed_role boolean not null default false,
  participant_type text not null default 'student',
  bio text,
  skills jsonb not null default '[]'::jsonb,
  phone text,
  school_or_company text,
  status text not null default 'Pending',
  email_identity_id integer,
  certificate_eligible boolean not null default false,
  share_eligibility_status text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agoojye_participants_tenant_team_idx on agoojye_participants(tenant_id, team_id);
create index if not exists agoojye_participants_tenant_status_idx on agoojye_participants(tenant_id, status);

create table if not exists agoojye_email_identities (
  id serial primary key,
  tenant_id integer not null references tenants(id) on delete cascade,
  user_id integer references agoojye_project_users(id) on delete set null,
  email_address text not null,
  display_name text not null,
  email_type text not null default 'individual',
  provider text not null default 'manual',
  status text not null default 'requested',
  can_send boolean not null default true,
  can_receive boolean not null default true,
  forwarding_address text,
  created_by text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists agoojye_email_identities_tenant_email_uidx on agoojye_email_identities(tenant_id, email_address);
create index if not exists agoojye_email_identities_tenant_status_idx on agoojye_email_identities(tenant_id, status);

create table if not exists agoojye_internal_messages (
  id serial primary key,
  tenant_id integer not null references tenants(id) on delete cascade,
  sender_user_id integer references agoojye_project_users(id) on delete set null,
  team_id integer references agoojye_teams(id) on delete set null,
  subject text not null,
  body text not null,
  message_type text not null default 'direct',
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agoojye_internal_messages_tenant_created_idx on agoojye_internal_messages(tenant_id, created_at);

create table if not exists agoojye_internal_message_recipients (
  id serial primary key,
  tenant_id integer not null references tenants(id) on delete cascade,
  message_id integer not null references agoojye_internal_messages(id) on delete cascade,
  user_id integer references agoojye_project_users(id) on delete cascade,
  team_id integer references agoojye_teams(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agoojye_message_recipients_tenant_message_idx on agoojye_internal_message_recipients(tenant_id, message_id);

create table if not exists agoojye_tasks (
  id serial primary key,
  tenant_id integer not null references tenants(id) on delete cascade,
  team_id integer references agoojye_teams(id) on delete set null,
  assigned_to integer references agoojye_project_users(id) on delete set null,
  created_by integer references agoojye_project_users(id) on delete set null,
  title text not null,
  description text,
  priority text not null default 'medium',
  status text not null default 'todo',
  due_date timestamptz,
  milestone_id integer,
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agoojye_tasks_tenant_status_idx on agoojye_tasks(tenant_id, status);
create index if not exists agoojye_tasks_tenant_team_idx on agoojye_tasks(tenant_id, team_id);

create table if not exists agoojye_milestones (
  id serial primary key,
  tenant_id integer not null references tenants(id) on delete cascade,
  title text not null,
  description text,
  date timestamptz,
  status text not null default 'planned',
  owner text,
  visibility text not null default 'public',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agoojye_milestones_tenant_visibility_idx on agoojye_milestones(tenant_id, visibility, sort_order);

create table if not exists agoojye_documents (
  id serial primary key,
  tenant_id integer not null references tenants(id) on delete cascade,
  title text not null,
  description text,
  category text not null default 'Strategy',
  team_id integer references agoojye_teams(id) on delete set null,
  uploaded_by integer references agoojye_project_users(id) on delete set null,
  file_url text,
  version text not null default '1.0',
  status text not null default 'draft',
  visibility text not null default 'private',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agoojye_documents_tenant_category_idx on agoojye_documents(tenant_id, category);
create index if not exists agoojye_documents_tenant_visibility_idx on agoojye_documents(tenant_id, visibility);

create table if not exists agoojye_partners (
  id serial primary key,
  tenant_id integer not null references tenants(id) on delete cascade,
  name text not null,
  category text not null,
  status text not null default 'In discussion',
  logo_url text,
  description text,
  contact_person text,
  contact_email text,
  contact_phone text,
  website text,
  notes text,
  visibility text not null default 'public',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agoojye_partners_tenant_category_idx on agoojye_partners(tenant_id, category);
create index if not exists agoojye_partners_tenant_status_idx on agoojye_partners(tenant_id, status);

create table if not exists agoojye_sponsor_leads (
  id serial primary key,
  tenant_id integer not null references tenants(id) on delete cascade,
  company_name text not null,
  contact_person text not null,
  email text not null,
  phone text,
  interest text,
  budget_range text,
  message text,
  source text not null default 'public',
  status text not null default 'New',
  assigned_to integer references agoojye_project_users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agoojye_sponsor_leads_tenant_status_idx on agoojye_sponsor_leads(tenant_id, status, created_at);
create index if not exists agoojye_sponsor_leads_tenant_email_idx on agoojye_sponsor_leads(tenant_id, email);

create table if not exists agoojye_media_assets (
  id serial primary key,
  tenant_id integer not null references tenants(id) on delete cascade,
  title text not null,
  description text,
  media_type text not null default 'image',
  file_url text,
  thumbnail_url text,
  category text not null default 'gallery',
  status text not null default 'draft',
  visibility text not null default 'public',
  tags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agoojye_media_assets_tenant_category_idx on agoojye_media_assets(tenant_id, category);
create index if not exists agoojye_media_assets_tenant_visibility_idx on agoojye_media_assets(tenant_id, visibility);

create table if not exists agoojye_content_blocks (
  id serial primary key,
  tenant_id integer not null references tenants(id) on delete cascade,
  page text not null,
  section text not null,
  key text not null,
  title_fr text,
  title_en text,
  content_fr text,
  content_en text,
  image_url text,
  metadata_json jsonb not null default '{}'::jsonb,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists agoojye_content_blocks_tenant_key_uidx on agoojye_content_blocks(tenant_id, page, section, key);
create index if not exists agoojye_content_blocks_tenant_page_idx on agoojye_content_blocks(tenant_id, page);

create table if not exists agoojye_audit_logs (
  id serial primary key,
  tenant_id integer not null references tenants(id) on delete cascade,
  actor text,
  action text not null,
  entity_type text not null,
  entity_id integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agoojye_audit_logs_tenant_created_idx on agoojye_audit_logs(tenant_id, created_at);

create table if not exists agoojye_tenant_email_settings (
  id serial primary key,
  tenant_id integer not null references tenants(id) on delete cascade,
  smtp_host text,
  smtp_port integer,
  smtp_username text,
  smtp_password_encrypted text,
  from_name text,
  from_email text,
  reply_to_email text,
  provider_name text not null default 'manual',
  status text not null default 'not_configured',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists agoojye_email_settings_tenant_uidx on agoojye_tenant_email_settings(tenant_id);
