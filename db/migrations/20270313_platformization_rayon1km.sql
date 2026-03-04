-- Platformization: add rayon1km tenant + domain mappings + storefront market split defaults.

insert into tenants ("key", name, domains, theme_config, feature_flags, updated_at)
values (
  'rayon1km',
  'Rayon 1km',
  '["rayon1km.com","www.rayon1km.com","api.rayon1km.com","admin.rayon1km.com"]'::jsonb,
  '{"brand":"rayon1km","uiMode":"proximity","categoryPreset":"core_trade","defaultRadiusKm":1}'::jsonb,
  '{"module.products":true,"module.collections":true,"module.cart":true,"module.checkout":true,"module.wallet":true,"module.agents":true,"module.analytics":true,"module.map":true,"module.image_gen":true,"module.wholesale":false,"module.bulk_quotes":false,"module.suppliers":false,"multiProduct":true,"goldOnly":false}'::jsonb,
  now()
)
on conflict ("key") do update
set
  name = excluded.name,
  domains = excluded.domains,
  theme_config = excluded.theme_config,
  feature_flags = excluded.feature_flags,
  updated_at = now();

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'tenant_sites'
  ) then
    insert into tenant_sites (tenant_id, env, domain, canonical_host, default_locale, updated_at)
    select t.id, 'prod', d.domain, d.canonical_host, 'fr', now()
    from tenants t
    cross join (
      values
        ('rayon1km.com', 'rayon1km.com'),
        ('www.rayon1km.com', 'rayon1km.com'),
        ('api.rayon1km.com', 'api.rayon1km.com'),
        ('admin.rayon1km.com', 'admin.rayon1km.com')
    ) as d(domain, canonical_host)
    where t."key" = 'rayon1km'
    on conflict (tenant_id, env, domain)
    do update set
      canonical_host = excluded.canonical_host,
      updated_at = now();
  end if;
end $$;

-- Default market type on existing Exportunity products for export-first filtering.
with exportunity_tenant as (
  select id from tenants where "key" = 'exportunity' limit 1
)
update seller_products sp
set attributes = jsonb_set(coalesce(sp.attributes, '{}'::jsonb), '{marketType}', '"EXPORT_READY"', true)
from exportunity_tenant t
where sp.tenant_id = t.id
  and coalesce(sp.attributes->>'marketType', sp.attributes->>'market_type', '') = '';
