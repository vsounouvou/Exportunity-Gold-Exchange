import { db } from "@db";
import { sql } from "drizzle-orm";

export async function ensureMarketplaceMapTables() {
  await db.execute(sql`
    do $$ begin
      if not exists (
        select 1 from pg_type where typname = 'marker_icon_type'
      ) then
        create type marker_icon_type as enum ('lucide', 'emoji', 'svg', 'image_url');
      end if;
    end $$;
  `);

  await db.execute(sql`alter table product_categories add column if not exists map_marker_key varchar(100);`);
  await db.execute(sql`alter table sellers add column if not exists tags jsonb;`);
  await db.execute(sql`alter table sellers add column if not exists map_marker_key varchar(100);`);
  await db.execute(sql`alter table sellers add column if not exists external_seed_id varchar(120);`);

  await db.execute(sql`
    create table if not exists map_marker_styles (
      id serial primary key,
      tenant_id integer not null references tenants(id),
      "key" varchar(100) not null,
      label varchar(120) not null,
      icon_type marker_icon_type not null default 'emoji',
      icon_value text not null,
      icon_asset_id uuid,
      icon_prompt text,
      locked boolean not null default false,
      color varchar(20) default '#111827',
      size integer default 28,
      z_index integer default 10,
      is_active boolean default true,
      created_at timestamp default now() not null,
      updated_at timestamp default now() not null
    );
  `);

  await db.execute(sql`alter table map_marker_styles add column if not exists icon_asset_id uuid;`);
  await db.execute(sql`alter table map_marker_styles add column if not exists icon_prompt text;`);
  await db.execute(sql`alter table map_marker_styles add column if not exists locked boolean not null default false;`);

  await db.execute(
    sql`create unique index if not exists map_marker_styles_tenant_key_idx on map_marker_styles (tenant_id, "key");`,
  );
}
