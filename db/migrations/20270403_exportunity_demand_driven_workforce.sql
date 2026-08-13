ALTER TABLE industrial_agent_staffing_requests
  ADD COLUMN IF NOT EXISTS demand_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS demand_threshold integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS signal_type text NOT NULL DEFAULT 'critical_capability_gap',
  ADD COLUMN IF NOT EXISTS evidence_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS last_signal_at timestamp,
  ADD COLUMN IF NOT EXISTS activated_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS activated_at timestamp,
  ADD COLUMN IF NOT EXISTS paused_at timestamp;

DROP INDEX IF EXISTS industrial_agent_staffing_requests_open_role_unique;

CREATE UNIQUE INDEX IF NOT EXISTS industrial_agent_staffing_requests_open_role_unique
  ON industrial_agent_staffing_requests(tenant_id, role_code)
  WHERE status IN ('monitoring', 'proposed', 'approved', 'provisioned', 'active', 'paused');

UPDATE industrial_agent_staffing_requests
SET evidence_items = jsonb_build_array(evidence),
    last_signal_at = coalesce(last_signal_at, updated_at)
WHERE jsonb_array_length(coalesce(evidence_items, '[]'::jsonb)) = 0
  AND evidence <> '{}'::jsonb;
