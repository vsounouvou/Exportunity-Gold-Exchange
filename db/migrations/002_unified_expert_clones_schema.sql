-- Unified Expert Clones Hub Schema (Phase 1-1)
-- This migration creates the 4 core tables for the unified Expert Clones system

-- 1. Clone Profiles (company-agnostic AI clone definitions)
CREATE TABLE IF NOT EXISTS clone_profiles (
  id SERIAL PRIMARY KEY,
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  
  -- Basic Information
  display_name TEXT NOT NULL,
  short_code TEXT UNIQUE,
  bio TEXT,
  long_description TEXT,
  avatar TEXT,
  cover_image TEXT,
  
  -- Expertise & Classification
  title TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('social', 'business', 'productivity', 'sales', 'content', 'expert', 'personal')),
  primary_expertise TEXT NOT NULL,
  skills JSONB DEFAULT '[]',
  industries JSONB DEFAULT '[]',
  languages JSONB DEFAULT '["en"]',
  
  -- Training & Model
  training_status TEXT DEFAULT 'draft' CHECK (training_status IN ('draft', 'training', 'ready', 'active', 'paused', 'archived')),
  training_progress INTEGER DEFAULT 0,
  training_completed_at TIMESTAMP,
  model_version TEXT DEFAULT '1.0',
  quality_score DECIMAL(5, 2) DEFAULT 0.00,
  
  -- Marketplace Visibility
  visibility TEXT DEFAULT 'private' CHECK (visibility IN ('private', 'company_only', 'public_marketplace')),
  is_published BOOLEAN DEFAULT FALSE,
  is_featured BOOLEAN DEFAULT FALSE,
  published_at TIMESTAMP,
  
  -- Pricing
  pricing_model TEXT DEFAULT 'per_day' CHECK (pricing_model IN ('per_hour', 'per_day', 'per_task', 'monthly_subscription', 'custom')),
  base_daily_cost DECIMAL(10, 2) DEFAULT 5.00,
  base_hourly_rate DECIMAL(10, 2) DEFAULT 10.00,
  
  -- Aggregate Performance
  total_assignments INTEGER DEFAULT 0,
  total_tasks_completed INTEGER DEFAULT 0,
  average_rating DECIMAL(3, 2) DEFAULT 0.00,
  success_rate DECIMAL(5, 2) DEFAULT 0.00,
  
  -- Migration Tracking
  migrated_from_clone_agent_id INTEGER REFERENCES clone_agents(id),
  migrated_from_expert_profile_id INTEGER REFERENCES expert_profiles(id),
  migration_source TEXT CHECK (migration_source IN ('personal_clone', 'expert_marketplace', 'new')),
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_active_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS profile_migrated_clone_idx ON clone_profiles(migrated_from_clone_agent_id);
CREATE INDEX IF NOT EXISTS profile_migrated_expert_idx ON clone_profiles(migrated_from_expert_profile_id);
CREATE INDEX IF NOT EXISTS profile_migration_source_idx ON clone_profiles(migration_source);

-- 2. Company Clone Assignments (multi-company agent roles)
CREATE TABLE IF NOT EXISTS company_clone_assignments (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  clone_profile_id INTEGER REFERENCES clone_profiles(id) ON DELETE CASCADE NOT NULL,
  
  -- Role & Hierarchy
  role_within_company TEXT NOT NULL,
  department_id INTEGER,
  manager_agent_id INTEGER,
  reporting_level INTEGER DEFAULT 0,
  
  -- Status & Access
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'learning', 'active', 'paused', 'terminated')),
  access_scope JSONB DEFAULT '{}',
  
  -- Tier & Cost
  tier_id INTEGER,
  daily_cost DECIMAL(10, 2) NOT NULL,
  weekly_cost DECIMAL(10, 2) NOT NULL,
  monthly_cost DECIMAL(10, 2) NOT NULL,
  
  -- Configuration
  config JSONB DEFAULT '{}',
  
  -- Performance Tracking
  tasks_completed INTEGER DEFAULT 0,
  messages_handled INTEGER DEFAULT 0,
  meetings_attended INTEGER DEFAULT 0,
  last_active_at TIMESTAMP,
  
  -- Hiring Details
  hire_id INTEGER,
  agreed_price DECIMAL(10, 2),
  start_date TIMESTAMP,
  end_date TIMESTAMP,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE company_clone_assignments ADD CONSTRAINT manager_agent_fk 
  FOREIGN KEY (manager_agent_id) REFERENCES company_clone_assignments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS assignment_company_idx ON company_clone_assignments(company_id);
CREATE INDEX IF NOT EXISTS assignment_profile_idx ON company_clone_assignments(clone_profile_id);
CREATE INDEX IF NOT EXISTS assignment_status_idx ON company_clone_assignments(status);

-- 3. Knowledge Layers (3-layer knowledge system)
CREATE TABLE IF NOT EXISTS knowledge_layers (
  id SERIAL PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('global', 'company', 'agent')),
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  agent_assignment_id INTEGER REFERENCES company_clone_assignments(id) ON DELETE CASCADE,
  
  title TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('document', 'faq', 'procedure', 'template', 'guideline', 'reference')),
  content TEXT NOT NULL,
  tags JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE,
  
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_accessed_at TIMESTAMP,
  access_count INTEGER DEFAULT 0,
  
  CONSTRAINT scope_company_check CHECK (
    (scope = 'global' AND company_id IS NULL AND agent_assignment_id IS NULL) OR
    (scope = 'company' AND company_id IS NOT NULL AND agent_assignment_id IS NULL) OR
    (scope = 'agent' AND company_id IS NOT NULL AND agent_assignment_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS knowledge_scope_idx ON knowledge_layers(scope);
CREATE INDEX IF NOT EXISTS knowledge_company_idx ON knowledge_layers(company_id);
CREATE INDEX IF NOT EXISTS knowledge_agent_idx ON knowledge_layers(agent_assignment_id);

-- 4. Agent Diagnostics (per-company performance metrics)
CREATE TABLE IF NOT EXISTS agent_diagnostics (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  assignment_id INTEGER REFERENCES company_clone_assignments(id) ON DELETE CASCADE NOT NULL,
  metric_date DATE NOT NULL,
  
  tasks_completed INTEGER DEFAULT 0,
  tasks_failed INTEGER DEFAULT 0,
  messages_sent INTEGER DEFAULT 0,
  messages_received INTEGER DEFAULT 0,
  meetings_attended INTEGER DEFAULT 0,
  knowledge_items_accessed INTEGER DEFAULT 0,
  avg_response_time_seconds INTEGER DEFAULT 0,
  total_cost DECIMAL(10, 2) DEFAULT 0.00,
  quality_score DECIMAL(5, 2) DEFAULT 0.00,
  user_satisfaction_score DECIMAL(3, 2) DEFAULT 0.00,
  errors_count INTEGER DEFAULT 0,
  
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(assignment_id, metric_date)
);

CREATE INDEX IF NOT EXISTS diagnostics_company_idx ON agent_diagnostics(company_id);
CREATE INDEX IF NOT EXISTS diagnostics_assignment_idx ON agent_diagnostics(assignment_id);
CREATE INDEX IF NOT EXISTS diagnostics_date_idx ON agent_diagnostics(metric_date);
