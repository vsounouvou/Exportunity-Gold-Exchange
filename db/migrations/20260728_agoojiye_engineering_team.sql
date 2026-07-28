BEGIN;

CREATE TABLE IF NOT EXISTS agoojye_engineering_profiles (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  project_user_id integer NOT NULL REFERENCES agoojye_project_users(id) ON DELETE CASCADE,
  source_uid text NOT NULL,
  source_name text NOT NULL,
  source_rows jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_hash text NOT NULL,
  corporate_email text NOT NULL,
  personal_email text,
  study_program text,
  source_squad text,
  discipline text NOT NULL,
  assignment_confidence text NOT NULL DEFAULT 'source',
  skills jsonb NOT NULL DEFAULT '[]'::jsonb,
  nda_status text NOT NULL DEFAULT 'not_recorded',
  nda_url text,
  onboarding_state text NOT NULL DEFAULT 'prepared',
  invitation_state text NOT NULL DEFAULT 'not_sent',
  mailbox_state text NOT NULL DEFAULT 'pending',
  source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS agoojye_engineering_profiles_tenant_source_uidx
  ON agoojye_engineering_profiles(tenant_id, source_uid);
CREATE UNIQUE INDEX IF NOT EXISTS agoojye_engineering_profiles_tenant_user_uidx
  ON agoojye_engineering_profiles(tenant_id, project_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS agoojye_engineering_profiles_tenant_email_uidx
  ON agoojye_engineering_profiles(tenant_id, corporate_email);
CREATE INDEX IF NOT EXISTS agoojye_engineering_profiles_tenant_discipline_idx
  ON agoojye_engineering_profiles(tenant_id, discipline);
CREATE INDEX IF NOT EXISTS agoojye_engineering_profiles_tenant_onboarding_idx
  ON agoojye_engineering_profiles(tenant_id, onboarding_state, invitation_state);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'agoojye_engineering_profiles_nda_status_check'
  ) THEN
    ALTER TABLE agoojye_engineering_profiles
      ADD CONSTRAINT agoojye_engineering_profiles_nda_status_check
      CHECK (nda_status IN ('signed', 'not_recorded'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'agoojye_engineering_profiles_invitation_state_check'
  ) THEN
    ALTER TABLE agoojye_engineering_profiles
      ADD CONSTRAINT agoojye_engineering_profiles_invitation_state_check
      CHECK (invitation_state IN ('not_sent', 'prepared', 'sent', 'accepted', 'cancelled'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'agoojye_engineering_profiles_mailbox_state_check'
  ) THEN
    ALTER TABLE agoojye_engineering_profiles
      ADD CONSTRAINT agoojye_engineering_profiles_mailbox_state_check
      CHECK (mailbox_state IN ('pending', 'provisioned', 'existing', 'failed', 'unavailable'));
  END IF;
END $$;

COMMIT;
