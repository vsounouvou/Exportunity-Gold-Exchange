DO $$ BEGIN
  CREATE TYPE chat_lead_status AS ENUM ('new', 'triaged', 'booked', 'closed');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE chat_message_role AS ENUM ('user', 'assistant', 'system');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS chat_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  intent TEXT NOT NULL,
  name TEXT,
  email TEXT,
  phone TEXT,
  country TEXT,
  summary TEXT,
  status chat_lead_status NOT NULL DEFAULT 'new',
  source_url TEXT,
  user_agent TEXT,
  ip TEXT,
  notify_status TEXT NOT NULL DEFAULT 'pending',
  notify_error TEXT,
  notified_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_leads_tenant_created_idx
  ON chat_leads(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS chat_leads_tenant_status_idx
  ON chat_leads(tenant_id, status, updated_at);

CREATE TABLE IF NOT EXISTS chat_messages (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES chat_leads(id) ON DELETE CASCADE,
  role chat_message_role NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_messages_lead_created_idx
  ON chat_messages(lead_id, created_at);
CREATE INDEX IF NOT EXISTS chat_messages_tenant_created_idx
  ON chat_messages(tenant_id, created_at);

CREATE TABLE IF NOT EXISTS chat_events (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES chat_leads(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_events_lead_created_idx
  ON chat_events(lead_id, created_at);
CREATE INDEX IF NOT EXISTS chat_events_tenant_created_idx
  ON chat_events(tenant_id, created_at);

