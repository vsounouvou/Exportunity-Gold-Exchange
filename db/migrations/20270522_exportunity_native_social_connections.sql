-- Additive Exportunity-native provider references for social and advertising
-- operations. Legacy references remain nullable evidence only; no token or
-- provider payload is copied by this migration.

ALTER TABLE IF EXISTS social_publication_targets
  ADD COLUMN IF NOT EXISTS exportunity_integration_connection_id uuid;

ALTER TABLE IF EXISTS social_publication_attempts
  ADD COLUMN IF NOT EXISTS exportunity_integration_connection_id uuid;

ALTER TABLE IF EXISTS ad_account_connections
  ADD COLUMN IF NOT EXISTS exportunity_integration_connection_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'social_publication_targets_exportunity_connection_fk'
  ) THEN
    ALTER TABLE social_publication_targets
      ADD CONSTRAINT social_publication_targets_exportunity_connection_fk
      FOREIGN KEY (exportunity_integration_connection_id)
      REFERENCES exportunity_integration_connections(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'social_publication_attempts_exportunity_connection_fk'
  ) THEN
    ALTER TABLE social_publication_attempts
      ADD CONSTRAINT social_publication_attempts_exportunity_connection_fk
      FOREIGN KEY (exportunity_integration_connection_id)
      REFERENCES exportunity_integration_connections(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ad_account_connections_exportunity_connection_fk'
  ) THEN
    ALTER TABLE ad_account_connections
      ADD CONSTRAINT ad_account_connections_exportunity_connection_fk
      FOREIGN KEY (exportunity_integration_connection_id)
      REFERENCES exportunity_integration_connections(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS social_publication_targets_exportunity_connection_idx
  ON social_publication_targets(exportunity_integration_connection_id);

CREATE INDEX IF NOT EXISTS social_publication_attempts_exportunity_connection_idx
  ON social_publication_attempts(exportunity_integration_connection_id);

CREATE INDEX IF NOT EXISTS ad_account_connections_exportunity_connection_idx
  ON ad_account_connections(exportunity_integration_connection_id);

-- No legacy row is rebound automatically. Provider account labels are not a
-- sufficiently strong identity proof. Existing targets must be rediscovered
-- and selected through the Exportunity-native read-only flow before they can
-- participate in a new webhook, publication, or advertising operation.
