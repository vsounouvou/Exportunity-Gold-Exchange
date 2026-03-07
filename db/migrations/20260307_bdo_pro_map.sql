-- Additive migration for Bourse de l'Or Pro membership and sourcing map.
-- Safe to run multiple times.

create table if not exists pro_profiles (
  id uuid primary key,
  user_id integer not null references ece_users(id) on delete cascade,
  tenant_id integer not null references tenants(id) on delete cascade,
  role text not null,
  company_name text,
  country text,
  verification_status text not null default 'pending',
  membership_tier text not null default 'free',
  can_access_map boolean not null default false,
  can_view_supply_contacts boolean not null default false,
  can_view_mine_layer boolean not null default false,
  can_view_bureau_layer boolean not null default true,
  can_view_export_layer boolean not null default false,
  created_at timestamp without time zone not null default now(),
  updated_at timestamp without time zone not null default now(),
  unique (tenant_id, user_id)
);

create table if not exists pro_map_nodes (
  id uuid primary key,
  tenant_id integer not null references tenants(id) on delete cascade,
  node_type text not null,
  name text not null,
  slug text,
  description text,
  country text,
  region text,
  city text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  verification_status text not null default 'unknown',
  is_public_to_pro boolean not null default true,
  owner_profile_id uuid references pro_profiles(id) on delete set null,
  company_name text,
  contact_name text,
  contact_phone text,
  contact_whatsapp text,
  contact_email text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamp without time zone not null default now(),
  updated_at timestamp without time zone not null default now()
);

create index if not exists pro_profiles_tenant_role_idx on pro_profiles(tenant_id, role);
create index if not exists pro_profiles_tenant_tier_idx on pro_profiles(tenant_id, membership_tier);
create unique index if not exists pro_map_nodes_tenant_slug_idx on pro_map_nodes(tenant_id, slug);
create index if not exists pro_map_nodes_tenant_type_idx on pro_map_nodes(tenant_id, node_type);
