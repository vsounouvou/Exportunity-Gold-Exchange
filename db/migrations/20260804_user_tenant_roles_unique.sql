BEGIN;

DELETE FROM user_tenant_roles duplicate
USING user_tenant_roles canonical
WHERE duplicate.tenant_id = canonical.tenant_id
  AND duplicate.user_id = canonical.user_id
  AND duplicate.role = canonical.role
  AND duplicate.id > canonical.id;

CREATE UNIQUE INDEX IF NOT EXISTS user_tenant_roles_unique
  ON user_tenant_roles (tenant_id, user_id, role);

COMMIT;
