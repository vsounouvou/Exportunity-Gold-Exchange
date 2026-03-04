-- AgentOS v1: registry, memory clues, templates, playbooks, jobs, audit logging

CREATE TABLE IF NOT EXISTS agent_registry (
  agent_id integer PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
  company_id integer REFERENCES companies(id) ON DELETE CASCADE,
  department_id integer REFERENCES departments(id) ON DELETE SET NULL,
  role text,
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  openai_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  memory_scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  default_playbooks jsonb NOT NULL DEFAULT '[]'::jsonb,
  handoff_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_registry_company_idx ON agent_registry(company_id);
CREATE INDEX IF NOT EXISTS agent_registry_department_idx ON agent_registry(department_id);

CREATE TABLE IF NOT EXISTS clues (
  clue_id serial PRIMARY KEY,
  scope text NOT NULL DEFAULT 'personal',
  agent_id integer REFERENCES agents(id) ON DELETE SET NULL,
  company_id integer REFERENCES companies(id) ON DELETE CASCADE,
  department_id integer REFERENCES departments(id) ON DELETE SET NULL,
  entity_id text,
  type text NOT NULL,
  content text NOT NULL,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  confidence numeric(3,2) NOT NULL DEFAULT 0.50,
  pinned boolean NOT NULL DEFAULT false,
  expires_at timestamp,
  evidence_ref text,
  embedding jsonb,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS clues_scope_company_idx ON clues(scope, company_id);
CREATE INDEX IF NOT EXISTS clues_agent_idx ON clues(agent_id);
CREATE INDEX IF NOT EXISTS clues_department_idx ON clues(department_id);
CREATE INDEX IF NOT EXISTS clues_entity_idx ON clues(entity_id);
CREATE INDEX IF NOT EXISTS clues_expires_idx ON clues(expires_at);

CREATE TABLE IF NOT EXISTS templates (
  template_id serial PRIMARY KEY,
  company_id integer REFERENCES companies(id) ON DELETE CASCADE,
  use_case text NOT NULL,
  channel text NOT NULL,
  language text NOT NULL,
  tone text NOT NULL DEFAULT 'neutral',
  subject text,
  body text NOT NULL,
  required_vars jsonb NOT NULL DEFAULT '[]'::jsonb,
  version text NOT NULL DEFAULT '1.0.0',
  approved boolean NOT NULL DEFAULT false,
  created_by text,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS templates_company_use_case_idx ON templates(company_id, use_case);
CREATE INDEX IF NOT EXISTS templates_approved_idx ON templates(approved);

CREATE TABLE IF NOT EXISTS playbooks (
  playbook_id serial PRIMARY KEY,
  company_id integer REFERENCES companies(id) ON DELETE CASCADE,
  department_id integer REFERENCES departments(id) ON DELETE SET NULL,
  name text NOT NULL,
  description text,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS playbooks_company_idx ON playbooks(company_id);
CREATE INDEX IF NOT EXISTS playbooks_department_idx ON playbooks(department_id);

CREATE TABLE IF NOT EXISTS playbook_steps (
  step_id serial PRIMARY KEY,
  playbook_id integer NOT NULL REFERENCES playbooks(playbook_id) ON DELETE CASCADE,
  step_order integer NOT NULL,
  type text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  inputs_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  outputs_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  retry_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  on_fail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  UNIQUE(playbook_id, step_order)
);

CREATE INDEX IF NOT EXISTS playbook_steps_playbook_idx ON playbook_steps(playbook_id);

CREATE TABLE IF NOT EXISTS agent_jobs (
  job_id text PRIMARY KEY,
  company_id integer REFERENCES companies(id) ON DELETE CASCADE,
  agent_id integer REFERENCES agents(id) ON DELETE SET NULL,
  title text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued',
  error text,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_jobs_company_idx ON agent_jobs(company_id);
CREATE INDEX IF NOT EXISTS agent_jobs_agent_idx ON agent_jobs(agent_id);
CREATE INDEX IF NOT EXISTS agent_jobs_status_idx ON agent_jobs(status);

CREATE TABLE IF NOT EXISTS agent_audit_log (
  log_id serial PRIMARY KEY,
  job_id text NOT NULL REFERENCES agent_jobs(job_id) ON DELETE CASCADE,
  agent_id integer REFERENCES agents(id) ON DELETE SET NULL,
  action_type text NOT NULL,
  inputs_hash text,
  inputs jsonb,
  outputs jsonb,
  outputs_ref text,
  status text NOT NULL DEFAULT 'ok',
  error text,
  latency_ms integer,
  token_usage jsonb,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_audit_job_idx ON agent_audit_log(job_id);
CREATE INDEX IF NOT EXISTS agent_audit_agent_idx ON agent_audit_log(agent_id);
CREATE INDEX IF NOT EXISTS agent_audit_action_idx ON agent_audit_log(action_type);
CREATE INDEX IF NOT EXISTS agent_audit_status_idx ON agent_audit_log(status);

