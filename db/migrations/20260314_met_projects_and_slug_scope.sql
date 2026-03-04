do $$
begin
  if not exists (select 1 from pg_type where typname = 'met_project_status') then
    create type met_project_status as enum ('DRAFT', 'PUBLISHED', 'ARCHIVED');
  end if;
end$$;

alter table met_plans
  add column if not exists slug text;

update met_plans
set slug = trim(both '-' from regexp_replace(lower(coalesce(title, '')), '[^a-z0-9]+', '-', 'g'))
where slug is null or btrim(slug) = '';

update met_plans
set slug = 'plan-' || left(id::text, 8)
where slug is null or btrim(slug) = '';

with ranked as (
  select
    id,
    tenant_id,
    slug,
    row_number() over (partition by tenant_id, slug order by created_at asc, id asc) as rn
  from met_plans
)
update met_plans p
set slug = ranked.slug || '-' || ranked.rn::text
from ranked
where p.id = ranked.id
  and ranked.rn > 1;

alter table met_plans
  alter column slug set not null;

create unique index if not exists met_plans_tenant_slug_uniq
  on met_plans(tenant_id, slug);
create unique index if not exists met_plans_tenant_key_slug_uniq
  on met_plans(tenant_key, slug);

create unique index if not exists met_products_tenant_key_sku_uniq
  on met_products(tenant_key, sku);
create unique index if not exists met_blog_posts_tenant_key_slug_uniq
  on met_blog_posts(tenant_key, slug);

create table if not exists met_projects (
  id uuid primary key default gen_random_uuid(),
  tenant_id integer not null references tenants(id) on delete cascade,
  tenant_key text not null,
  created_by_user_id integer references ece_users(id) on delete set null,
  title text not null,
  slug text not null,
  summary text,
  description text,
  location text,
  status met_project_status not null default 'PUBLISHED',
  is_featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists met_projects_tenant_slug_uniq
  on met_projects(tenant_id, slug);
create unique index if not exists met_projects_tenant_key_slug_uniq
  on met_projects(tenant_key, slug);
create index if not exists met_projects_tenant_created_idx
  on met_projects(tenant_id, created_at desc);
create index if not exists met_projects_tenant_status_idx
  on met_projects(tenant_id, status, updated_at desc);
create index if not exists met_projects_tenant_featured_idx
  on met_projects(tenant_id, is_featured, updated_at desc);
create index if not exists met_projects_tenant_key_idx
  on met_projects(tenant_key);

create table if not exists met_project_media (
  id uuid primary key default gen_random_uuid(),
  tenant_id integer not null references tenants(id) on delete cascade,
  tenant_key text not null,
  project_id uuid not null references met_projects(id) on delete cascade,
  created_by_user_id integer references ece_users(id) on delete set null,
  asset_url text not null,
  caption text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists met_project_media_tenant_project_idx
  on met_project_media(tenant_id, project_id, sort_order);
create index if not exists met_project_media_tenant_key_idx
  on met_project_media(tenant_key);

