-- MindBase MVP upgrade (additive, non-destructive)
-- Safe to run repeatedly.

CREATE EXTENSION IF NOT EXISTS vector;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'intellect_conversation_channel') THEN
    ALTER TYPE intellect_conversation_channel ADD VALUE IF NOT EXISTS 'email';
    ALTER TYPE intellect_conversation_channel ADD VALUE IF NOT EXISTS 'api';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mindbase_user_role') THEN
    CREATE TYPE mindbase_user_role AS ENUM ('admin', 'creator', 'client');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mindbase_workspace_member_role') THEN
    CREATE TYPE mindbase_workspace_member_role AS ENUM ('owner', 'admin', 'member');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mindbase_email_direction') THEN
    CREATE TYPE mindbase_email_direction AS ENUM ('inbound', 'outbound');
  END IF;
END
$$;

ALTER TABLE intellects
  ADD COLUMN IF NOT EXISTS agent_email text;

CREATE UNIQUE INDEX IF NOT EXISTS intellects_agent_email_unique ON intellects(agent_email);

ALTER TABLE intellect_knowledge_chunks
  ADD COLUMN IF NOT EXISTS embedding_vector vector(1536);

CREATE INDEX IF NOT EXISTS intellect_knowledge_chunks_embedding_vector_idx
  ON intellect_knowledge_chunks
  USING ivfflat (embedding_vector vector_cosine_ops)
  WITH (lists = 100);

CREATE TABLE IF NOT EXISTS mindbase_mindbases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  owner_user_id integer NOT NULL REFERENCES ece_users(id) ON DELETE CASCADE,
  slug text NOT NULL,
  title text NOT NULL,
  tagline text,
  description text,
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS mindbase_mindbases_tenant_slug_unique
  ON mindbase_mindbases(tenant_id, slug);
CREATE UNIQUE INDEX IF NOT EXISTS mindbase_mindbases_tenant_owner_unique
  ON mindbase_mindbases(tenant_id, owner_user_id);
CREATE INDEX IF NOT EXISTS mindbase_mindbases_tenant_published_idx
  ON mindbase_mindbases(tenant_id, is_published, updated_at DESC);

CREATE TABLE IF NOT EXISTS mindbase_user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES ece_users(id) ON DELETE CASCADE,
  role mindbase_user_role NOT NULL DEFAULT 'client',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS mindbase_user_roles_tenant_user_role_unique
  ON mindbase_user_roles(tenant_id, user_id, role);
CREATE INDEX IF NOT EXISTS mindbase_user_roles_tenant_user_idx
  ON mindbase_user_roles(tenant_id, user_id);

CREATE TABLE IF NOT EXISTS mindbase_workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  owner_user_id integer NOT NULL REFERENCES ece_users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mindbase_workspaces_tenant_owner_idx
  ON mindbase_workspaces(tenant_id, owner_user_id);
CREATE INDEX IF NOT EXISTS mindbase_workspaces_tenant_name_idx
  ON mindbase_workspaces(tenant_id, name);

CREATE TABLE IF NOT EXISTS mindbase_workspace_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES mindbase_workspaces(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES ece_users(id) ON DELETE CASCADE,
  role mindbase_workspace_member_role NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS mindbase_workspace_members_workspace_user_unique
  ON mindbase_workspace_members(workspace_id, user_id);
CREATE INDEX IF NOT EXISTS mindbase_workspace_members_tenant_user_idx
  ON mindbase_workspace_members(tenant_id, user_id);

CREATE TABLE IF NOT EXISTS mindbase_workspace_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES mindbase_workspaces(id) ON DELETE CASCADE,
  intellect_id uuid NOT NULL REFERENCES intellects(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS mindbase_workspace_agents_workspace_intellect_unique
  ON mindbase_workspace_agents(workspace_id, intellect_id);
CREATE INDEX IF NOT EXISTS mindbase_workspace_agents_tenant_workspace_idx
  ON mindbase_workspace_agents(tenant_id, workspace_id);

ALTER TABLE intellect_conversations
  ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES mindbase_workspaces(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS intellect_conversations_workspace_idx
  ON intellect_conversations(workspace_id);

CREATE TABLE IF NOT EXISTS mindbase_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES mindbase_workspaces(id) ON DELETE CASCADE,
  key_hash text NOT NULL,
  label text,
  created_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS mindbase_api_keys_key_hash_unique
  ON mindbase_api_keys(key_hash);
CREATE INDEX IF NOT EXISTS mindbase_api_keys_tenant_workspace_idx
  ON mindbase_api_keys(tenant_id, workspace_id);

CREATE TABLE IF NOT EXISTS mindbase_email_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  intellect_id uuid NOT NULL REFERENCES intellects(id) ON DELETE CASCADE,
  from_email text NOT NULL,
  to_email text NOT NULL,
  subject text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mindbase_email_threads_intellect_last_message_idx
  ON mindbase_email_threads(intellect_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS mindbase_email_threads_tenant_created_idx
  ON mindbase_email_threads(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS mindbase_email_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  thread_id uuid NOT NULL REFERENCES mindbase_email_threads(id) ON DELETE CASCADE,
  direction mindbase_email_direction NOT NULL DEFAULT 'inbound',
  from_email text,
  to_email text,
  message_id text,
  raw_text text,
  parsed_text text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mindbase_email_messages_thread_created_idx
  ON mindbase_email_messages(thread_id, created_at);
CREATE INDEX IF NOT EXISTS mindbase_email_messages_tenant_created_idx
  ON mindbase_email_messages(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS mindbase_credits_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES ece_users(id) ON DELETE CASCADE,
  delta_int integer NOT NULL,
  reason text NOT NULL,
  metadata jsonb,
  request_correlation_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mindbase_credits_ledger_tenant_user_created_idx
  ON mindbase_credits_ledger(tenant_id, user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS mindbase_credits_ledger_correlation_idx
  ON mindbase_credits_ledger(request_correlation_id);

ALTER TABLE mindbase_usage_events
  ADD COLUMN IF NOT EXISTS request_correlation_id text;

CREATE UNIQUE INDEX IF NOT EXISTS mindbase_usage_events_unique_correlation_idx
  ON mindbase_usage_events(tenant_id, user_id, intellect_id, request_correlation_id)
  WHERE request_correlation_id IS NOT NULL;
