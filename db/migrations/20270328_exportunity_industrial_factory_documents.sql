-- Private factory-wide evidence register for Exportunity Machinery.
-- Uploading evidence never changes verification, public visibility, quoting,
-- procurement, manufacturing, payments, or supplier communication.

CREATE TABLE IF NOT EXISTS industrial_factory_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  factory_id uuid NOT NULL REFERENCES industrial_factories(id) ON DELETE CASCADE,
  uploaded_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  document_type text NOT NULL,
  title text NOT NULL,
  file_name text NOT NULL,
  storage_key text NOT NULL,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL,
  visibility industrial_visibility NOT NULL DEFAULT 'factory_team_only',
  expires_at timestamp,
  archived_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS industrial_factory_documents_factory_active_idx
  ON industrial_factory_documents(factory_id, archived_at, updated_at);
CREATE INDEX IF NOT EXISTS industrial_factory_documents_tenant_type_idx
  ON industrial_factory_documents(tenant_id, document_type, archived_at);
