-- Wallet OS - seller economy roles/limits.

create table if not exists wallet_roles (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  role text not null,
  status text not null default 'ACTIVE',
  limits jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wallet_roles_status_check check (status in ('ACTIVE', 'SUSPENDED'))
);

create unique index if not exists wallet_roles_user_role_unique
  on wallet_roles (user_id, role);

create index if not exists wallet_roles_user_idx
  on wallet_roles (user_id);

