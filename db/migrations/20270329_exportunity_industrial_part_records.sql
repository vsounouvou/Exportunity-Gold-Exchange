-- Private scan-to-manufacture technical records for Exportunity Machinery.
-- Capturing a part only creates an internal engineering-review record. It does
-- not create a public listing, production job, order, payment, supplier action,
-- or customer communication.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_part_record_status') THEN
    CREATE TYPE industrial_part_record_status AS ENUM (
      'captured',
      'digitization',
      'technical_review',
      'route_review',
      'route_selected',
      'prototype',
      'validated',
      'catalog_candidate',
      'archived'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_part_route_decision') THEN
    CREATE TYPE industrial_part_route_decision AS ENUM (
      'review_required',
      'stock',
      'distribute',
      'assemble',
      'manufacture_local',
      'import'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS industrial_part_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  factory_id uuid NOT NULL REFERENCES industrial_factories(id) ON DELETE CASCADE,
  source_requirement_id uuid REFERENCES industrial_requirements(id) ON DELETE SET NULL,
  challenge_id uuid REFERENCES industrial_challenges(id) ON DELETE SET NULL,
  machine_id uuid REFERENCES industrial_machines(id) ON DELETE SET NULL,
  assembly_id uuid REFERENCES industrial_machine_assemblies(id) ON DELETE SET NULL,
  component_id uuid REFERENCES industrial_machine_components(id) ON DELETE SET NULL,
  created_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  reviewed_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  reference_code text NOT NULL,
  title text NOT NULL,
  normalized_title text NOT NULL,
  part_number text,
  requirement_type industrial_requirement_type NOT NULL DEFAULT 'spare_part',
  category_code text NOT NULL,
  technical_details text NOT NULL DEFAULT '',
  material text,
  dimensions_text text,
  weight_text text,
  application text,
  current_source text,
  demand_signal_text text,
  status industrial_part_record_status NOT NULL DEFAULT 'captured',
  route_decision industrial_part_route_decision NOT NULL DEFAULT 'review_required',
  route_rationale text,
  review_notes text,
  visibility industrial_visibility NOT NULL DEFAULT 'factory_team_only',
  revision integer NOT NULL DEFAULT 1,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  reviewed_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS industrial_part_records_tenant_reference_unique
  ON industrial_part_records(tenant_id, reference_code);
CREATE INDEX IF NOT EXISTS industrial_part_records_factory_status_idx
  ON industrial_part_records(factory_id, status, updated_at);
CREATE INDEX IF NOT EXISTS industrial_part_records_tenant_route_idx
  ON industrial_part_records(tenant_id, route_decision, status, updated_at);
CREATE INDEX IF NOT EXISTS industrial_part_records_technical_context_idx
  ON industrial_part_records(factory_id, machine_id, assembly_id, component_id);
CREATE INDEX IF NOT EXISTS industrial_part_records_requirement_idx
  ON industrial_part_records(source_requirement_id, challenge_id);

CREATE TABLE IF NOT EXISTS industrial_part_record_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  part_record_id uuid NOT NULL REFERENCES industrial_part_records(id) ON DELETE CASCADE,
  uploaded_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  document_type text NOT NULL,
  title text NOT NULL,
  file_name text NOT NULL,
  storage_key text NOT NULL,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL,
  visibility industrial_visibility NOT NULL DEFAULT 'factory_team_only',
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS industrial_part_record_documents_part_record_idx
  ON industrial_part_record_documents(part_record_id, created_at);
CREATE INDEX IF NOT EXISTS industrial_part_record_documents_tenant_type_idx
  ON industrial_part_record_documents(tenant_id, document_type, created_at);
