-- Contact form messages (marketing + public inbound)
create table if not exists contact_messages (
  id serial primary key,
  tenant_id int not null references tenants(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text,
  company text,
  message text not null,
  source text,
  notify_status text not null default 'pending',
  notify_error text,
  notified_at timestamptz,
  user_agent text,
  ip text,
  created_at timestamptz not null default now()
);

create index if not exists contact_messages_tenant_created_idx
  on contact_messages (tenant_id, created_at desc);

