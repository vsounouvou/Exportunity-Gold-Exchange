ALTER TABLE industrial_agent_staffing_requests
  ADD COLUMN IF NOT EXISTS company_brain_context_pack_id integer REFERENCES company_brain_context_packs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS governance_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS governance_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS industrial_agent_staffing_requests_governance_idx
  ON industrial_agent_staffing_requests(tenant_id, governance_status, updated_at);

COMMENT ON COLUMN industrial_agent_staffing_requests.company_brain_context_pack_id IS
  'Frozen governed Company Brain context used for the latest staffing review.';

COMMENT ON COLUMN industrial_agent_staffing_requests.governance_snapshot IS
  'Citations, conflicts, open questions, approval requirements, and freshness captured for the staffing decision.';
