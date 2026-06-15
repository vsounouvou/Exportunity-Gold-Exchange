CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pme_lead_source') THEN
    CREATE TYPE pme_lead_source AS ENUM ('google_places', 'manual', 'import', 'facebook', 'referral', 'seeded');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pme_lead_status') THEN
    CREATE TYPE pme_lead_status AS ENUM ('new', 'enriched', 'qualified', 'contact_ready', 'contacted', 'replied', 'interested', 'not_interested', 'onboarded', 'rejected', 'suppressed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pme_campaign_status') THEN
    CREATE TYPE pme_campaign_status AS ENUM ('draft', 'test', 'running', 'paused', 'completed');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pme_outreach_channel') THEN
    CREATE TYPE pme_outreach_channel AS ENUM ('whatsapp', 'sms', 'email', 'call');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pme_message_direction') THEN
    CREATE TYPE pme_message_direction AS ENUM ('in', 'out');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pme_investment_readiness') THEN
    CREATE TYPE pme_investment_readiness AS ENUM ('none', 'early', 'review_ready', 'approved', 'listed');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS pme_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  source pme_lead_source NOT NULL DEFAULT 'manual',
  google_place_id text,
  name text NOT NULL,
  normalized_name text NOT NULL,
  description text,
  category text,
  primary_type text,
  types jsonb DEFAULT '[]'::jsonb,
  address text,
  city text,
  country text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  phone text,
  whatsapp_phone text,
  website text,
  google_maps_url text,
  rating numeric(3,2),
  review_count integer,
  business_status text,
  opening_hours jsonb DEFAULT '{}'::jsonb,
  lead_status pme_lead_status NOT NULL DEFAULT 'new',
  qualification_score integer NOT NULL DEFAULT 0,
  investment_potential_score integer NOT NULL DEFAULT 0,
  revenue_visibility_score integer NOT NULL DEFAULT 0,
  contact_status text DEFAULT 'not_contacted',
  last_contacted_at timestamp,
  last_enriched_at timestamp,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS pme_leads_tenant_google_place_unique
  ON pme_leads(tenant_id, google_place_id)
  WHERE google_place_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS pme_leads_tenant_city_status_idx ON pme_leads(tenant_id, city, lead_status);
CREATE INDEX IF NOT EXISTS pme_leads_tenant_score_idx ON pme_leads(tenant_id, qualification_score);
CREATE INDEX IF NOT EXISTS pme_leads_tenant_normalized_name_idx ON pme_leads(tenant_id, normalized_name);

CREATE TABLE IF NOT EXISTS pme_outreach_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  target_city text,
  target_categories jsonb DEFAULT '[]'::jsonb,
  message_template_id text,
  status pme_campaign_status NOT NULL DEFAULT 'draft',
  daily_limit integer NOT NULL DEFAULT 10,
  agent_id integer REFERENCES agents_production(id) ON DELETE SET NULL,
  created_by integer REFERENCES ece_users(id) ON DELETE SET NULL,
  requires_approval boolean NOT NULL DEFAULT true,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pme_campaigns_tenant_status_idx ON pme_outreach_campaigns(tenant_id, status);

CREATE TABLE IF NOT EXISTS pme_outreach_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES pme_outreach_campaigns(id) ON DELETE CASCADE,
  pme_lead_id uuid NOT NULL REFERENCES pme_leads(id) ON DELETE CASCADE,
  channel pme_outreach_channel NOT NULL,
  direction pme_message_direction NOT NULL DEFAULT 'out',
  twilio_sid text,
  template_name text,
  message_body text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  error_code text,
  error_message text,
  sent_at timestamp,
  delivered_at timestamp,
  replied_at timestamp,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pme_outreach_messages_lead_created_idx ON pme_outreach_messages(pme_lead_id, created_at);
CREATE INDEX IF NOT EXISTS pme_outreach_messages_campaign_status_idx ON pme_outreach_messages(campaign_id, status);

CREATE TABLE IF NOT EXISTS pme_agent_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pme_lead_id uuid NOT NULL REFERENCES pme_leads(id) ON DELETE CASCADE,
  agent_id integer REFERENCES agents_production(id) ON DELETE SET NULL,
  thread_id text,
  summary text,
  next_step text,
  sentiment text,
  qualification_result jsonb DEFAULT '{}'::jsonb,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pme_agent_conversations_lead_idx ON pme_agent_conversations(pme_lead_id);
CREATE INDEX IF NOT EXISTS pme_agent_conversations_thread_idx ON pme_agent_conversations(thread_id);

CREATE TABLE IF NOT EXISTS pme_exchange_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pme_lead_id uuid NOT NULL REFERENCES pme_leads(id) ON DELETE CASCADE,
  company_name text NOT NULL,
  verified_status text NOT NULL DEFAULT 'unverified',
  onboarding_status text NOT NULL DEFAULT 'not_started',
  products_count integer NOT NULL DEFAULT 0,
  monthly_revenue_estimate numeric(14,2),
  verified_monthly_revenue numeric(14,2),
  financing_need numeric(14,2),
  royalty_possible boolean NOT NULL DEFAULT false,
  investment_readiness pme_investment_readiness NOT NULL DEFAULT 'none',
  documents jsonb DEFAULT '[]'::jsonb,
  risk_score integer NOT NULL DEFAULT 0,
  agent_notes text,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS pme_exchange_profiles_lead_unique ON pme_exchange_profiles(pme_lead_id);
CREATE INDEX IF NOT EXISTS pme_exchange_profiles_readiness_idx ON pme_exchange_profiles(investment_readiness);
