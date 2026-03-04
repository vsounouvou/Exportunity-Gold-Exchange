-- Internal Mail Engine (per-tenant agent mailboxes)
-- App DB only: indexes Maildir + exposes admin UI.
-- Mail server (Postfix/Dovecot/Rspamd) uses a separate "mail" DB (see docs).

create table if not exists agent_mailboxes (
  id serial primary key,
  tenant_id int not null references tenants(id) on delete cascade,
  agent_key text not null,
  email text not null,
  mail_user_id int,
  quota_mb int not null default 2048,
  daily_outbound_limit int not null default 0,
  approval_required boolean not null default false,
  is_enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists agent_mailboxes_tenant_agent_idx
  on agent_mailboxes (tenant_id, agent_key);

create unique index if not exists agent_mailboxes_email_idx
  on agent_mailboxes (email);

create index if not exists agent_mailboxes_tenant_created_idx
  on agent_mailboxes (tenant_id, created_at desc);

create table if not exists email_threads (
  id serial primary key,
  tenant_id int not null references tenants(id) on delete cascade,
  agent_key text not null,
  mailbox_id int not null references agent_mailboxes(id) on delete cascade,
  subject_norm text not null,
  subject text,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists email_threads_mailbox_subject_idx
  on email_threads (mailbox_id, subject_norm);

create index if not exists email_threads_mailbox_last_idx
  on email_threads (mailbox_id, last_message_at desc);

create index if not exists email_threads_tenant_last_idx
  on email_threads (tenant_id, last_message_at desc);

create table if not exists email_messages (
  id serial primary key,
  tenant_id int not null references tenants(id) on delete cascade,
  agent_key text not null,
  mailbox_id int not null references agent_mailboxes(id) on delete cascade,
  thread_id int references email_threads(id) on delete set null,
  direction text not null,
  status text not null,
  from_email text not null,
  to_json jsonb not null default '[]'::jsonb,
  cc_json jsonb not null default '[]'::jsonb,
  subject text,
  text_body text,
  html_body text,
  message_id text,
  in_reply_to text,
  references_json jsonb not null default '[]'::jsonb,
  maildir_path text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists email_messages_mailbox_message_id_idx
  on email_messages (mailbox_id, message_id);

create index if not exists email_messages_thread_created_idx
  on email_messages (thread_id, created_at asc);

create index if not exists email_messages_mailbox_created_idx
  on email_messages (mailbox_id, created_at desc);

create table if not exists email_attachments_meta (
  id serial primary key,
  tenant_id int not null references tenants(id) on delete cascade,
  message_id int not null references email_messages(id) on delete cascade,
  filename text not null,
  mime_type text not null,
  size_bytes int not null default 0,
  maildir_path text,
  created_at timestamptz not null default now()
);

create index if not exists email_attachments_message_idx
  on email_attachments_meta (message_id);

create index if not exists email_attachments_tenant_created_idx
  on email_attachments_meta (tenant_id, created_at desc);

create table if not exists email_events (
  id serial primary key,
  tenant_id int not null references tenants(id) on delete cascade,
  agent_key text not null,
  mailbox_id int not null references agent_mailboxes(id) on delete cascade,
  event_type text not null,
  event_at timestamptz not null default now(),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists email_events_mailbox_event_idx
  on email_events (mailbox_id, event_at desc);

create index if not exists email_events_tenant_event_idx
  on email_events (tenant_id, event_at desc);

