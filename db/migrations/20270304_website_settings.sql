create table if not exists website_settings (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  key text not null,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text
);

create unique index if not exists website_settings_scope_key_idx
  on website_settings (scope, key);
