create table if not exists mindbase_profile_drafts (
  id uuid primary key default gen_random_uuid(),
  tenant_id integer not null references tenants(id) on delete cascade,
  user_id integer not null references ece_users(id) on delete cascade,
  conversation_id text not null,
  message_count integer not null default 0,
  messages_json jsonb not null default '[]'::jsonb,
  extracted_json jsonb not null default '{}'::jsonb,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists mindbase_profile_drafts_tenant_user_conversation_unique
  on mindbase_profile_drafts(tenant_id, user_id, conversation_id);

create index if not exists mindbase_profile_drafts_tenant_user_updated_idx
  on mindbase_profile_drafts(tenant_id, user_id, updated_at);
