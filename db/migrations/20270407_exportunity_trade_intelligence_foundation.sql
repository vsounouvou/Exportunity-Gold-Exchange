CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'trade_intelligence_source_type') THEN
    CREATE TYPE trade_intelligence_source_type AS ENUM ('official_registry', 'customs_authority', 'statistics_authority', 'ministry', 'standards_body', 'port_authority', 'logistics_operator', 'chamber_of_commerce', 'development_institution', 'company_website', 'industry_directory', 'news_media', 'research_publication', 'manual_evidence');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'trade_intelligence_source_status') THEN
    CREATE TYPE trade_intelligence_source_status AS ENUM ('active', 'paused', 'degraded', 'blocked', 'archived');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'trade_knowledge_entity_type') THEN
    CREATE TYPE trade_knowledge_entity_type AS ENUM ('country', 'sector', 'product', 'company', 'port', 'trade_corridor', 'regulation', 'tariff', 'certification', 'logistics_service', 'trade_opportunity', 'market_report', 'news_article');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'trade_verification_status') THEN
    CREATE TYPE trade_verification_status AS ENUM ('unverified', 'evidence_pending', 'under_review', 'verified', 'disputed', 'stale');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'trade_publication_status') THEN
    CREATE TYPE trade_publication_status AS ENUM ('draft', 'review', 'approved', 'published', 'withdrawn');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'trade_demand_event_type') THEN
    CREATE TYPE trade_demand_event_type AS ENUM ('search', 'assistant_intent', 'requirement', 'zero_result', 'rfq', 'quote', 'order');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'trade_coverage_status') THEN
    CREATE TYPE trade_coverage_status AS ENUM ('empty', 'researching', 'partial', 'verified', 'stale');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'trade_coverage_dimension') THEN
    CREATE TYPE trade_coverage_dimension AS ENUM ('country_profile', 'sector_profile', 'market_access', 'regulations', 'tariffs', 'logistics', 'companies', 'products', 'opportunities', 'news');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'trade_research_mission_status') THEN
    CREATE TYPE trade_research_mission_status AS ENUM ('proposed', 'queued', 'in_progress', 'awaiting_review', 'completed', 'blocked', 'cancelled');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS trade_intelligence_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  normalized_key text NOT NULL,
  name text NOT NULL,
  source_type trade_intelligence_source_type NOT NULL,
  status trade_intelligence_source_status NOT NULL DEFAULT 'active',
  country_code text,
  domain text,
  base_url text NOT NULL,
  language_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  trust_score numeric(4,3) NOT NULL DEFAULT 0.500,
  access_policy text NOT NULL DEFAULT 'public',
  robots_policy text NOT NULL DEFAULT 'unknown',
  crawl_cadence text,
  parser_key text,
  last_checked_at timestamp,
  last_succeeded_at timestamp,
  last_failed_at timestamp,
  next_due_at timestamp,
  last_error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT trade_intelligence_sources_trust_score_check CHECK (trust_score >= 0 AND trust_score <= 1)
);
CREATE UNIQUE INDEX IF NOT EXISTS trade_intelligence_sources_tenant_key_unique ON trade_intelligence_sources(tenant_id, normalized_key);
CREATE INDEX IF NOT EXISTS trade_intelligence_sources_tenant_status_idx ON trade_intelligence_sources(tenant_id, status, next_due_at);
CREATE INDEX IF NOT EXISTS trade_intelligence_sources_country_type_idx ON trade_intelligence_sources(tenant_id, country_code, source_type);

CREATE TABLE IF NOT EXISTS trade_knowledge_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type trade_knowledge_entity_type NOT NULL,
  canonical_key text NOT NULL,
  slug text NOT NULL,
  display_name text NOT NULL,
  alternate_names jsonb NOT NULL DEFAULT '[]'::jsonb,
  translations jsonb NOT NULL DEFAULT '{}'::jsonb,
  country_code text,
  sector_code text,
  summary text,
  structured_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  verification_status trade_verification_status NOT NULL DEFAULT 'unverified',
  publication_status trade_publication_status NOT NULL DEFAULT 'draft',
  publication_eligibility_score integer NOT NULL DEFAULT 0,
  primary_source_id uuid REFERENCES trade_intelligence_sources(id) ON DELETE SET NULL,
  last_verified_at timestamp,
  published_at timestamp,
  created_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT trade_knowledge_entities_eligibility_score_check CHECK (publication_eligibility_score >= 0 AND publication_eligibility_score <= 100)
);
CREATE UNIQUE INDEX IF NOT EXISTS trade_knowledge_entities_tenant_canonical_unique ON trade_knowledge_entities(tenant_id, entity_type, canonical_key);
CREATE UNIQUE INDEX IF NOT EXISTS trade_knowledge_entities_tenant_slug_unique ON trade_knowledge_entities(tenant_id, entity_type, slug);
CREATE INDEX IF NOT EXISTS trade_knowledge_entities_publication_idx ON trade_knowledge_entities(tenant_id, publication_status, verification_status, entity_type);
CREATE INDEX IF NOT EXISTS trade_knowledge_entities_country_sector_idx ON trade_knowledge_entities(tenant_id, country_code, sector_code, entity_type);

CREATE TABLE IF NOT EXISTS trade_knowledge_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_entity_id uuid NOT NULL REFERENCES trade_knowledge_entities(id) ON DELETE CASCADE,
  target_entity_id uuid NOT NULL REFERENCES trade_knowledge_entities(id) ON DELETE CASCADE,
  relationship_type text NOT NULL,
  summary text,
  structured_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence numeric(4,3) NOT NULL DEFAULT 0,
  verification_status trade_verification_status NOT NULL DEFAULT 'evidence_pending',
  valid_from timestamp,
  valid_until timestamp,
  last_verified_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT trade_knowledge_relationships_confidence_check CHECK (confidence >= 0 AND confidence <= 1),
  CONSTRAINT trade_knowledge_relationships_distinct_entities_check CHECK (source_entity_id <> target_entity_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS trade_knowledge_relationships_tenant_edge_unique ON trade_knowledge_relationships(tenant_id, source_entity_id, target_entity_id, relationship_type);
CREATE INDEX IF NOT EXISTS trade_knowledge_relationships_source_idx ON trade_knowledge_relationships(tenant_id, source_entity_id, relationship_type);
CREATE INDEX IF NOT EXISTS trade_knowledge_relationships_target_idx ON trade_knowledge_relationships(tenant_id, target_entity_id, relationship_type);

CREATE TABLE IF NOT EXISTS trade_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_id uuid REFERENCES trade_knowledge_entities(id) ON DELETE CASCADE,
  relationship_id uuid REFERENCES trade_knowledge_relationships(id) ON DELETE CASCADE,
  field_key text NOT NULL,
  value jsonb NOT NULL,
  value_text text,
  unit text,
  source_id uuid NOT NULL REFERENCES trade_intelligence_sources(id) ON DELETE RESTRICT,
  source_url text NOT NULL,
  source_document_title text,
  source_published_at timestamp,
  retrieved_at timestamp NOT NULL DEFAULT now(),
  effective_from timestamp,
  effective_until timestamp,
  content_hash text NOT NULL,
  evidence_excerpt text,
  confidence numeric(4,3) NOT NULL DEFAULT 0,
  verification_status trade_verification_status NOT NULL DEFAULT 'evidence_pending',
  publication_status trade_publication_status NOT NULL DEFAULT 'draft',
  verified_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  verified_at timestamp,
  published_at timestamp,
  last_checked_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT trade_facts_owner_check CHECK (num_nonnulls(entity_id, relationship_id) = 1),
  CONSTRAINT trade_facts_confidence_check CHECK (confidence >= 0 AND confidence <= 1)
);
CREATE UNIQUE INDEX IF NOT EXISTS trade_facts_tenant_evidence_unique ON trade_facts(tenant_id, source_id, content_hash, field_key);
CREATE INDEX IF NOT EXISTS trade_facts_entity_field_idx ON trade_facts(tenant_id, entity_id, field_key, verification_status);
CREATE INDEX IF NOT EXISTS trade_facts_relationship_field_idx ON trade_facts(tenant_id, relationship_id, field_key, verification_status);
CREATE INDEX IF NOT EXISTS trade_facts_source_freshness_idx ON trade_facts(tenant_id, source_id, retrieved_at);

CREATE TABLE IF NOT EXISTS trade_demand_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_type trade_demand_event_type NOT NULL,
  source_surface text NOT NULL,
  anonymous_session_id text,
  user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  industrial_requirement_id uuid REFERENCES industrial_requirements(id) ON DELETE SET NULL,
  source_conversation_id text,
  query_text text,
  normalized_product text,
  product_category text,
  sector_code text,
  origin_country_code text,
  destination_country_code text,
  destination_city text,
  commercial_intent text,
  result_count integer,
  quantity_text text,
  estimated_value numeric(18,2),
  currency_code text,
  conversion_stage text,
  difficulty_score integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamp NOT NULL DEFAULT now(),
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT trade_demand_events_difficulty_check CHECK (difficulty_score >= 0 AND difficulty_score <= 100),
  CONSTRAINT trade_demand_events_result_count_check CHECK (result_count IS NULL OR result_count >= 0)
);
CREATE INDEX IF NOT EXISTS trade_demand_events_tenant_time_idx ON trade_demand_events(tenant_id, occurred_at);
CREATE INDEX IF NOT EXISTS trade_demand_events_radar_idx ON trade_demand_events(tenant_id, destination_country_code, sector_code, normalized_product, occurred_at);
CREATE INDEX IF NOT EXISTS trade_demand_events_requirement_idx ON trade_demand_events(industrial_requirement_id, event_type);

CREATE TABLE IF NOT EXISTS trade_coverage_cells (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  country_code text NOT NULL,
  dimension trade_coverage_dimension NOT NULL,
  sector_code text NOT NULL DEFAULT '__all__',
  status trade_coverage_status NOT NULL DEFAULT 'empty',
  coverage_percent integer NOT NULL DEFAULT 0,
  quality_score integer NOT NULL DEFAULT 0,
  entity_count integer NOT NULL DEFAULT 0,
  fact_count integer NOT NULL DEFAULT 0,
  verified_fact_count integer NOT NULL DEFAULT 0,
  source_count integer NOT NULL DEFAULT 0,
  missing_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_verified_at timestamp,
  next_review_at timestamp,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT trade_coverage_cells_coverage_check CHECK (coverage_percent >= 0 AND coverage_percent <= 100),
  CONSTRAINT trade_coverage_cells_quality_check CHECK (quality_score >= 0 AND quality_score <= 100)
);
CREATE UNIQUE INDEX IF NOT EXISTS trade_coverage_cells_tenant_cell_unique ON trade_coverage_cells(tenant_id, country_code, dimension, sector_code);
CREATE INDEX IF NOT EXISTS trade_coverage_cells_status_idx ON trade_coverage_cells(tenant_id, status, country_code, dimension);
CREATE INDEX IF NOT EXISTS trade_coverage_cells_review_idx ON trade_coverage_cells(tenant_id, next_review_at, status);

CREATE TABLE IF NOT EXISTS trade_research_missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  canonical_task_id integer REFERENCES tasks(id) ON DELETE SET NULL,
  triggered_by_demand_event_id uuid REFERENCES trade_demand_events(id) ON DELETE SET NULL,
  coverage_cell_id uuid REFERENCES trade_coverage_cells(id) ON DELETE SET NULL,
  mission_type text NOT NULL,
  title text NOT NULL,
  objective text NOT NULL,
  country_code text,
  sector_code text,
  priority text NOT NULL DEFAULT 'medium',
  status trade_research_mission_status NOT NULL DEFAULT 'proposed',
  approval_status text NOT NULL DEFAULT 'pending',
  assigned_agent_id integer,
  evidence_requirements jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence_count integer NOT NULL DEFAULT 0,
  confidence numeric(4,3),
  result_summary text,
  recommended_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamp,
  completed_at timestamp,
  created_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT trade_research_missions_confidence_check CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1))
);
CREATE UNIQUE INDEX IF NOT EXISTS trade_research_missions_canonical_task_unique ON trade_research_missions(canonical_task_id);
CREATE INDEX IF NOT EXISTS trade_research_missions_queue_idx ON trade_research_missions(tenant_id, status, priority, created_at);
CREATE INDEX IF NOT EXISTS trade_research_missions_scope_idx ON trade_research_missions(tenant_id, country_code, sector_code, status);
CREATE INDEX IF NOT EXISTS trade_research_missions_demand_idx ON trade_research_missions(triggered_by_demand_event_id, status);

CREATE TABLE IF NOT EXISTS trade_research_mission_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  mission_id uuid NOT NULL REFERENCES trade_research_missions(id) ON DELETE CASCADE,
  fact_id uuid REFERENCES trade_facts(id) ON DELETE SET NULL,
  source_id uuid NOT NULL REFERENCES trade_intelligence_sources(id) ON DELETE RESTRICT,
  evidence_type text NOT NULL,
  title text NOT NULL,
  source_url text NOT NULL,
  content_hash text NOT NULL,
  evidence_excerpt text,
  notes text,
  verification_status trade_verification_status NOT NULL DEFAULT 'evidence_pending',
  verified_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  verified_at timestamp,
  created_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS trade_research_mission_evidence_tenant_unique ON trade_research_mission_evidence(tenant_id, mission_id, content_hash);
CREATE INDEX IF NOT EXISTS trade_research_mission_evidence_mission_status_idx ON trade_research_mission_evidence(tenant_id, mission_id, verification_status);
CREATE INDEX IF NOT EXISTS trade_research_mission_evidence_source_idx ON trade_research_mission_evidence(tenant_id, source_id, created_at);

CREATE TABLE IF NOT EXISTS trade_regulatory_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES trade_intelligence_sources(id) ON DELETE RESTRICT,
  entity_id uuid REFERENCES trade_knowledge_entities(id) ON DELETE SET NULL,
  canonical_task_id integer REFERENCES tasks(id) ON DELETE SET NULL,
  jurisdiction_country_code text NOT NULL,
  change_type text NOT NULL,
  title text NOT NULL,
  summary text NOT NULL,
  source_url text NOT NULL,
  content_hash text NOT NULL,
  previous_value jsonb,
  current_value jsonb,
  severity text NOT NULL DEFAULT 'informational',
  verification_status trade_verification_status NOT NULL DEFAULT 'evidence_pending',
  publication_status trade_publication_status NOT NULL DEFAULT 'draft',
  effective_at timestamp,
  detected_at timestamp NOT NULL DEFAULT now(),
  reviewed_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  reviewed_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS trade_regulatory_changes_tenant_hash_unique ON trade_regulatory_changes(tenant_id, source_id, content_hash);
CREATE INDEX IF NOT EXISTS trade_regulatory_changes_review_idx ON trade_regulatory_changes(tenant_id, verification_status, detected_at);
CREATE INDEX IF NOT EXISTS trade_regulatory_changes_jurisdiction_idx ON trade_regulatory_changes(tenant_id, jurisdiction_country_code, effective_at);

WITH exportunity_tenant AS (
  SELECT id FROM tenants WHERE lower(key) = 'exportunity'
), priority_countries(country_code, country_name) AS (
  VALUES
    ('BJ', 'Benin'),
    ('CI', 'Côte d''Ivoire'),
    ('GH', 'Ghana'),
    ('NG', 'Nigeria'),
    ('SN', 'Senegal')
), country_dimensions(dimension) AS (
  VALUES
    ('country_profile'::trade_coverage_dimension),
    ('market_access'::trade_coverage_dimension),
    ('regulations'::trade_coverage_dimension),
    ('tariffs'::trade_coverage_dimension),
    ('logistics'::trade_coverage_dimension),
    ('companies'::trade_coverage_dimension),
    ('products'::trade_coverage_dimension),
    ('opportunities'::trade_coverage_dimension),
    ('news'::trade_coverage_dimension)
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
  priority_countries.country_code,
  country_dimensions.dimension,
  '__all__',
  '["verified_sources", "verified_facts"]'::jsonb,
  jsonb_build_object(
    'phase', 'phase_1',
    'countryName', priority_countries.country_name,
    'seededAsCoverageTarget', true
  )
FROM exportunity_tenant
CROSS JOIN priority_countries
CROSS JOIN country_dimensions
ON CONFLICT (tenant_id, country_code, dimension, sector_code) DO NOTHING;

WITH exportunity_tenant AS (
  SELECT id FROM tenants WHERE lower(key) = 'exportunity'
), priority_countries(country_code, country_name) AS (
  VALUES
    ('BJ', 'Benin'),
    ('CI', 'Côte d''Ivoire'),
    ('GH', 'Ghana'),
    ('NG', 'Nigeria'),
    ('SN', 'Senegal')
), priority_sectors(sector_code, sector_name) AS (
  VALUES
    ('industrial_machinery', 'Industrial machinery'),
    ('construction_equipment', 'Construction equipment'),
    ('transport_equipment', 'Transport equipment'),
    ('agricultural_commodities', 'Agricultural commodities'),
    ('food_agro_processing', 'Food and agro-processing'),
    ('energy_solar', 'Energy and solar'),
    ('logistics', 'Logistics')
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
  priority_countries.country_code,
  'sector_profile'::trade_coverage_dimension,
  priority_sectors.sector_code,
  '["market_size", "trade_flows", "companies", "rules"]'::jsonb,
  jsonb_build_object(
    'phase', 'phase_1',
    'countryName', priority_countries.country_name,
    'sectorName', priority_sectors.sector_name,
    'seededAsCoverageTarget', true
  )
FROM exportunity_tenant
CROSS JOIN priority_countries
CROSS JOIN priority_sectors
ON CONFLICT (tenant_id, country_code, dimension, sector_code) DO NOTHING;
