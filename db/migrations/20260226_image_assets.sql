-- Image asset management tables
create table if not exists image_assets (
  id uuid primary key default gen_random_uuid(),
  namespace text not null,
  asset_key text not null,
  label text,
  active_image_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(namespace, asset_key)
);

create table if not exists generated_images (
  id uuid primary key default gen_random_uuid(),
  namespace text not null,
  asset_key text not null,
  model text not null,
  prompt text not null,
  negative_prompt text,
  input jsonb not null,
  prompt_hash text not null,
  status text not null,
  replicate_prediction_id text,
  source_url text,
  stored_url text,
  width int,
  height int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  error text
);

create index if not exists generated_images_lookup
  on generated_images (namespace, asset_key, prompt_hash);

create index if not exists generated_images_latest
  on generated_images (namespace, asset_key, created_at desc);
