-- Internal Exportunity factory discovery queue. Google Places records are
-- private leads only and never become public factory profiles automatically.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_factory_lead_status') THEN
    CREATE TYPE industrial_factory_lead_status AS ENUM (
      'new',
      'under_review',
      'qualified',
      'contact_ready',
      'rejected',
      'converted'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS industrial_factory_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'manual',
  google_place_id text,
  name text NOT NULL,
  normalized_name text NOT NULL,
  primary_industry text,
  google_types jsonb NOT NULL DEFAULT '[]'::jsonb,
  address text,
  city text,
  country_code text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  phone text,
  website text,
  google_maps_url text,
  rating numeric(3,2),
  review_count integer,
  business_status text,
  opening_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  lead_status industrial_factory_lead_status NOT NULL DEFAULT 'new',
  qualification_score integer NOT NULL DEFAULT 0,
  screening_notes text,
  contact_status text NOT NULL DEFAULT 'not_contacted',
  last_enriched_at timestamp,
  reviewed_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  reviewed_at timestamp,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS industrial_factory_leads_tenant_google_place_unique
  ON industrial_factory_leads(tenant_id, google_place_id);
CREATE INDEX IF NOT EXISTS industrial_factory_leads_tenant_name_city_idx
  ON industrial_factory_leads(tenant_id, normalized_name, city);
CREATE INDEX IF NOT EXISTS industrial_factory_leads_tenant_status_idx
  ON industrial_factory_leads(tenant_id, lead_status, qualification_score);
CREATE INDEX IF NOT EXISTS industrial_factory_leads_tenant_location_idx
  ON industrial_factory_leads(tenant_id, country_code, city);
