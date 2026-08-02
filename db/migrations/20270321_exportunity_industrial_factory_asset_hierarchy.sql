BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS industrial_machine_assemblies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  factory_id uuid NOT NULL REFERENCES industrial_factories(id) ON DELETE CASCADE,
  machine_id uuid NOT NULL REFERENCES industrial_machines(id) ON DELETE CASCADE,
  name text NOT NULL,
  assembly_type text,
  operating_status text NOT NULL DEFAULT 'unknown',
  visibility industrial_visibility NOT NULL DEFAULT 'factory_team_only',
  public_summary text,
  private_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS industrial_machine_assemblies_factory_idx
  ON industrial_machine_assemblies(factory_id, visibility);
CREATE INDEX IF NOT EXISTS industrial_machine_assemblies_machine_idx
  ON industrial_machine_assemblies(machine_id, visibility);

CREATE TABLE IF NOT EXISTS industrial_machine_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  factory_id uuid NOT NULL REFERENCES industrial_factories(id) ON DELETE CASCADE,
  machine_id uuid NOT NULL REFERENCES industrial_machines(id) ON DELETE CASCADE,
  assembly_id uuid REFERENCES industrial_machine_assemblies(id) ON DELETE SET NULL,
  name text NOT NULL,
  component_type text,
  part_number text,
  manufacturer text,
  model text,
  criticality text NOT NULL DEFAULT 'standard',
  operating_status text NOT NULL DEFAULT 'unknown',
  visibility industrial_visibility NOT NULL DEFAULT 'factory_team_only',
  private_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS industrial_machine_components_factory_idx
  ON industrial_machine_components(factory_id, visibility);
CREATE INDEX IF NOT EXISTS industrial_machine_components_machine_idx
  ON industrial_machine_components(machine_id, visibility);
CREATE INDEX IF NOT EXISTS industrial_machine_components_assembly_idx
  ON industrial_machine_components(assembly_id, visibility);
CREATE INDEX IF NOT EXISTS industrial_machine_components_factory_part_number_idx
  ON industrial_machine_components(factory_id, part_number);

ALTER TABLE industrial_requirements
  ADD COLUMN IF NOT EXISTS machine_id uuid,
  ADD COLUMN IF NOT EXISTS assembly_id uuid,
  ADD COLUMN IF NOT EXISTS component_id uuid;
ALTER TABLE industrial_recurring_requirements
  ADD COLUMN IF NOT EXISTS machine_id uuid,
  ADD COLUMN IF NOT EXISTS assembly_id uuid,
  ADD COLUMN IF NOT EXISTS component_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'industrial_requirements_machine_id_fkey') THEN
    ALTER TABLE industrial_requirements ADD CONSTRAINT industrial_requirements_machine_id_fkey
      FOREIGN KEY (machine_id) REFERENCES industrial_machines(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'industrial_requirements_assembly_id_fkey') THEN
    ALTER TABLE industrial_requirements ADD CONSTRAINT industrial_requirements_assembly_id_fkey
      FOREIGN KEY (assembly_id) REFERENCES industrial_machine_assemblies(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'industrial_requirements_component_id_fkey') THEN
    ALTER TABLE industrial_requirements ADD CONSTRAINT industrial_requirements_component_id_fkey
      FOREIGN KEY (component_id) REFERENCES industrial_machine_components(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'industrial_recurring_requirements_machine_id_fkey') THEN
    ALTER TABLE industrial_recurring_requirements ADD CONSTRAINT industrial_recurring_requirements_machine_id_fkey
      FOREIGN KEY (machine_id) REFERENCES industrial_machines(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'industrial_recurring_requirements_assembly_id_fkey') THEN
    ALTER TABLE industrial_recurring_requirements ADD CONSTRAINT industrial_recurring_requirements_assembly_id_fkey
      FOREIGN KEY (assembly_id) REFERENCES industrial_machine_assemblies(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'industrial_recurring_requirements_component_id_fkey') THEN
    ALTER TABLE industrial_recurring_requirements ADD CONSTRAINT industrial_recurring_requirements_component_id_fkey
      FOREIGN KEY (component_id) REFERENCES industrial_machine_components(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS industrial_requirements_technical_context_idx
  ON industrial_requirements(factory_id, machine_id, assembly_id, component_id);
CREATE INDEX IF NOT EXISTS industrial_recurring_requirements_technical_context_idx
  ON industrial_recurring_requirements(factory_id, machine_id, assembly_id, component_id);

COMMIT;
