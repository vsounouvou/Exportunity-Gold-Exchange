create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'met_lead_source') then
    create type met_lead_source as enum ('WEB_FORM', 'WHATSAPP', 'ADMIN_MANUAL');
  end if;
  if not exists (select 1 from pg_type where typname = 'met_lead_intent') then
    create type met_lead_intent as enum ('BUILD_HOUSE', 'BUY_BRICKS', 'VISIT_MODEL', 'INFO');
  end if;
  if not exists (select 1 from pg_type where typname = 'met_lead_status') then
    create type met_lead_status as enum ('NEW', 'CONTACTED', 'QUALIFIED', 'WON', 'LOST');
  end if;
  if not exists (select 1 from pg_type where typname = 'met_product_unit') then
    create type met_product_unit as enum ('PIECE', 'PALLET');
  end if;
  if not exists (select 1 from pg_type where typname = 'met_order_type') then
    create type met_order_type as enum ('BRICKS');
  end if;
  if not exists (select 1 from pg_type where typname = 'met_order_status') then
    create type met_order_status as enum ('DRAFT', 'SUBMITTED', 'CONFIRMED', 'IN_PRODUCTION', 'SHIPPED', 'DELIVERED', 'CANCELLED');
  end if;
  if not exists (select 1 from pg_type where typname = 'met_estimate_status') then
    create type met_estimate_status as enum ('NEW', 'REVIEWING', 'SENT', 'CLOSED');
  end if;
end$$;

create table if not exists met_leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id integer not null references tenants(id) on delete cascade,
  tenant_key text not null,
  created_by_user_id integer references ece_users(id) on delete set null,
  name text not null,
  phone text not null,
  email text,
  city text not null,
  country text,
  source met_lead_source not null default 'WEB_FORM',
  intent met_lead_intent not null default 'INFO',
  message text,
  internal_notes text,
  status met_lead_status not null default 'NEW',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists met_leads_tenant_created_idx on met_leads(tenant_id, created_at desc);
create index if not exists met_leads_tenant_status_idx on met_leads(tenant_id, status, created_at desc);
create index if not exists met_leads_tenant_key_idx on met_leads(tenant_key);

create table if not exists met_products (
  id uuid primary key default gen_random_uuid(),
  tenant_id integer not null references tenants(id) on delete cascade,
  tenant_key text not null,
  created_by_user_id integer references ece_users(id) on delete set null,
  name text not null,
  sku text not null,
  description text,
  dimensions_mm jsonb not null default '{}'::jsonb,
  compressive_strength_mpa numeric(8,2),
  price_cfa integer not null default 0,
  unit met_product_unit not null default 'PIECE',
  pieces_per_pallet integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists met_products_tenant_sku_uniq on met_products(tenant_id, sku);
create index if not exists met_products_tenant_created_idx on met_products(tenant_id, created_at desc);
create index if not exists met_products_tenant_active_idx on met_products(tenant_id, is_active, updated_at desc);
create index if not exists met_products_tenant_key_idx on met_products(tenant_key);

create table if not exists met_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id integer not null references tenants(id) on delete cascade,
  tenant_key text not null,
  lead_id uuid references met_leads(id) on delete set null,
  created_by_user_id integer references ece_users(id) on delete set null,
  order_type met_order_type not null default 'BRICKS',
  status met_order_status not null default 'DRAFT',
  delivery_address text,
  city text,
  distance_km numeric(10,2),
  delivery_fee_cfa integer,
  subtotal_cfa integer,
  total_cfa integer,
  notes text,
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists met_orders_tenant_created_idx on met_orders(tenant_id, created_at desc);
create index if not exists met_orders_tenant_status_idx on met_orders(tenant_id, status, created_at desc);
create index if not exists met_orders_tenant_key_idx on met_orders(tenant_key);

create table if not exists met_order_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id integer not null references tenants(id) on delete cascade,
  tenant_key text not null,
  order_id uuid not null references met_orders(id) on delete cascade,
  product_id uuid not null references met_products(id) on delete restrict,
  quantity_pieces integer,
  quantity_pallets integer,
  unit_price_cfa integer not null default 0,
  total_cfa integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists met_order_items_tenant_order_idx on met_order_items(tenant_id, order_id);
create index if not exists met_order_items_tenant_key_idx on met_order_items(tenant_key);

create table if not exists met_estimate_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id integer not null references tenants(id) on delete cascade,
  tenant_key text not null,
  lead_id uuid references met_leads(id) on delete set null,
  created_by_user_id integer references ece_users(id) on delete set null,
  project_city text not null,
  land_size_m2 numeric(10,2),
  floors integer,
  rooms integer,
  budget_cfa integer,
  timeline text,
  brief text,
  plan_file_url text,
  status met_estimate_status not null default 'NEW',
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists met_estimates_tenant_created_idx on met_estimate_requests(tenant_id, created_at desc);
create index if not exists met_estimates_tenant_status_idx on met_estimate_requests(tenant_id, status, created_at desc);
create index if not exists met_estimates_tenant_key_idx on met_estimate_requests(tenant_key);

create table if not exists met_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id integer not null references tenants(id) on delete cascade,
  tenant_key text not null,
  created_by_user_id integer references ece_users(id) on delete set null,
  title text not null,
  description text,
  bedrooms integer,
  bathrooms integer,
  floors integer,
  area_m2 numeric(10,2),
  tags jsonb not null default '[]'::jsonb,
  thumbnail_url text,
  file_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists met_plans_tenant_created_idx on met_plans(tenant_id, created_at desc);
create index if not exists met_plans_tenant_active_idx on met_plans(tenant_id, is_active, updated_at desc);
create index if not exists met_plans_tenant_key_idx on met_plans(tenant_key);

create table if not exists met_blog_posts (
  id uuid primary key default gen_random_uuid(),
  tenant_id integer not null references tenants(id) on delete cascade,
  tenant_key text not null,
  created_by_user_id integer references ece_users(id) on delete set null,
  slug text not null,
  title text not null,
  excerpt text,
  content_markdown text,
  cover_image_url text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists met_blog_posts_tenant_slug_uniq on met_blog_posts(tenant_id, slug);
create index if not exists met_blog_posts_tenant_created_idx on met_blog_posts(tenant_id, created_at desc);
create index if not exists met_blog_posts_tenant_published_idx on met_blog_posts(tenant_id, published_at desc);
create index if not exists met_blog_posts_tenant_key_idx on met_blog_posts(tenant_key);

create table if not exists met_settings (
  id uuid primary key default gen_random_uuid(),
  tenant_id integer not null references tenants(id) on delete cascade,
  tenant_key text not null,
  created_by_user_id integer references ece_users(id) on delete set null,
  key text not null,
  value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists met_settings_tenant_key_name_uniq on met_settings(tenant_id, key);
create index if not exists met_settings_tenant_created_idx on met_settings(tenant_id, created_at desc);
create index if not exists met_settings_tenant_key_idx on met_settings(tenant_key);
