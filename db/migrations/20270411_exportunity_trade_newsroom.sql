BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'trade_newsroom_story_type') THEN
    CREATE TYPE trade_newsroom_story_type AS ENUM (
      'news_brief', 'regulatory_update', 'market_analysis',
      'trade_opportunity', 'logistics_update', 'original_report'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'trade_newsroom_article_status') THEN
    CREATE TYPE trade_newsroom_article_status AS ENUM (
      'draft', 'research_review', 'editor_review', 'approved',
      'published', 'rejected', 'withdrawn'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS trade_newsroom_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  knowledge_entity_id uuid REFERENCES trade_knowledge_entities(id) ON DELETE SET NULL,
  research_mission_id uuid REFERENCES trade_research_missions(id) ON DELETE SET NULL,
  story_type trade_newsroom_story_type NOT NULL,
  status trade_newsroom_article_status NOT NULL DEFAULT 'draft',
  slug text NOT NULL,
  primary_language text NOT NULL DEFAULT 'en',
  title text NOT NULL,
  dek text,
  body_markdown text NOT NULL,
  original_analysis text,
  translations jsonb NOT NULL DEFAULT '{}'::jsonb,
  country_code text,
  sector_code text,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  linked_entity_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  seo_title text,
  seo_description text,
  commercial_cta jsonb NOT NULL DEFAULT '{}'::jsonb,
  draft_origin text NOT NULL DEFAULT 'human',
  generation_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  citation_count integer NOT NULL DEFAULT 0,
  verified_citation_count integer NOT NULL DEFAULT 0,
  distinct_source_count integer NOT NULL DEFAULT 0,
  current_version integer NOT NULL DEFAULT 1,
  authored_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  edited_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  approved_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  published_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  approved_at timestamp,
  published_at timestamp,
  withdrawn_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT trade_newsroom_articles_citation_counts_check CHECK (
    citation_count >= 0 AND verified_citation_count >= 0 AND
    distinct_source_count >= 0 AND verified_citation_count <= citation_count
  ),
  CONSTRAINT trade_newsroom_articles_current_version_check CHECK (current_version > 0),
  CONSTRAINT trade_newsroom_articles_language_check CHECK (primary_language ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  CONSTRAINT trade_newsroom_articles_draft_origin_check CHECK (draft_origin IN ('human', 'ai_assisted', 'imported'))
);

CREATE UNIQUE INDEX IF NOT EXISTS trade_newsroom_articles_tenant_slug_unique
  ON trade_newsroom_articles(tenant_id, slug);
CREATE INDEX IF NOT EXISTS trade_newsroom_articles_tenant_status_idx
  ON trade_newsroom_articles(tenant_id, status, updated_at);
CREATE INDEX IF NOT EXISTS trade_newsroom_articles_public_scope_idx
  ON trade_newsroom_articles(tenant_id, status, country_code, sector_code, published_at);
CREATE INDEX IF NOT EXISTS trade_newsroom_articles_mission_idx
  ON trade_newsroom_articles(research_mission_id, status);

CREATE TABLE IF NOT EXISTS trade_newsroom_citations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  article_id uuid NOT NULL REFERENCES trade_newsroom_articles(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES trade_intelligence_sources(id) ON DELETE RESTRICT,
  fact_id uuid REFERENCES trade_facts(id) ON DELETE SET NULL,
  snapshot_id uuid REFERENCES trade_source_snapshots(id) ON DELETE SET NULL,
  sequence integer NOT NULL,
  source_url text NOT NULL,
  source_title text NOT NULL,
  cited_claim text NOT NULL,
  evidence_excerpt text,
  source_published_at timestamp,
  retrieved_at timestamp NOT NULL DEFAULT now(),
  content_hash text NOT NULL,
  verification_status trade_verification_status NOT NULL DEFAULT 'under_review',
  review_notes text,
  reviewed_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  reviewed_at timestamp,
  created_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT trade_newsroom_citations_sequence_check CHECK (sequence > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS trade_newsroom_citations_tenant_hash_unique
  ON trade_newsroom_citations(tenant_id, article_id, content_hash);
CREATE UNIQUE INDEX IF NOT EXISTS trade_newsroom_citations_article_sequence_unique
  ON trade_newsroom_citations(article_id, sequence);
CREATE INDEX IF NOT EXISTS trade_newsroom_citations_article_review_idx
  ON trade_newsroom_citations(tenant_id, article_id, verification_status);
CREATE INDEX IF NOT EXISTS trade_newsroom_citations_source_idx
  ON trade_newsroom_citations(tenant_id, source_id, created_at);

CREATE TABLE IF NOT EXISTS trade_newsroom_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  article_id uuid NOT NULL REFERENCES trade_newsroom_articles(id) ON DELETE CASCADE,
  version integer NOT NULL,
  status trade_newsroom_article_status NOT NULL,
  title text NOT NULL,
  dek text,
  body_markdown text NOT NULL,
  original_analysis text,
  translations jsonb NOT NULL DEFAULT '{}'::jsonb,
  change_note text NOT NULL,
  actor_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT trade_newsroom_revisions_version_check CHECK (version > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS trade_newsroom_revisions_article_version_unique
  ON trade_newsroom_revisions(article_id, version);
CREATE INDEX IF NOT EXISTS trade_newsroom_revisions_tenant_created_idx
  ON trade_newsroom_revisions(tenant_id, created_at);

CREATE TABLE IF NOT EXISTS trade_newsroom_review_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  article_id uuid NOT NULL REFERENCES trade_newsroom_articles(id) ON DELETE CASCADE,
  from_status trade_newsroom_article_status NOT NULL,
  to_status trade_newsroom_article_status NOT NULL,
  action text NOT NULL,
  reason text NOT NULL,
  checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT trade_newsroom_review_events_transition_check CHECK (from_status <> to_status)
);

CREATE INDEX IF NOT EXISTS trade_newsroom_review_events_article_idx
  ON trade_newsroom_review_events(tenant_id, article_id, created_at);

COMMIT;
