-- Add metadata and created_by columns if missing
alter table if exists image_assets add column if not exists metadata jsonb default '{}'::jsonb;
alter table if exists generated_images add column if not exists created_by text;

-- Agent keys table for agent-authenticated generation
create table if not exists agent_keys (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  key_hash text not null,
  scopes jsonb not null default '{}'::jsonb,
  rate_limit_per_day integer not null default 200,
  created_at timestamptz not null default now()
);
create unique index if not exists agent_keys_key_hash_idx on agent_keys (key_hash);
