-- Asset Studio: variants + content-hash dedupe

-- 1) Variants on assets
alter table if exists image_assets
  add column if not exists variant text not null default 'default';

-- Drop the old uniqueness (namespace, asset_key) so variants can coexist.
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

create unique index if not exists image_assets_namespace_asset_key_variant_key
  on image_assets (namespace, asset_key, variant);

-- 2) Variants + content hash on versions
alter table if exists generated_images
  add column if not exists variant text not null default 'default';

alter table if exists generated_images
  add column if not exists content_hash text;

-- Replace existing indexes with variant-aware versions.
drop index if exists generated_images_lookup;
create index if not exists generated_images_lookup
  on generated_images (namespace, asset_key, variant, prompt_hash);

drop index if exists generated_images_latest;
create index if not exists generated_images_latest
  on generated_images (namespace, asset_key, variant, created_at desc);

create index if not exists generated_images_content_hash_idx
  on generated_images (namespace, asset_key, variant, content_hash);

