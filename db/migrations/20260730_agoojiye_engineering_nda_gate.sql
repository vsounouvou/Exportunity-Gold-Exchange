BEGIN;

ALTER TABLE agoojye_engineering_profiles
  ADD COLUMN IF NOT EXISTS nda_access_state text NOT NULL DEFAULT 'blocked',
  ADD COLUMN IF NOT EXISTS nda_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS nda_approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS invitation_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS invitation_delivery_id text,
  ADD COLUMN IF NOT EXISTS invitation_last_error text;

UPDATE agoojye_engineering_profiles
SET nda_access_state = CASE
  WHEN nda_status = 'signed' THEN 'required'
  ELSE 'blocked'
END
WHERE nda_access_state = 'blocked'
  AND nda_submitted_at IS NULL
  AND nda_approved_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'agoojye_engineering_profiles_nda_access_state_check'
  ) THEN
    ALTER TABLE agoojye_engineering_profiles
      ADD CONSTRAINT agoojye_engineering_profiles_nda_access_state_check
      CHECK (nda_access_state IN ('blocked', 'required', 'submitted', 'approved', 'rejected'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS agoojye_engineering_nda_documents (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  engineering_profile_id integer NOT NULL REFERENCES agoojye_engineering_profiles(id) ON DELETE CASCADE,
  project_user_id integer NOT NULL REFERENCES agoojye_project_users(id) ON DELETE CASCADE,
  uploaded_by_auth_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  original_name text NOT NULL,
  storage_key text NOT NULL,
  mime_type text NOT NULL,
  byte_size integer NOT NULL,
  sha256 text NOT NULL,
  encryption_version text NOT NULL DEFAULT 'aes-256-gcm-v1',
  status text NOT NULL DEFAULT 'submitted',
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by integer REFERENCES ece_users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS agoojye_engineering_nda_documents_storage_key_uidx
  ON agoojye_engineering_nda_documents(storage_key);
CREATE INDEX IF NOT EXISTS agoojye_engineering_nda_documents_tenant_profile_idx
  ON agoojye_engineering_nda_documents(tenant_id, engineering_profile_id, created_at);
CREATE INDEX IF NOT EXISTS agoojye_engineering_nda_documents_tenant_status_idx
  ON agoojye_engineering_nda_documents(tenant_id, status, created_at);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'agoojye_engineering_nda_documents_status_check'
  ) THEN
    ALTER TABLE agoojye_engineering_nda_documents
      ADD CONSTRAINT agoojye_engineering_nda_documents_status_check
      CHECK (status IN ('submitted', 'approved', 'rejected', 'replaced'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS agoojye_engineering_nda_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  engineering_profile_id integer NOT NULL REFERENCES agoojye_engineering_profiles(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES ece_users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS agoojye_engineering_nda_sessions_token_uidx
  ON agoojye_engineering_nda_sessions(token_hash);
CREATE INDEX IF NOT EXISTS agoojye_engineering_nda_sessions_profile_expiry_idx
  ON agoojye_engineering_nda_sessions(engineering_profile_id, expires_at);

COMMIT;
