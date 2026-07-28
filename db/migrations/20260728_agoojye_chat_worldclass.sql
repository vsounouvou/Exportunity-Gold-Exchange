BEGIN;

ALTER TABLE agoojye_os_messages
  ADD COLUMN IF NOT EXISTS thread_root_message_id integer,
  ADD COLUMN IF NOT EXISTS client_message_id text,
  ADD COLUMN IF NOT EXISTS edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'sent',
  ADD COLUMN IF NOT EXISTS confidentiality integer NOT NULL DEFAULT 2;

UPDATE agoojye_os_messages
SET sent_at = COALESCE(sent_at, created_at)
WHERE sent_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS agoojye_os_messages_tenant_channel_client_uidx
  ON agoojye_os_messages(tenant_id, channel_id, client_message_id)
  WHERE client_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS agoojye_os_messages_thread_idx
  ON agoojye_os_messages(tenant_id, thread_root_message_id, created_at);

ALTER TABLE agoojye_tasks
  ADD COLUMN IF NOT EXISTS source_channel_id integer,
  ADD COLUMN IF NOT EXISTS source_message_id integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agoojye_tasks_source_channel_fk'
  ) THEN
    ALTER TABLE agoojye_tasks
      ADD CONSTRAINT agoojye_tasks_source_channel_fk
      FOREIGN KEY (source_channel_id) REFERENCES agoojye_os_channels(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agoojye_tasks_source_message_fk'
  ) THEN
    ALTER TABLE agoojye_tasks
      ADD CONSTRAINT agoojye_tasks_source_message_fk
      FOREIGN KEY (source_message_id) REFERENCES agoojye_os_messages(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS agoojye_tasks_source_message_idx
  ON agoojye_tasks(tenant_id, source_message_id)
  WHERE source_message_id IS NOT NULL;

ALTER TABLE agoojye_os_decisions
  ADD COLUMN IF NOT EXISTS source_channel_id integer REFERENCES agoojye_os_channels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_message_id integer REFERENCES agoojye_os_messages(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS agoojye_os_conversation_reads (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel_id integer NOT NULL REFERENCES agoojye_os_channels(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES agoojye_project_users(id) ON DELETE CASCADE,
  last_read_message_id integer REFERENCES agoojye_os_messages(id) ON DELETE SET NULL,
  last_read_at timestamptz,
  marked_unread_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS agoojye_os_conversation_reads_channel_user_uidx
  ON agoojye_os_conversation_reads(channel_id, user_id);
CREATE INDEX IF NOT EXISTS agoojye_os_conversation_reads_tenant_user_idx
  ON agoojye_os_conversation_reads(tenant_id, user_id, updated_at DESC);

INSERT INTO agoojye_os_conversation_reads (
  tenant_id,
  channel_id,
  user_id,
  last_read_message_id,
  last_read_at
)
SELECT
  cm.tenant_id,
  cm.channel_id,
  cm.user_id,
  (
    SELECT max(m.id)
    FROM agoojye_os_messages m
    WHERE m.tenant_id = cm.tenant_id
      AND m.channel_id = cm.channel_id
      AND (cm.last_read_at IS NULL OR m.created_at <= cm.last_read_at)
  ),
  cm.last_read_at
FROM agoojye_os_channel_members cm
ON CONFLICT (channel_id, user_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS agoojye_os_conversation_preferences (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel_id integer NOT NULL REFERENCES agoojye_os_channels(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES agoojye_project_users(id) ON DELETE CASCADE,
  favorite boolean NOT NULL DEFAULT false,
  archived boolean NOT NULL DEFAULT false,
  muted_until timestamptz,
  folder text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS agoojye_os_conversation_preferences_channel_user_uidx
  ON agoojye_os_conversation_preferences(channel_id, user_id);
CREATE INDEX IF NOT EXISTS agoojye_os_conversation_preferences_tenant_user_idx
  ON agoojye_os_conversation_preferences(tenant_id, user_id);

CREATE TABLE IF NOT EXISTS agoojye_os_message_deliveries (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  message_id integer NOT NULL REFERENCES agoojye_os_messages(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES agoojye_project_users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'sent',
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS agoojye_os_message_deliveries_message_user_uidx
  ON agoojye_os_message_deliveries(message_id, user_id);
CREATE INDEX IF NOT EXISTS agoojye_os_message_deliveries_tenant_user_status_idx
  ON agoojye_os_message_deliveries(tenant_id, user_id, status);

CREATE TABLE IF NOT EXISTS agoojye_os_message_reactions (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  message_id integer NOT NULL REFERENCES agoojye_os_messages(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES agoojye_project_users(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS agoojye_os_message_reactions_uidx
  ON agoojye_os_message_reactions(message_id, user_id, emoji);
CREATE INDEX IF NOT EXISTS agoojye_os_message_reactions_message_idx
  ON agoojye_os_message_reactions(tenant_id, message_id);

CREATE TABLE IF NOT EXISTS agoojye_os_message_mentions (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  message_id integer NOT NULL REFERENCES agoojye_os_messages(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES agoojye_project_users(id) ON DELETE CASCADE,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS agoojye_os_message_mentions_message_user_uidx
  ON agoojye_os_message_mentions(message_id, user_id);
CREATE INDEX IF NOT EXISTS agoojye_os_message_mentions_tenant_user_idx
  ON agoojye_os_message_mentions(tenant_id, user_id, read_at);

CREATE TABLE IF NOT EXISTS agoojye_os_message_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel_id integer NOT NULL REFERENCES agoojye_os_channels(id) ON DELETE CASCADE,
  message_id integer REFERENCES agoojye_os_messages(id) ON DELETE CASCADE,
  uploaded_by integer REFERENCES agoojye_project_users(id) ON DELETE SET NULL,
  original_name text NOT NULL,
  storage_key text NOT NULL,
  mime_type text NOT NULL,
  byte_size integer NOT NULL,
  sha256 text NOT NULL,
  kind text NOT NULL DEFAULT 'document',
  status text NOT NULL DEFAULT 'ready',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agoojye_os_message_attachments_tenant_channel_idx
  ON agoojye_os_message_attachments(tenant_id, channel_id, created_at);
CREATE INDEX IF NOT EXISTS agoojye_os_message_attachments_tenant_hash_idx
  ON agoojye_os_message_attachments(tenant_id, sha256);

CREATE TABLE IF NOT EXISTS agoojye_os_message_drafts (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel_id integer NOT NULL REFERENCES agoojye_os_channels(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES agoojye_project_users(id) ON DELETE CASCADE,
  body text NOT NULL DEFAULT '',
  attachment_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  reply_to_message_id integer REFERENCES agoojye_os_messages(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS agoojye_os_message_drafts_channel_user_uidx
  ON agoojye_os_message_drafts(channel_id, user_id);
CREATE INDEX IF NOT EXISTS agoojye_os_message_drafts_tenant_user_idx
  ON agoojye_os_message_drafts(tenant_id, user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS agoojye_os_message_pins (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel_id integer NOT NULL REFERENCES agoojye_os_channels(id) ON DELETE CASCADE,
  message_id integer NOT NULL REFERENCES agoojye_os_messages(id) ON DELETE CASCADE,
  pinned_by integer REFERENCES agoojye_project_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS agoojye_os_message_pins_message_uidx
  ON agoojye_os_message_pins(message_id);
CREATE INDEX IF NOT EXISTS agoojye_os_message_pins_channel_idx
  ON agoojye_os_message_pins(tenant_id, channel_id, created_at);

CREATE TABLE IF NOT EXISTS agoojye_os_ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES agoojye_project_users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Nouvelle conversation',
  context_type text NOT NULL DEFAULT 'personal',
  context_id text,
  context_label text NOT NULL DEFAULT 'Espace personnel',
  pinned boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active',
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agoojye_os_ai_conversations_tenant_user_status_idx
  ON agoojye_os_ai_conversations(tenant_id, user_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS agoojye_os_ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES agoojye_os_ai_conversations(id) ON DELETE CASCADE,
  role text NOT NULL,
  content text NOT NULL,
  parent_message_id uuid,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  provider text,
  model text,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  feedback text,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agoojye_os_ai_messages_parent_fk'
  ) THEN
    ALTER TABLE agoojye_os_ai_messages
      ADD CONSTRAINT agoojye_os_ai_messages_parent_fk
      FOREIGN KEY (parent_message_id) REFERENCES agoojye_os_ai_messages(id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS agoojye_os_ai_messages_conversation_created_idx
  ON agoojye_os_ai_messages(tenant_id, conversation_id, created_at);

CREATE TABLE IF NOT EXISTS agoojye_os_ai_conversation_contexts (
  id serial PRIMARY KEY,
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES agoojye_os_ai_conversations(id) ON DELETE CASCADE,
  context_type text NOT NULL,
  context_id text,
  label text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS agoojye_os_ai_contexts_conversation_type_id_uidx
  ON agoojye_os_ai_conversation_contexts(conversation_id, context_type, context_id);

CREATE TABLE IF NOT EXISTS agoojye_os_ai_message_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES agoojye_os_ai_conversations(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES agoojye_os_ai_messages(id) ON DELETE CASCADE,
  requested_by integer REFERENCES agoojye_project_users(id) ON DELETE SET NULL,
  action_type text NOT NULL,
  label text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  risk_level text NOT NULL DEFAULT 'low',
  status text NOT NULL DEFAULT 'proposed',
  requires_approval boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agoojye_os_ai_message_actions_conversation_status_idx
  ON agoojye_os_ai_message_actions(tenant_id, conversation_id, status);

COMMIT;
