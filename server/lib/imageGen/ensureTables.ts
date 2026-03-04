import { db } from "@db";
import { sql } from "drizzle-orm";

export async function ensureImageTables() {
  await db.execute(sql`
    create table if not exists image_assets (
      id uuid primary key default gen_random_uuid(),
      namespace text not null,
      asset_key text not null,
      variant text not null default 'default',
      label text,
      metadata jsonb not null default '{}'::jsonb,
      active_image_id uuid,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique(namespace, asset_key, variant)
    );
  `);

  await db.execute(sql`
    alter table image_assets
      add column if not exists metadata jsonb not null default '{}'::jsonb;
  `);

  await db.execute(sql`
    alter table image_assets
      add column if not exists variant text not null default 'default';
  `);

  await db.execute(sql`
    do $$
    begin
      if exists (
        select 1
        from pg_constraint
        where conname = 'image_assets_namespace_asset_key_key'
      ) then
        alter table image_assets drop constraint image_assets_namespace_asset_key_key;
      end if;
    end $$;
  `);

  await db.execute(sql`
    create unique index if not exists image_assets_namespace_asset_key_variant_key
      on image_assets (namespace, asset_key, variant);
  `);

  await db.execute(sql`
    create table if not exists generated_images (
      id uuid primary key default gen_random_uuid(),
      namespace text not null,
      asset_key text not null,
      variant text not null default 'default',
      model text not null,
      prompt text not null,
      negative_prompt text,
      input jsonb not null,
      prompt_hash text not null,
      content_hash text,
      status text not null,
      replicate_prediction_id text,
      source_url text,
      stored_url text,
      width int,
      height int,
      created_by text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      error text
    );
  `);

  await db.execute(sql`
    alter table generated_images
      add column if not exists created_by text;
  `);

  await db.execute(sql`
    alter table generated_images
      add column if not exists variant text not null default 'default';
  `);

  await db.execute(sql`
    alter table generated_images
      add column if not exists content_hash text;
  `);

  await db.execute(sql`
    create index if not exists generated_images_lookup
      on generated_images (namespace, asset_key, variant, prompt_hash);
  `);

  await db.execute(sql`
    create index if not exists generated_images_latest
      on generated_images (namespace, asset_key, variant, created_at desc);
  `);

  await db.execute(sql`
    create index if not exists generated_images_content_hash_idx
      on generated_images (namespace, asset_key, variant, content_hash);
  `);

  await db.execute(sql`
    create table if not exists product_images (
      id uuid primary key default gen_random_uuid(),
      tenant_id int not null references tenants(id) on delete cascade,
      product_id int not null references seller_products(id) on delete cascade,
      role text not null,
      position int not null default 0,
      label text,
      asset_namespace text not null default 'products',
      asset_key text not null,
      metadata jsonb not null default '{}'::jsonb,
      deleted_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique(tenant_id, product_id, asset_key)
    );
  `);

  await db.execute(sql`
    create index if not exists product_images_lookup
      on product_images (tenant_id, product_id, position);
  `);
}
