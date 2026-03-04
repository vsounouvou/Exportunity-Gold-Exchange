-- Platformization: add zogueland tenant + refresh domain mappings for multi-tenant host resolution.

insert into tenants ("key", name, domains, theme_config, feature_flags, updated_at)
values (
  'zogueland',
  'Zogueland',
  '["zogueland.com","www.zogueland.com","api.zogueland.com","admin.zogueland.com"]'::jsonb,
  '{"brand":"zogueland","uiMode":"kids","categoryPreset":"children"}'::jsonb,
  '{"module.products":true,"module.collections":true,"module.cart":true,"module.checkout":true,"module.wallet":true,"module.agents":true,"module.analytics":true,"module.map":true,"module.stories":true,"module.audio":true,"module.parent_dashboard":true,"module.child_profiles":true,"module.safe_ai_chat":true,"module.character_creator":true,"module.print_on_demand":true,"module.luxury_drops":false,"module.wholesale":false,"module.bulk_quotes":false,"multiProduct":true,"goldOnly":false}'::jsonb,
  now()
)
on conflict ("key") do update
set
  name = excluded.name,
  domains = excluded.domains,
  theme_config = excluded.theme_config,
  feature_flags = excluded.feature_flags,
  updated_at = now();

-- Keep VS canonical key but add vss alias hosts in domains.
update tenants
set
  domains = (
    select to_jsonb(array(
      select distinct d from unnest(array[
        'vitalsounouvou.com',
        'www.vitalsounouvou.com',
        'vss.vitalsounouvou.com',
        'www.vss.vitalsounouvou.com'
      ]::text[]) as d
    ))
  ),
  updated_at = now()
where "key" = 'vs';

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public' and table_name = 'tenant_sites'
  ) then
    insert into tenant_sites (tenant_id, env, domain, canonical_host, default_locale, updated_at)
    select t.id, 'prod', d.domain, d.canonical_host, 'en', now()
    from tenants t
    cross join (
      values
        ('zogueland.com', 'zogueland.com'),
        ('www.zogueland.com', 'zogueland.com'),
        ('api.zogueland.com', 'api.zogueland.com'),
        ('admin.zogueland.com', 'admin.zogueland.com'),
        ('vitalsounouvou.com', 'vitalsounouvou.com'),
        ('www.vitalsounouvou.com', 'vitalsounouvou.com'),
        ('vss.vitalsounouvou.com', 'vitalsounouvou.com'),
        ('www.vss.vitalsounouvou.com', 'vitalsounouvou.com')
    ) as d(domain, canonical_host)
    where t."key" in ('zogueland', 'vs')
    on conflict (tenant_id, env, domain)
    do update set
      canonical_host = excluded.canonical_host,
      updated_at = now();
  end if;
end $$;
