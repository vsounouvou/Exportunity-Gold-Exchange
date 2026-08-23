BEGIN;

ALTER TABLE carrier_adapter_connections
  ADD COLUMN IF NOT EXISTS exportunity_integration_connection_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'carrier_adapter_connections'::regclass
      AND conname = 'carrier_adapter_connections_exportunity_connection_id_fkey'
  ) THEN
    ALTER TABLE carrier_adapter_connections
      ADD CONSTRAINT carrier_adapter_connections_exportunity_connection_id_fkey
      FOREIGN KEY (exportunity_integration_connection_id)
      REFERENCES exportunity_integration_connections(id)
      ON DELETE SET NULL;
  END IF;
END
$$;

-- Remove every foreign-key constraint attached to the retired legacy column.
-- Constraint names can vary between historical installers, so bind the lookup
-- to the exact table and constrained column rather than guessing one name.
DO $$
DECLARE
  legacy_constraint record;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'carrier_adapter_connections'
      AND column_name = 'integration_connection_id'
  ) THEN
    FOR legacy_constraint IN
      SELECT DISTINCT constraint_row.conname
      FROM pg_constraint constraint_row
      JOIN pg_attribute constrained_column
        ON constrained_column.attrelid = constraint_row.conrelid
       AND constrained_column.attnum = ANY(constraint_row.conkey)
      WHERE constraint_row.conrelid = 'carrier_adapter_connections'::regclass
        AND constraint_row.contype = 'f'
        AND constrained_column.attname = 'integration_connection_id'
    LOOP
      EXECUTE format(
        'ALTER TABLE carrier_adapter_connections DROP CONSTRAINT %I',
        legacy_constraint.conname
      );
    END LOOP;
  END IF;
END
$$;

-- Preserve historical evidence while retiring the former cross-product link.
-- Any affected record becomes restricted and must be reverified through the
-- Exportunity-native boundary before it can be considered ready again.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'carrier_adapter_connections'
      AND column_name = 'integration_connection_id'
  ) THEN
    UPDATE carrier_adapter_connections
    SET
      verification_evidence = COALESCE(verification_evidence, '{}'::jsonb)
        || jsonb_build_object(
          'legacyCrossProductReferenceRetired', true,
          'legacyCrossProductConnectionId', integration_connection_id::text,
          'legacyCrossProductReferenceRetiredAt', now()
        ),
      status = CASE
        WHEN status = 'verified' THEN 'restricted'::carrier_adapter_connection_status
        ELSE status
      END,
      restriction_status = CASE
        WHEN restriction_status = 'none' THEN 'legacy_cross_product_reference_retired'
        ELSE restriction_status
      END,
      integration_connection_id = NULL,
      updated_at = now()
    WHERE integration_connection_id IS NOT NULL;
  END IF;
END
$$;

ALTER TABLE carrier_adapter_connections
  DROP CONSTRAINT IF EXISTS carrier_adapter_connections_verified_check;

ALTER TABLE carrier_adapter_connections
  ADD CONSTRAINT carrier_adapter_connections_verified_check CHECK (
    status <> 'verified' OR (
      verification_evidence @> '{"verified": true}'::jsonb
      AND verification_evidence @> '{"credentialsExcluded": true}'::jsonb
      AND last_verified_at IS NOT NULL
      AND verified_by_user_id IS NOT NULL
      AND restriction_status = 'none'
      AND (
        exportunity_integration_connection_id IS NOT NULL
        OR credential_reference IS NOT NULL
      )
    )
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'carrier_adapter_connections'
      AND column_name = 'integration_connection_id'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'carrier_adapter_connections'::regclass
      AND conname = 'carrier_adapter_connections_legacy_reference_retired_check'
  ) THEN
    ALTER TABLE carrier_adapter_connections
      ADD CONSTRAINT carrier_adapter_connections_legacy_reference_retired_check
      CHECK (integration_connection_id IS NULL);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS carrier_adapter_connections_exportunity_connection_idx
  ON carrier_adapter_connections(tenant_id, exportunity_integration_connection_id)
  WHERE exportunity_integration_connection_id IS NOT NULL;

COMMIT;
