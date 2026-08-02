-- Exportunity industrial foundation. This migration is additive and does not
-- modify or remove legacy marketplace, equipment, or PME exchange records.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_visibility') THEN
    CREATE TYPE industrial_visibility AS ENUM ('public', 'verified_users_only', 'parties_to_transaction', 'factory_team_only', 'exportunity_internal', 'admin_only');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_factory_status') THEN
    CREATE TYPE industrial_factory_status AS ENUM ('draft', 'submitted', 'under_review', 'active', 'suspended', 'archived');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_verification_status') THEN
    CREATE TYPE industrial_verification_status AS ENUM ('unverified', 'submitted', 'under_review', 'verified', 'rejected', 'suspended');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_catalog_classification') THEN
    CREATE TYPE industrial_catalog_classification AS ENUM ('export_ready_factory_product', 'machinery', 'raw_material', 'industrial_input', 'spare_part', 'industrial_service');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_catalog_status') THEN
    CREATE TYPE industrial_catalog_status AS ENUM ('draft', 'under_review', 'approved', 'archived');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_requirement_type') THEN
    CREATE TYPE industrial_requirement_type AS ENUM ('machinery', 'raw_material', 'industrial_input', 'spare_part', 'custom_manufacturing', 'industrial_service', 'export_quotation');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_requirement_status') THEN
    CREATE TYPE industrial_requirement_status AS ENUM ('draft', 'submitted', 'triaged', 'under_review', 'supplier_matching', 'quote_preparation', 'quoted', 'closed', 'cancelled');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS industrial_factories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  owner_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  account_manager_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  legal_name text NOT NULL,
  display_name text NOT NULL,
  normalized_name text NOT NULL,
  registration_number text,
  factory_status industrial_factory_status NOT NULL DEFAULT 'draft',
  verification_status industrial_verification_status NOT NULL DEFAULT 'unverified',
  public_visibility industrial_visibility NOT NULL DEFAULT 'exportunity_internal',
  country_code text NOT NULL,
  region text,
  city text,
  industrial_zone text,
  public_address text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  primary_industry text NOT NULL,
  industries jsonb NOT NULL DEFAULT '[]'::jsonb,
  public_description text,
  public_website text,
  public_email text,
  public_phone text,
  public_certifications jsonb NOT NULL DEFAULT '[]'::jsonb,
  export_markets jsonb NOT NULL DEFAULT '[]'::jsonb,
  private_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  admin_notes text,
  submitted_at timestamp,
  verified_at timestamp,
  archived_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS industrial_factories_tenant_name_unique ON industrial_factories(tenant_id, normalized_name);
CREATE INDEX IF NOT EXISTS industrial_factories_tenant_visibility_idx ON industrial_factories(tenant_id, factory_status, verification_status, public_visibility);
CREATE INDEX IF NOT EXISTS industrial_factories_tenant_location_idx ON industrial_factories(tenant_id, country_code, city, industrial_zone);
CREATE INDEX IF NOT EXISTS industrial_factories_tenant_industry_idx ON industrial_factories(tenant_id, primary_industry);

CREATE TABLE IF NOT EXISTS industrial_production_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  factory_id uuid NOT NULL REFERENCES industrial_factories(id) ON DELETE CASCADE,
  name text NOT NULL,
  industry text,
  operating_status text NOT NULL DEFAULT 'unknown',
  visibility industrial_visibility NOT NULL DEFAULT 'factory_team_only',
  public_summary text,
  private_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS industrial_production_lines_factory_idx ON industrial_production_lines(factory_id, visibility);

CREATE TABLE IF NOT EXISTS industrial_machines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  factory_id uuid NOT NULL REFERENCES industrial_factories(id) ON DELETE CASCADE,
  production_line_id uuid REFERENCES industrial_production_lines(id) ON DELETE SET NULL,
  name text NOT NULL,
  manufacturer text,
  model text,
  serial_number text,
  machine_category text,
  operating_status text NOT NULL DEFAULT 'unknown',
  visibility industrial_visibility NOT NULL DEFAULT 'factory_team_only',
  private_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS industrial_machines_factory_idx ON industrial_machines(factory_id, visibility);
CREATE INDEX IF NOT EXISTS industrial_machines_line_idx ON industrial_machines(production_line_id);

CREATE TABLE IF NOT EXISTS industrial_catalog_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  factory_id uuid NOT NULL REFERENCES industrial_factories(id) ON DELETE CASCADE,
  classification industrial_catalog_classification NOT NULL,
  category_code text NOT NULL,
  name text NOT NULL,
  normalized_name text NOT NULL,
  public_description text,
  product_code text,
  supply_modes jsonb NOT NULL DEFAULT '[]'::jsonb,
  price_mode text NOT NULL DEFAULT 'quote_required',
  availability_status text NOT NULL DEFAULT 'subject_to_confirmation',
  visibility industrial_visibility NOT NULL DEFAULT 'exportunity_internal',
  approval_status industrial_catalog_status NOT NULL DEFAULT 'draft',
  public_media jsonb NOT NULL DEFAULT '[]'::jsonb,
  private_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS industrial_catalog_items_tenant_public_idx ON industrial_catalog_items(tenant_id, approval_status, visibility, classification);
CREATE INDEX IF NOT EXISTS industrial_catalog_items_factory_idx ON industrial_catalog_items(factory_id, approval_status);
CREATE INDEX IF NOT EXISTS industrial_catalog_items_tenant_name_idx ON industrial_catalog_items(tenant_id, normalized_name);

CREATE TABLE IF NOT EXISTS industrial_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  factory_id uuid REFERENCES industrial_factories(id) ON DELETE SET NULL,
  requester_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  assigned_account_manager_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  reference_code text NOT NULL,
  requirement_type industrial_requirement_type NOT NULL,
  category_code text NOT NULL,
  title text NOT NULL,
  details text NOT NULL,
  quantity_text text,
  delivery_country_code text,
  delivery_city text,
  required_by timestamp,
  urgency text NOT NULL DEFAULT 'standard',
  requester_company text,
  requester_name text NOT NULL,
  requester_email text NOT NULL,
  requester_phone text,
  status industrial_requirement_status NOT NULL DEFAULT 'draft',
  visibility industrial_visibility NOT NULL DEFAULT 'exportunity_internal',
  internal_notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  submitted_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS industrial_requirements_tenant_reference_unique ON industrial_requirements(tenant_id, reference_code);
CREATE INDEX IF NOT EXISTS industrial_requirements_tenant_status_idx ON industrial_requirements(tenant_id, status, requirement_type);
CREATE INDEX IF NOT EXISTS industrial_requirements_factory_idx ON industrial_requirements(factory_id, status);

CREATE TABLE IF NOT EXISTS industrial_requirement_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  requirement_id uuid NOT NULL REFERENCES industrial_requirements(id) ON DELETE CASCADE,
  uploaded_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  file_name text NOT NULL,
  storage_key text NOT NULL,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL,
  visibility industrial_visibility NOT NULL DEFAULT 'factory_team_only',
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS industrial_requirement_attachments_requirement_idx ON industrial_requirement_attachments(requirement_id, visibility);

CREATE TABLE IF NOT EXISTS industrial_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  actor_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  reason text,
  previous_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  next_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS industrial_audit_logs_tenant_entity_idx ON industrial_audit_logs(tenant_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS industrial_audit_logs_tenant_action_idx ON industrial_audit_logs(tenant_id, action, created_at);
