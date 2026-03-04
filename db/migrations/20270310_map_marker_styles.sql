do $$ begin
  if not exists (
    select 1 from pg_type where typname = 'marker_icon_type'
  ) then
    create type marker_icon_type as enum ('lucide', 'emoji', 'svg', 'image_url');
  end if;
end $$;

alter table product_categories add column if not exists map_marker_key varchar(100);
alter table sellers add column if not exists tags jsonb;
alter table sellers add column if not exists map_marker_key varchar(100);
alter table sellers add column if not exists external_seed_id varchar(120);

create table if not exists map_marker_styles (
  id serial primary key,
  tenant_id integer not null references tenants(id),
  "key" varchar(100) not null,
  label varchar(120) not null,
  icon_type marker_icon_type not null default 'emoji',
  icon_value text not null,
  color varchar(20) default '#111827',
  size integer default 28,
  z_index integer default 10,
  is_active boolean default true,
  created_at timestamp default now() not null,
  updated_at timestamp default now() not null
);

create unique index if not exists map_marker_styles_tenant_key_idx
  on map_marker_styles (tenant_id, "key");

