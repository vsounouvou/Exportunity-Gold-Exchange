do $$
begin
  if not exists (select 1 from pg_type where typname = 'marketing_record_status') then
    create type marketing_record_status as enum ('draft', 'published', 'archived');
  end if;
  if not exists (select 1 from pg_type where typname = 'marketing_media_type') then
    create type marketing_media_type as enum ('article', 'video', 'profile', 'press_release', 'podcast', 'post');
  end if;
  if not exists (select 1 from pg_type where typname = 'marketing_media_status') then
    create type marketing_media_status as enum ('discovered', 'reviewed', 'published', 'rejected');
  end if;
end
$$;

create table if not exists marketing_posts (
  id serial primary key,
  tenant_id int not null references tenants(id) on delete cascade,
  slug text not null,
  title text not null,
  excerpt text,
  content_markdown text,
  content_html text,
  cover_image_local text,
  tags jsonb not null default '[]'::jsonb,
  external_url text,
  status marketing_record_status not null default 'draft',
  sort_order int not null default 0,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists marketing_posts_tenant_slug_uniq on marketing_posts (tenant_id, slug);
create index if not exists marketing_posts_tenant_status_idx on marketing_posts (tenant_id, status, sort_order);
create index if not exists marketing_posts_tenant_published_idx on marketing_posts (tenant_id, published_at desc);

create table if not exists marketing_press (
  id serial primary key,
  tenant_id int not null references tenants(id) on delete cascade,
  slug text not null,
  title text not null,
  outlet text,
  excerpt text,
  external_url text,
  thumbnail_local text,
  tags jsonb not null default '[]'::jsonb,
  status marketing_record_status not null default 'draft',
  sort_order int not null default 0,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists marketing_press_tenant_slug_uniq on marketing_press (tenant_id, slug);
create index if not exists marketing_press_tenant_status_idx on marketing_press (tenant_id, status, sort_order);
create index if not exists marketing_press_tenant_published_idx on marketing_press (tenant_id, published_at desc);

create table if not exists marketing_library (
  id serial primary key,
  tenant_id int not null references tenants(id) on delete cascade,
  slug text not null,
  title text not null,
  description text,
  category text,
  language text,
  duration text,
  external_url text,
  embed_url text,
  thumbnail_local text,
  tags jsonb not null default '[]'::jsonb,
  status marketing_record_status not null default 'draft',
  sort_order int not null default 0,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists marketing_library_tenant_slug_uniq on marketing_library (tenant_id, slug);
create index if not exists marketing_library_tenant_status_idx on marketing_library (tenant_id, status, sort_order);
create index if not exists marketing_library_tenant_published_idx on marketing_library (tenant_id, published_at desc);

create table if not exists marketing_assets (
  id serial primary key,
  tenant_id int not null references tenants(id) on delete cascade,
  key text not null,
  title text,
  local_path text not null,
  mime_type text,
  size_bytes int,
  source_url text,
  tags jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists marketing_assets_tenant_key_uniq on marketing_assets (tenant_id, key);
create index if not exists marketing_assets_tenant_created_idx on marketing_assets (tenant_id, created_at desc);

create table if not exists marketing_media_runs (
  id text primary key,
  tenant_id int not null references tenants(id) on delete cascade,
  status text not null default 'running',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  limited_mode text not null default 'false',
  stats jsonb not null default '{}'::jsonb,
  errors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists marketing_media_runs_tenant_started_idx on marketing_media_runs (tenant_id, started_at desc);

create table if not exists marketing_media_sources (
  id serial primary key,
  tenant_id int not null references tenants(id) on delete cascade,
  provider text not null,
  query text not null,
  run_id text references marketing_media_runs(id) on delete set null,
  fetched_at timestamptz not null default now(),
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists marketing_media_sources_tenant_run_idx on marketing_media_sources (tenant_id, run_id);
create index if not exists marketing_media_sources_tenant_provider_idx on marketing_media_sources (tenant_id, provider);

create table if not exists marketing_media_items (
  id text primary key,
  tenant_id int not null references tenants(id) on delete cascade,
  type marketing_media_type not null default 'article',
  title text not null,
  outlet text,
  url text not null,
  canonical_url text,
  published_at timestamptz,
  language text,
  excerpt text,
  summary_bullets jsonb not null default '[]'::jsonb,
  summary_paragraph text,
  summary_quality text not null default 'low',
  tags jsonb not null default '[]'::jsonb,
  thumbnail_remote_url text,
  thumbnail_local_path text,
  media_embed_url text,
  author text,
  source_queries jsonb not null default '[]'::jsonb,
  relevance_score real not null default 0,
  confidence_score real not null default 0,
  duplicate_of text,
  status marketing_media_status not null default 'discovered',
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists marketing_media_items_tenant_url_uniq on marketing_media_items (tenant_id, url);
create unique index if not exists marketing_media_items_tenant_canonical_uniq on marketing_media_items (tenant_id, canonical_url);
create index if not exists marketing_media_items_tenant_status_idx on marketing_media_items (tenant_id, status, published_at desc);
create index if not exists marketing_media_items_tenant_type_idx on marketing_media_items (tenant_id, type, published_at desc);
create index if not exists marketing_media_items_tenant_created_idx on marketing_media_items (tenant_id, created_at desc);
