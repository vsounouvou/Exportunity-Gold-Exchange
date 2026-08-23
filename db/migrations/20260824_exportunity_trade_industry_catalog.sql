-- Governed, tenant-scoped industry taxonomy for Exportunity Trade Intelligence.
-- Active sectors create empty coverage targets; they never create facts or publication evidence.
CREATE TABLE IF NOT EXISTS trade_industry_sectors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  name_fr text,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  coverage_tier text NOT NULL DEFAULT 'research_backlog',
  canonical_category_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  rationale text NOT NULL,
  created_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  approved_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  approved_at timestamp,
  retired_at timestamp,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT trade_industry_sectors_status_check CHECK (status IN ('draft', 'review', 'active', 'retired')),
  CONSTRAINT trade_industry_sectors_coverage_tier_check CHECK (coverage_tier IN ('priority', 'research_backlog'))
);
CREATE UNIQUE INDEX IF NOT EXISTS trade_industry_sectors_tenant_code_unique ON trade_industry_sectors(tenant_id, code);
CREATE INDEX IF NOT EXISTS trade_industry_sectors_tenant_status_idx ON trade_industry_sectors(tenant_id, status, coverage_tier, code);

WITH exportunity_tenant AS (
  SELECT id FROM tenants WHERE lower(key) = 'exportunity'
), initial_sectors(code, name, name_fr, description, canonical_category_codes) AS (
  VALUES
    ('industrial_machinery', 'Industrial machinery', 'Machines industrielles', 'Production machinery, complete lines, and industrial equipment.', '["machinery_and_production_equipment"]'::jsonb),
    ('construction_equipment', 'Construction equipment', 'Équipements de construction', 'Heavy equipment, site machinery, and construction systems.', '["machinery_and_production_equipment"]'::jsonb),
    ('transport_equipment', 'Transport equipment', 'Équipements de transport', 'Commercial vehicles, rolling stock, and transport equipment.', '["machinery_and_production_equipment"]'::jsonb),
    ('agricultural_commodities', 'Agricultural commodities', 'Matières premières agricoles', 'Agricultural raw materials and trade commodities.', '["raw_materials"]'::jsonb),
    ('food_agro_processing', 'Food and agro-processing', 'Agroalimentaire et transformation', 'Food inputs, processing equipment, and export-ready outputs.', '["raw_materials", "machinery_and_production_equipment", "export_ready_factory_products"]'::jsonb),
    ('energy_solar', 'Energy and solar', 'Énergie et solaire', 'Energy infrastructure, solar systems, and technical inputs.', '["machinery_and_production_equipment", "industrial_inputs_and_consumables"]'::jsonb),
    ('logistics', 'Logistics', 'Logistique', 'Freight, warehousing, customs, and industrial logistics services.', '["industrial_services"]'::jsonb)
)
INSERT INTO trade_industry_sectors (
  tenant_id,
  code,
  name,
  name_fr,
  description,
  status,
  coverage_tier,
  canonical_category_codes,
  rationale,
  metadata
)
SELECT
  exportunity_tenant.id,
  initial_sectors.code,
  initial_sectors.name,
  initial_sectors.name_fr,
  initial_sectors.description,
  'active',
  'priority',
  initial_sectors.canonical_category_codes,
  'Initial source-backed Trade Intelligence launch taxonomy.',
  jsonb_build_object(
    'seededFrom', 'trade_intelligence_priority_sectors',
    'emptyCoverageIsNotEvidence', true,
    'externalCommunicationAllowed', false
  )
FROM exportunity_tenant
CROSS JOIN initial_sectors
ON CONFLICT (tenant_id, code) DO NOTHING;
