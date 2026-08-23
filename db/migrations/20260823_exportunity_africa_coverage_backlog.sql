-- Additive Exportunity Africa-wide coverage catalog.
-- These rows are empty research targets, not facts, entities, or publication evidence.
WITH exportunity_tenant AS (
  SELECT id FROM tenants WHERE lower(key) = 'exportunity'
), africa_countries(country_code, country_name) AS (
  VALUES
    ('DZ', 'Algeria'),
    ('AO', 'Angola'),
    ('BJ', 'Benin'),
    ('BW', 'Botswana'),
    ('BF', 'Burkina Faso'),
    ('BI', 'Burundi'),
    ('CV', 'Cabo Verde'),
    ('CM', 'Cameroon'),
    ('CF', 'Central African Republic'),
    ('TD', 'Chad'),
    ('KM', 'Comoros'),
    ('CD', 'Democratic Republic of the Congo'),
    ('CG', 'Republic of the Congo'),
    ('CI', 'Côte d''Ivoire'),
    ('DJ', 'Djibouti'),
    ('EG', 'Egypt'),
    ('GQ', 'Equatorial Guinea'),
    ('ER', 'Eritrea'),
    ('SZ', 'Eswatini'),
    ('ET', 'Ethiopia'),
    ('GA', 'Gabon'),
    ('GM', 'Gambia'),
    ('GH', 'Ghana'),
    ('GN', 'Guinea'),
    ('GW', 'Guinea-Bissau'),
    ('KE', 'Kenya'),
    ('LS', 'Lesotho'),
    ('LR', 'Liberia'),
    ('LY', 'Libya'),
    ('MG', 'Madagascar'),
    ('MW', 'Malawi'),
    ('ML', 'Mali'),
    ('MR', 'Mauritania'),
    ('MU', 'Mauritius'),
    ('MA', 'Morocco'),
    ('MZ', 'Mozambique'),
    ('NA', 'Namibia'),
    ('NE', 'Niger'),
    ('NG', 'Nigeria'),
    ('RW', 'Rwanda'),
    ('ST', 'São Tomé and Príncipe'),
    ('SN', 'Senegal'),
    ('SC', 'Seychelles'),
    ('SL', 'Sierra Leone'),
    ('SO', 'Somalia'),
    ('ZA', 'South Africa'),
    ('SS', 'South Sudan'),
    ('SD', 'Sudan'),
    ('TZ', 'Tanzania'),
    ('TG', 'Togo'),
    ('TN', 'Tunisia'),
    ('UG', 'Uganda'),
    ('ZM', 'Zambia'),
    ('ZW', 'Zimbabwe')
), coverage_targets(dimension, sector_code, missing_fields, sector_name) AS (
  VALUES
    ('country_profile'::trade_coverage_dimension, '__all__', '["verified_sources", "verified_facts"]'::jsonb, NULL::text),
    ('market_access'::trade_coverage_dimension, '__all__', '["verified_sources", "verified_facts"]'::jsonb, NULL::text),
    ('regulations'::trade_coverage_dimension, '__all__', '["verified_sources", "verified_facts"]'::jsonb, NULL::text),
    ('tariffs'::trade_coverage_dimension, '__all__', '["verified_sources", "verified_facts"]'::jsonb, NULL::text),
    ('logistics'::trade_coverage_dimension, '__all__', '["verified_sources", "verified_facts"]'::jsonb, NULL::text),
    ('companies'::trade_coverage_dimension, '__all__', '["verified_sources", "verified_facts"]'::jsonb, NULL::text),
    ('products'::trade_coverage_dimension, '__all__', '["verified_sources", "verified_facts"]'::jsonb, NULL::text),
    ('opportunities'::trade_coverage_dimension, '__all__', '["verified_sources", "verified_facts"]'::jsonb, NULL::text),
    ('news'::trade_coverage_dimension, '__all__', '["verified_sources", "verified_facts"]'::jsonb, NULL::text),
    ('sector_profile'::trade_coverage_dimension, 'industrial_machinery', '["market_size", "trade_flows", "companies", "rules"]'::jsonb, 'Industrial machinery'),
    ('sector_profile'::trade_coverage_dimension, 'construction_equipment', '["market_size", "trade_flows", "companies", "rules"]'::jsonb, 'Construction equipment'),
    ('sector_profile'::trade_coverage_dimension, 'transport_equipment', '["market_size", "trade_flows", "companies", "rules"]'::jsonb, 'Transport equipment'),
    ('sector_profile'::trade_coverage_dimension, 'agricultural_commodities', '["market_size", "trade_flows", "companies", "rules"]'::jsonb, 'Agricultural commodities'),
    ('sector_profile'::trade_coverage_dimension, 'food_agro_processing', '["market_size", "trade_flows", "companies", "rules"]'::jsonb, 'Food and agro-processing'),
    ('sector_profile'::trade_coverage_dimension, 'energy_solar', '["market_size", "trade_flows", "companies", "rules"]'::jsonb, 'Energy and solar'),
    ('sector_profile'::trade_coverage_dimension, 'logistics', '["market_size", "trade_flows", "companies", "rules"]'::jsonb, 'Logistics')
)
INSERT INTO trade_coverage_cells (
  tenant_id,
  country_code,
  dimension,
  sector_code,
  missing_fields,
  metadata
)
SELECT
  exportunity_tenant.id,
  africa_countries.country_code,
  coverage_targets.dimension,
  coverage_targets.sector_code,
  coverage_targets.missing_fields,
  jsonb_strip_nulls(
    jsonb_build_object(
      'phase', CASE
        WHEN africa_countries.country_code IN ('BJ', 'CI', 'GH', 'NG', 'SN') THEN 'phase_1'
        ELSE 'africa_completion_backlog'
      END,
      'coverageScope', 'africa_54',
      'coverageTier', CASE
        WHEN africa_countries.country_code IN ('BJ', 'CI', 'GH', 'NG', 'SN') THEN 'priority'
        ELSE 'research_backlog'
      END,
      'countryName', africa_countries.country_name,
      'sectorName', coverage_targets.sector_name,
      'seededAsCoverageTarget', true,
      'emptyCoverageIsNotEvidence', true
    )
  )
FROM exportunity_tenant
CROSS JOIN africa_countries
CROSS JOIN coverage_targets
ON CONFLICT (tenant_id, country_code, dimension, sector_code) DO NOTHING;
