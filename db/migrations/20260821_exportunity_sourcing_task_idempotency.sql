-- Qualified Talk opportunities reuse one governed sourcing-review task.
ALTER TABLE intelligence_tasks
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS intelligence_tasks_tenant_idempotency_key_idx
  ON intelligence_tasks (tenant_id, idempotency_key);
