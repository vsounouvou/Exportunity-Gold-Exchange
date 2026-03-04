-- Gold Stamping + Chairman cutover patch (additive)
-- - pickup ID verification persistence fields
-- - supporting indexes for Gold Stamping audit access paths

alter table if exists stamped_gold_items
  add column if not exists pickup_id_verified boolean not null default false,
  add column if not exists pickup_id_verified_at timestamptz,
  add column if not exists pickup_id_verified_by integer references ece_users(id) on delete set null;

create index if not exists stamped_gold_items_tenant_status_minted_idx
  on stamped_gold_items (tenant_id, status, minted_at desc);

create index if not exists stamped_gold_items_tenant_sku_status_idx
  on stamped_gold_items (tenant_id, sku_id, status);

create index if not exists stamped_gold_certificates_tenant_item_idx
  on stamped_gold_certificates (tenant_id, item_id);

