-- Keep Exportunity actions invisible to legacy global workers that share the
-- database. The current Exportunity worker claims workerScope=tenant rows and
-- evaluates tenantRunAt; legacy workers continue to evaluate runAt and see only
-- the far-future barrier.

CREATE OR REPLACE FUNCTION enforce_exportunity_action_worker_isolation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  barrier_run_at constant text := '2100-01-01T00:00:00.000Z';
  current_run_at text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM tenants
    WHERE id = NEW.tenant_id
      AND lower(key) = 'exportunity'
  ) THEN
    NEW.metadata := COALESCE(NEW.metadata, '{}'::jsonb);
    current_run_at := NULLIF(btrim(NEW.metadata->>'runAt'), '');

    IF current_run_at IS NOT NULL AND current_run_at <> barrier_run_at THEN
      NEW.metadata := NEW.metadata || jsonb_build_object(
        'tenantRunAt', current_run_at
      );
    END IF;

    NEW.metadata := NEW.metadata || jsonb_build_object(
      'workerScope', 'tenant',
      'workerTenantId', NEW.tenant_id,
      'workerTenantKey', 'exportunity',
      'runAt', barrier_run_at,
      'legacyWorkerBarrier', true
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS action_requests_exportunity_worker_isolation
  ON action_requests;

CREATE TRIGGER action_requests_exportunity_worker_isolation
BEFORE INSERT OR UPDATE OF tenant_id, status, lifecycle_state, metadata,
  next_retry_at, claimed_until
ON action_requests
FOR EACH ROW
EXECUTE FUNCTION enforce_exportunity_action_worker_isolation();

UPDATE action_requests AS ar
SET metadata = enforce_update.protected_metadata,
    updated_at = now()
FROM (
  SELECT
    candidate.id,
    COALESCE(candidate.metadata, '{}'::jsonb)
      || CASE
        WHEN NULLIF(btrim(candidate.metadata->>'runAt'), '') IS NOT NULL
          AND candidate.metadata->>'runAt' <> '2100-01-01T00:00:00.000Z'
        THEN jsonb_build_object(
          'tenantRunAt', candidate.metadata->>'runAt'
        )
        ELSE '{}'::jsonb
      END
      || jsonb_build_object(
        'workerScope', 'tenant',
        'workerTenantId', candidate.tenant_id,
        'workerTenantKey', 'exportunity',
        'runAt', '2100-01-01T00:00:00.000Z',
        'legacyWorkerBarrier', true
      ) AS protected_metadata
  FROM action_requests AS candidate
  JOIN tenants AS tenant
    ON tenant.id = candidate.tenant_id
  WHERE lower(tenant.key) = 'exportunity'
) AS enforce_update
WHERE ar.id = enforce_update.id
  AND ar.metadata IS DISTINCT FROM enforce_update.protected_metadata;
