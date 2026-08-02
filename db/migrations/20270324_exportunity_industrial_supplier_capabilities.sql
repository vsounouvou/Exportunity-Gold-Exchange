-- Controlled, internal supplier capability registry for Exportunity industrial
-- sourcing. This does not publish suppliers, create quotes, or contact anyone.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_supplier_status') THEN
    CREATE TYPE industrial_supplier_status AS ENUM ('draft', 'under_review', 'active', 'suspended', 'archived');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_supplier_nda_status') THEN
    CREATE TYPE industrial_supplier_nda_status AS ENUM ('not_assessed', 'under_review', 'signed', 'not_required');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS industrial_supplier_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  linked_factory_id uuid REFERENCES industrial_factories(id) ON DELETE SET NULL,
  owner_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  legal_name text NOT NULL,
  display_name text NOT NULL,
  normalized_name text NOT NULL,
  supplier_status industrial_supplier_status NOT NULL DEFAULT 'draft',
  verification_status industrial_verification_status NOT NULL DEFAULT 'unverified',
  visibility industrial_visibility NOT NULL DEFAULT 'exportunity_internal',
  country_code text NOT NULL,
  region text,
  city text,
  industrial_zone text,
  address text,
  website text,
  email text,
  phone text,
  industries_served jsonb NOT NULL DEFAULT '[]'::jsonb,
  category_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  equipment_available jsonb NOT NULL DEFAULT '[]'::jsonb,
  materials_handled jsonb NOT NULL DEFAULT '[]'::jsonb,
  maximum_dimensions text,
  tolerances text,
  production_capacity_text text,
  certifications jsonb NOT NULL DEFAULT '[]'::jsonb,
  quality_control_capability text,
  lead_time_text text,
  previous_performance_notes text,
  on_time_delivery_rate numeric(5,2),
  technical_document_references jsonb NOT NULL DEFAULT '[]'::jsonb,
  media_references jsonb NOT NULL DEFAULT '[]'::jsonb,
  nda_status industrial_supplier_nda_status NOT NULL DEFAULT 'not_assessed',
  admin_notes text,
  verified_at timestamp,
  archived_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT industrial_supplier_profiles_tenant_name_unique UNIQUE (tenant_id, normalized_name)
);

CREATE INDEX IF NOT EXISTS industrial_supplier_profiles_tenant_review_idx
  ON industrial_supplier_profiles(tenant_id, supplier_status, verification_status);
CREATE INDEX IF NOT EXISTS industrial_supplier_profiles_tenant_location_idx
  ON industrial_supplier_profiles(tenant_id, country_code, city, industrial_zone);
CREATE INDEX IF NOT EXISTS industrial_supplier_profiles_linked_factory_idx
  ON industrial_supplier_profiles(linked_factory_id);

CREATE TABLE IF NOT EXISTS industrial_requirement_supplier_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  requirement_id uuid NOT NULL REFERENCES industrial_requirements(id) ON DELETE CASCADE,
  supplier_profile_id uuid NOT NULL REFERENCES industrial_supplier_profiles(id) ON DELETE CASCADE,
  status industrial_requirement_match_status NOT NULL DEFAULT 'candidate',
  match_score integer,
  match_reason text,
  internal_notes text,
  created_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  selected_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  selected_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT industrial_requirement_supplier_matches_requirement_supplier_unique UNIQUE (requirement_id, supplier_profile_id)
);

CREATE INDEX IF NOT EXISTS industrial_requirement_supplier_matches_tenant_requirement_idx
  ON industrial_requirement_supplier_matches(tenant_id, requirement_id, status);
CREATE INDEX IF NOT EXISTS industrial_requirement_supplier_matches_tenant_supplier_idx
  ON industrial_requirement_supplier_matches(tenant_id, supplier_profile_id, status);
