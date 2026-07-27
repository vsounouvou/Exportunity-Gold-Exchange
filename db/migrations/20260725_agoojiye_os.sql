alter table agoojye_project_users
  add column if not exists auth_user_id integer references ece_users(id) on delete set null,
  add column if not exists manager_user_id integer,
  add column if not exists employment_type text not null default 'employee',
  add column if not exists responsibilities jsonb not null default '[]'::jsonb,
  add column if not exists availability text not null default 'available',
  add column if not exists onboarding_progress integer not null default 0,
  add column if not exists access_level integer not null default 2,
  add column if not exists permissions jsonb not null default '[]'::jsonb,
  add column if not exists start_date timestamptz;

create unique index if not exists agoojye_project_users_tenant_auth_user_uidx
  on agoojye_project_users (tenant_id, auth_user_id)
  where auth_user_id is not null;

create table if not exists agoojye_os_invitations (
  id serial primary key,
  tenant_id integer not null references tenants(id) on delete cascade,
  token_hash text not null,
  label text not null default 'Invitation équipe AGOOJIYE',
  allowed_emails jsonb not null default '[]'::jsonb,
  default_role text not null default 'Membre AGOOJIYE',
  default_team_id integer references agoojye_teams(id) on delete set null,
  max_uses integer not null default 1,
  use_count integer not null default 0,
  status text not null default 'active',
  expires_at timestamptz not null,
  created_by integer references ece_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists agoojye_os_invitations_token_uidx on agoojye_os_invitations(token_hash);
create index if not exists agoojye_os_invitations_tenant_status_idx on agoojye_os_invitations(tenant_id, status);

create table if not exists agoojye_os_projects (
  id serial primary key,
  tenant_id integer not null references tenants(id) on delete cascade,
  name text not null,
  slug text not null,
  objective text not null,
  owner_user_id integer references agoojye_project_users(id) on delete set null,
  team_id integer references agoojye_teams(id) on delete set null,
  status text not null default 'active',
  progress integer not null default 0 check (progress between 0 and 100),
  deadline timestamptz,
  budget integer,
  currency text not null default 'XOF',
  confidentiality integer not null default 2 check (confidentiality between 1 and 6),
  risks jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists agoojye_os_projects_tenant_slug_uidx on agoojye_os_projects(tenant_id, slug);
create index if not exists agoojye_os_projects_tenant_status_idx on agoojye_os_projects(tenant_id, status);
create index if not exists agoojye_os_projects_tenant_team_idx on agoojye_os_projects(tenant_id, team_id);

create table if not exists agoojye_os_project_members (
  id serial primary key,
  tenant_id integer not null references tenants(id) on delete cascade,
  project_id integer not null references agoojye_os_projects(id) on delete cascade,
  user_id integer not null references agoojye_project_users(id) on delete cascade,
  role text not null default 'contributor',
  created_at timestamptz not null default now()
);
create unique index if not exists agoojye_os_project_members_uidx on agoojye_os_project_members(project_id, user_id);
create index if not exists agoojye_os_project_members_tenant_user_idx on agoojye_os_project_members(tenant_id, user_id);

create table if not exists agoojye_os_channels (
  id serial primary key,
  tenant_id integer not null references tenants(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  channel_type text not null default 'group',
  team_id integer references agoojye_teams(id) on delete set null,
  project_id integer references agoojye_os_projects(id) on delete set null,
  confidentiality integer not null default 2 check (confidentiality between 1 and 6),
  status text not null default 'active',
  created_by integer references agoojye_project_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists agoojye_os_channels_tenant_slug_uidx on agoojye_os_channels(tenant_id, slug);
create index if not exists agoojye_os_channels_tenant_status_idx on agoojye_os_channels(tenant_id, status);

create table if not exists agoojye_os_channel_members (
  id serial primary key,
  tenant_id integer not null references tenants(id) on delete cascade,
  channel_id integer not null references agoojye_os_channels(id) on delete cascade,
  user_id integer not null references agoojye_project_users(id) on delete cascade,
  role text not null default 'member',
  last_read_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists agoojye_os_channel_members_uidx on agoojye_os_channel_members(channel_id, user_id);
create index if not exists agoojye_os_channel_members_tenant_user_idx on agoojye_os_channel_members(tenant_id, user_id);

create table if not exists agoojye_os_messages (
  id serial primary key,
  tenant_id integer not null references tenants(id) on delete cascade,
  channel_id integer not null references agoojye_os_channels(id) on delete cascade,
  sender_user_id integer references agoojye_project_users(id) on delete set null,
  body text not null,
  message_type text not null default 'text',
  reply_to_message_id integer,
  attachments jsonb not null default '[]'::jsonb,
  reactions jsonb not null default '{}'::jsonb,
  pinned_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agoojye_os_messages_channel_created_idx on agoojye_os_messages(channel_id, created_at);
create index if not exists agoojye_os_messages_tenant_created_idx on agoojye_os_messages(tenant_id, created_at);

create table if not exists agoojye_os_meetings (
  id serial primary key,
  tenant_id integer not null references tenants(id) on delete cascade,
  title text not null,
  agenda text,
  project_id integer references agoojye_os_projects(id) on delete set null,
  organizer_user_id integer references agoojye_project_users(id) on delete set null,
  participant_user_ids jsonb not null default '[]'::jsonb,
  starts_at timestamptz not null,
  ends_at timestamptz,
  video_url text,
  notes text,
  summary text,
  status text not null default 'scheduled',
  confidentiality integer not null default 2 check (confidentiality between 1 and 6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agoojye_os_meetings_tenant_start_idx on agoojye_os_meetings(tenant_id, starts_at);

create table if not exists agoojye_os_decisions (
  id serial primary key,
  tenant_id integer not null references tenants(id) on delete cascade,
  project_id integer references agoojye_os_projects(id) on delete set null,
  meeting_id integer references agoojye_os_meetings(id) on delete set null,
  decision text not null,
  context text,
  options_considered jsonb not null default '[]'::jsonb,
  decision_maker_user_id integer references agoojye_project_users(id) on delete set null,
  participant_user_ids jsonb not null default '[]'::jsonb,
  consequences text,
  assigned_actions jsonb not null default '[]'::jsonb,
  review_date timestamptz,
  status text not null default 'recorded',
  confidentiality integer not null default 3 check (confidentiality between 1 and 6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agoojye_os_decisions_tenant_created_idx on agoojye_os_decisions(tenant_id, created_at);
create index if not exists agoojye_os_decisions_tenant_status_idx on agoojye_os_decisions(tenant_id, status);

create table if not exists agoojye_os_notifications (
  id serial primary key,
  tenant_id integer not null references tenants(id) on delete cascade,
  user_id integer not null references agoojye_project_users(id) on delete cascade,
  type text not null default 'info',
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists agoojye_os_notifications_user_created_idx on agoojye_os_notifications(user_id, created_at);
create index if not exists agoojye_os_notifications_tenant_user_idx on agoojye_os_notifications(tenant_id, user_id);

create table if not exists agoojye_os_push_subscriptions (
  id serial primary key,
  tenant_id integer not null references tenants(id) on delete cascade,
  auth_user_id integer not null references ece_users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists agoojye_os_push_subscriptions_endpoint_uidx on agoojye_os_push_subscriptions(endpoint);
create index if not exists agoojye_os_push_subscriptions_tenant_user_idx on agoojye_os_push_subscriptions(tenant_id, auth_user_id);
