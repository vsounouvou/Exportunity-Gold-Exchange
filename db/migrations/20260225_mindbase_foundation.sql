-- Mindbase foundation (connected tenant architecture)
-- Additive migration only. Safe to run multiple times.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'creator_verification_status') THEN
    CREATE TYPE creator_verification_status AS ENUM ('unverified', 'pending', 'verified');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'intellect_access_policy') THEN
    CREATE TYPE intellect_access_policy AS ENUM ('private', 'public', 'paid');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'intellect_publish_status') THEN
    CREATE TYPE intellect_publish_status AS ENUM ('draft', 'pending', 'approved', 'rejected');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'intellect_knowledge_scope') THEN
    CREATE TYPE intellect_knowledge_scope AS ENUM ('private', 'public', 'monetized');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'intellect_knowledge_file_status') THEN
    CREATE TYPE intellect_knowledge_file_status AS ENUM ('uploaded', 'processed', 'failed');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'intellect_conversation_channel') THEN
    CREATE TYPE intellect_conversation_channel AS ENUM ('web', 'whatsapp', 'telegram');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'intellect_message_sender') THEN
    CREATE TYPE intellect_message_sender AS ENUM ('user', 'assistant', 'system');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS creator_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES ece_users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  headline text,
  bio text,
  avatar_url text,
  location text,
  share_slug text NOT NULL,
  verification_status creator_verification_status NOT NULL DEFAULT 'unverified',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS creator_profiles_tenant_user_unique ON creator_profiles(tenant_id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS creator_profiles_tenant_slug_unique ON creator_profiles(tenant_id, share_slug);
CREATE INDEX IF NOT EXISTS creator_profiles_tenant_created_idx ON creator_profiles(tenant_id, created_at);

CREATE TABLE IF NOT EXISTS intellects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  owner_user_id integer NOT NULL REFERENCES ece_users(id) ON DELETE CASCADE,
  agent_id integer,
  name text NOT NULL,
  slug text NOT NULL,
  tagline text,
  description text,
  category text NOT NULL DEFAULT 'general',
  tags text[] NOT NULL DEFAULT '{}',
  persona_role text,
  persona_tone text,
  persona_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  style_constraints jsonb NOT NULL DEFAULT '[]'::jsonb,
  system_prompt text,
  access_policy intellect_access_policy NOT NULL DEFAULT 'private',
  price_per_100_messages integer NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT false,
  publish_status intellect_publish_status NOT NULL DEFAULT 'draft',
  usage_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS intellects_tenant_slug_unique ON intellects(tenant_id, slug);
CREATE INDEX IF NOT EXISTS intellects_tenant_owner_idx ON intellects(tenant_id, owner_user_id);
CREATE INDEX IF NOT EXISTS intellects_tenant_publish_idx ON intellects(tenant_id, is_published, publish_status);
CREATE INDEX IF NOT EXISTS intellects_tenant_category_idx ON intellects(tenant_id, category);

CREATE TABLE IF NOT EXISTS intellect_knowledge_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  intellect_id uuid NOT NULL REFERENCES intellects(id) ON DELETE CASCADE,
  scope intellect_knowledge_scope NOT NULL DEFAULT 'private',
  filename text NOT NULL,
  mime text,
  storage_url text NOT NULL,
  extracted_text text,
  status intellect_knowledge_file_status NOT NULL DEFAULT 'uploaded',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS intellect_knowledge_files_tenant_intellect_idx ON intellect_knowledge_files(tenant_id, intellect_id);
CREATE INDEX IF NOT EXISTS intellect_knowledge_files_tenant_status_idx ON intellect_knowledge_files(tenant_id, status);

CREATE TABLE IF NOT EXISTS intellect_knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  intellect_id uuid NOT NULL REFERENCES intellects(id) ON DELETE CASCADE,
  file_id uuid NOT NULL REFERENCES intellect_knowledge_files(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL DEFAULT 0,
  source_filename text,
  chunk_text text NOT NULL,
  embedding jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS intellect_knowledge_chunks_file_chunk_unique ON intellect_knowledge_chunks(file_id, chunk_index);
CREATE INDEX IF NOT EXISTS intellect_knowledge_chunks_tenant_intellect_idx ON intellect_knowledge_chunks(tenant_id, intellect_id);

CREATE TABLE IF NOT EXISTS intellect_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel intellect_conversation_channel NOT NULL DEFAULT 'web',
  external_thread_id text,
  user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  intellect_id uuid NOT NULL REFERENCES intellects(id) ON DELETE CASCADE,
  title text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE INDEX IF NOT EXISTS intellect_conversations_tenant_user_idx ON intellect_conversations(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS intellect_conversations_tenant_intellect_idx ON intellect_conversations(tenant_id, intellect_id);

CREATE TABLE IF NOT EXISTS intellect_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES intellect_conversations(id) ON DELETE CASCADE,
  sender_type intellect_message_sender NOT NULL,
  sender_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  content text NOT NULL,
  citations jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS intellect_messages_conversation_created_idx ON intellect_messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS mindbase_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  intellect_id uuid NOT NULL REFERENCES intellects(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES intellect_conversations(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  amount_int integer NOT NULL DEFAULT 0,
  amount_usd numeric(14,2),
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mindbase_usage_events_tenant_created_idx ON mindbase_usage_events(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS mindbase_usage_events_tenant_intellect_idx ON mindbase_usage_events(tenant_id, intellect_id);
CREATE INDEX IF NOT EXISTS mindbase_usage_events_tenant_user_idx ON mindbase_usage_events(tenant_id, user_id);
