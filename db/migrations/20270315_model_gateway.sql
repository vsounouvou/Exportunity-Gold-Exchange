DO $$
BEGIN
  CREATE TYPE model_tier AS ENUM ('TIER_LOCAL_TINY', 'TIER_LOCAL_GPU', 'TIER_EXTERNAL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE model_provider AS ENUM ('llama_cpp', 'vllm', 'openai', 'anthropic');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE model_log_status AS ENUM ('success', 'error', 'degraded');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE tool_risk_level AS ENUM ('low', 'medium', 'high', 'critical');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE eval_run_status AS ENUM ('running', 'completed', 'failed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS model_registry (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  tier model_tier NOT NULL,
  provider model_provider NOT NULL,
  base_model TEXT NOT NULL,
  quantization TEXT,
  context_len INTEGER NOT NULL DEFAULT 8192,
  endpoint_url TEXT,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  tenant_scope INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS model_registry_tier_enabled_idx
  ON model_registry (tier, is_enabled);

CREATE INDEX IF NOT EXISTS model_registry_tenant_scope_idx
  ON model_registry (tenant_scope, is_enabled);

CREATE INDEX IF NOT EXISTS model_registry_provider_idx
  ON model_registry (provider, is_enabled);

CREATE TABLE IF NOT EXISTS agent_model_policy (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_id INTEGER NOT NULL,
  max_tier_allowed model_tier NOT NULL DEFAULT 'TIER_LOCAL_TINY',
  default_model_id INTEGER REFERENCES model_registry(id) ON DELETE SET NULL,
  max_tokens_per_day INTEGER NOT NULL DEFAULT 20000,
  max_requests_per_minute INTEGER NOT NULL DEFAULT 30,
  tools_allowlist JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS agent_model_policy_tenant_agent_uidx
  ON agent_model_policy (tenant_id, agent_id);

CREATE INDEX IF NOT EXISTS agent_model_policy_tier_idx
  ON agent_model_policy (tenant_id, max_tier_allowed);

CREATE TABLE IF NOT EXISTS tool_governor_registry (
  id SERIAL PRIMARY KEY,
  tool_key TEXT NOT NULL,
  name TEXT NOT NULL,
  risk_level tool_risk_level NOT NULL DEFAULT 'medium',
  handler TEXT NOT NULL,
  permissions_required JSONB NOT NULL DEFAULT '[]'::jsonb,
  allowlist_domains JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tool_governor_registry_tool_key_uidx
  ON tool_governor_registry (tool_key);

CREATE INDEX IF NOT EXISTS tool_governor_registry_enabled_idx
  ON tool_governor_registry (is_enabled);

CREATE TABLE IF NOT EXISTS model_gateway_logs (
  id BIGSERIAL PRIMARY KEY,
  trace_id TEXT NOT NULL,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_id INTEGER NOT NULL,
  session_id TEXT,
  workspace TEXT,
  domain TEXT,
  request_messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  response_message TEXT,
  tool_calls JSONB NOT NULL DEFAULT '[]'::jsonb,
  tool_results JSONB NOT NULL DEFAULT '[]'::jsonb,
  model_id INTEGER REFERENCES model_registry(id) ON DELETE SET NULL,
  model_name TEXT,
  model_tier model_tier,
  provider model_provider,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  cost_usd NUMERIC(14, 6) NOT NULL DEFAULT 0,
  status model_log_status NOT NULL DEFAULT 'success',
  error_code TEXT,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS model_gateway_logs_trace_uidx
  ON model_gateway_logs (trace_id);

CREATE INDEX IF NOT EXISTS model_gateway_logs_tenant_agent_created_idx
  ON model_gateway_logs (tenant_id, agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS model_gateway_logs_model_created_idx
  ON model_gateway_logs (model_name, created_at DESC);

CREATE INDEX IF NOT EXISTS model_gateway_logs_status_created_idx
  ON model_gateway_logs (status, created_at DESC);

CREATE TABLE IF NOT EXISTS eval_cases (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
  suite_name TEXT NOT NULL,
  case_name TEXT NOT NULL,
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  expected_json_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  expected_tool TEXT,
  expected_assertions JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS eval_cases_tenant_suite_idx
  ON eval_cases (tenant_id, suite_name, is_active);

CREATE TABLE IF NOT EXISTS eval_runs (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INTEGER REFERENCES tenants(id) ON DELETE CASCADE,
  suite_name TEXT NOT NULL,
  model_id INTEGER REFERENCES model_registry(id) ON DELETE SET NULL,
  status eval_run_status NOT NULL DEFAULT 'running',
  score NUMERIC(7, 4),
  regressions INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS eval_runs_suite_status_idx
  ON eval_runs (suite_name, status, created_at DESC);

CREATE INDEX IF NOT EXISTS eval_runs_tenant_created_idx
  ON eval_runs (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS eval_results (
  id BIGSERIAL PRIMARY KEY,
  run_id BIGINT NOT NULL REFERENCES eval_runs(id) ON DELETE CASCADE,
  case_id INTEGER REFERENCES eval_cases(id) ON DELETE SET NULL,
  trace_id TEXT,
  passed BOOLEAN NOT NULL DEFAULT false,
  score NUMERIC(7, 4),
  assertions JSONB NOT NULL DEFAULT '[]'::jsonb,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS eval_results_run_idx
  ON eval_results (run_id, created_at DESC);

CREATE INDEX IF NOT EXISTS eval_results_case_idx
  ON eval_results (case_id, created_at DESC);

CREATE TABLE IF NOT EXISTS model_gateway_traces (
  id BIGSERIAL PRIMARY KEY,
  trace_id TEXT NOT NULL,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_id INTEGER NOT NULL,
  session_id TEXT,
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  tool_calls JSONB NOT NULL DEFAULT '[]'::jsonb,
  tool_results JSONB NOT NULL DEFAULT '[]'::jsonb,
  final_answer TEXT,
  rating INTEGER,
  model_name TEXT,
  provider model_provider,
  is_gold BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS model_gateway_traces_trace_uidx
  ON model_gateway_traces (trace_id);

CREATE INDEX IF NOT EXISTS model_gateway_traces_tenant_created_idx
  ON model_gateway_traces (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS model_gateway_traces_gold_created_idx
  ON model_gateway_traces (tenant_id, is_gold, created_at DESC);

INSERT INTO tool_governor_registry (tool_key, name, risk_level, handler, permissions_required, allowlist_domains, is_enabled)
VALUES
  ('DB_QUERY_READONLY', 'Tenant-scoped read-only DB lookup', 'medium', 'db_query_readonly', '["model_gateway:tool:db_read"]'::jsonb, '[]'::jsonb, true),
  ('HTTP_FETCH_ALLOWLIST', 'Allowlist HTTP fetch for internal endpoints', 'high', 'http_fetch_allowlist', '["model_gateway:tool:http_fetch"]'::jsonb, '[]'::jsonb, true)
ON CONFLICT (tool_key) DO NOTHING;
