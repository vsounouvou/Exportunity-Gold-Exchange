import { and, eq, sql } from "drizzle-orm";

import { db } from "@db";
import { tradeCoverageCells, tradeIndustrySectors } from "@db/schema";
import { ensureIndustrialTables } from "../industrial/ensureTables";
import {
  buildTradeIntelligenceCoverageTargets,
  TRADE_INTELLIGENCE_PRIORITY_SECTORS,
} from "./foundation";

let ensurePromise: Promise<void> | null = null;

export async function ensureTradeIntelligenceTables() {
  if (ensurePromise) return ensurePromise;

  ensurePromise = (async () => {
    await ensureIndustrialTables();
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    await db.execute(sql`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'trade_intelligence_source_type') THEN
          CREATE TYPE trade_intelligence_source_type AS ENUM ('official_registry', 'customs_authority', 'statistics_authority', 'ministry', 'standards_body', 'port_authority', 'logistics_operator', 'chamber_of_commerce', 'development_institution', 'company_website', 'industry_directory', 'news_media', 'research_publication', 'manual_evidence');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'trade_intelligence_source_status') THEN
          CREATE TYPE trade_intelligence_source_status AS ENUM ('active', 'paused', 'degraded', 'blocked', 'archived');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'trade_knowledge_entity_type') THEN
          CREATE TYPE trade_knowledge_entity_type AS ENUM ('country', 'sector', 'product', 'company', 'port', 'trade_corridor', 'regulation', 'tariff', 'certification', 'logistics_service', 'trade_opportunity', 'market_report', 'news_article');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'trade_verification_status') THEN
          CREATE TYPE trade_verification_status AS ENUM ('unverified', 'evidence_pending', 'under_review', 'verified', 'disputed', 'stale');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'trade_publication_status') THEN
          CREATE TYPE trade_publication_status AS ENUM ('draft', 'review', 'approved', 'published', 'withdrawn');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'trade_demand_event_type') THEN
          CREATE TYPE trade_demand_event_type AS ENUM ('search', 'assistant_intent', 'requirement', 'zero_result', 'rfq', 'quote', 'order');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'trade_coverage_status') THEN
          CREATE TYPE trade_coverage_status AS ENUM ('empty', 'researching', 'partial', 'verified', 'stale');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'trade_coverage_dimension') THEN
          CREATE TYPE trade_coverage_dimension AS ENUM ('country_profile', 'sector_profile', 'market_access', 'regulations', 'tariffs', 'logistics', 'companies', 'products', 'opportunities', 'news');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'trade_research_mission_status') THEN
          CREATE TYPE trade_research_mission_status AS ENUM ('proposed', 'queued', 'in_progress', 'awaiting_review', 'completed', 'blocked', 'cancelled');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'trade_newsroom_story_type') THEN
          CREATE TYPE trade_newsroom_story_type AS ENUM ('news_brief', 'regulatory_update', 'market_analysis', 'trade_opportunity', 'logistics_update', 'original_report');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'trade_newsroom_article_status') THEN
          CREATE TYPE trade_newsroom_article_status AS ENUM ('draft', 'research_review', 'editor_review', 'approved', 'published', 'rejected', 'withdrawn');
        END IF;
      END $$;
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS trade_intelligence_sources (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        normalized_key text NOT NULL,
        name text NOT NULL,
        source_type trade_intelligence_source_type NOT NULL,
        status trade_intelligence_source_status NOT NULL DEFAULT 'active',
        country_code text,
        domain text,
        base_url text NOT NULL,
        language_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
        trust_score numeric(4,3) NOT NULL DEFAULT 0.500,
        access_policy text NOT NULL DEFAULT 'public',
        robots_policy text NOT NULL DEFAULT 'unknown',
        crawl_cadence text,
        parser_key text,
        last_checked_at timestamp,
        last_succeeded_at timestamp,
        last_failed_at timestamp,
        next_due_at timestamp,
        last_error text,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now(),
        CONSTRAINT trade_intelligence_sources_trust_score_check CHECK (trust_score >= 0 AND trust_score <= 1)
      )
    `);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS trade_intelligence_sources_tenant_key_unique ON trade_intelligence_sources(tenant_id, normalized_key)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS trade_intelligence_sources_tenant_status_idx ON trade_intelligence_sources(tenant_id, status, next_due_at)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS trade_intelligence_sources_country_type_idx ON trade_intelligence_sources(tenant_id, country_code, source_type)`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS trade_knowledge_entities (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        entity_type trade_knowledge_entity_type NOT NULL,
        canonical_key text NOT NULL,
        slug text NOT NULL,
        display_name text NOT NULL,
        alternate_names jsonb NOT NULL DEFAULT '[]'::jsonb,
        translations jsonb NOT NULL DEFAULT '{}'::jsonb,
        country_code text,
        sector_code text,
        summary text,
        structured_data jsonb NOT NULL DEFAULT '{}'::jsonb,
        verification_status trade_verification_status NOT NULL DEFAULT 'unverified',
        publication_status trade_publication_status NOT NULL DEFAULT 'draft',
        publication_eligibility_score integer NOT NULL DEFAULT 0,
        primary_source_id uuid REFERENCES trade_intelligence_sources(id) ON DELETE SET NULL,
        last_verified_at timestamp,
        published_at timestamp,
        created_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now(),
        CONSTRAINT trade_knowledge_entities_eligibility_score_check CHECK (publication_eligibility_score >= 0 AND publication_eligibility_score <= 100)
      )
    `);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS trade_knowledge_entities_tenant_canonical_unique ON trade_knowledge_entities(tenant_id, entity_type, canonical_key)`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS trade_knowledge_entities_tenant_slug_unique ON trade_knowledge_entities(tenant_id, entity_type, slug)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS trade_knowledge_entities_publication_idx ON trade_knowledge_entities(tenant_id, publication_status, verification_status, entity_type)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS trade_knowledge_entities_country_sector_idx ON trade_knowledge_entities(tenant_id, country_code, sector_code, entity_type)`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS trade_knowledge_relationships (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        source_entity_id uuid NOT NULL REFERENCES trade_knowledge_entities(id) ON DELETE CASCADE,
        target_entity_id uuid NOT NULL REFERENCES trade_knowledge_entities(id) ON DELETE CASCADE,
        relationship_type text NOT NULL,
        summary text,
        structured_data jsonb NOT NULL DEFAULT '{}'::jsonb,
        confidence numeric(4,3) NOT NULL DEFAULT 0,
        verification_status trade_verification_status NOT NULL DEFAULT 'evidence_pending',
        valid_from timestamp,
        valid_until timestamp,
        last_verified_at timestamp,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now(),
        CONSTRAINT trade_knowledge_relationships_confidence_check CHECK (confidence >= 0 AND confidence <= 1),
        CONSTRAINT trade_knowledge_relationships_distinct_entities_check CHECK (source_entity_id <> target_entity_id)
      )
    `);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS trade_knowledge_relationships_tenant_edge_unique ON trade_knowledge_relationships(tenant_id, source_entity_id, target_entity_id, relationship_type)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS trade_knowledge_relationships_source_idx ON trade_knowledge_relationships(tenant_id, source_entity_id, relationship_type)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS trade_knowledge_relationships_target_idx ON trade_knowledge_relationships(tenant_id, target_entity_id, relationship_type)`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS trade_facts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        entity_id uuid REFERENCES trade_knowledge_entities(id) ON DELETE CASCADE,
        relationship_id uuid REFERENCES trade_knowledge_relationships(id) ON DELETE CASCADE,
        field_key text NOT NULL,
        value jsonb NOT NULL,
        value_text text,
        unit text,
        source_id uuid NOT NULL REFERENCES trade_intelligence_sources(id) ON DELETE RESTRICT,
        source_url text NOT NULL,
        source_document_title text,
        source_published_at timestamp,
        retrieved_at timestamp NOT NULL DEFAULT now(),
        effective_from timestamp,
        effective_until timestamp,
        content_hash text NOT NULL,
        evidence_excerpt text,
        confidence numeric(4,3) NOT NULL DEFAULT 0,
        verification_status trade_verification_status NOT NULL DEFAULT 'evidence_pending',
        publication_status trade_publication_status NOT NULL DEFAULT 'draft',
        verified_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        verified_at timestamp,
        published_at timestamp,
        last_checked_at timestamp,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now(),
        CONSTRAINT trade_facts_owner_check CHECK (num_nonnulls(entity_id, relationship_id) = 1),
        CONSTRAINT trade_facts_confidence_check CHECK (confidence >= 0 AND confidence <= 1)
      )
    `);
    await db.execute(sql`ALTER TABLE trade_facts ADD COLUMN IF NOT EXISTS publication_status trade_publication_status NOT NULL DEFAULT 'draft'`);
    await db.execute(sql`ALTER TABLE trade_facts ADD COLUMN IF NOT EXISTS published_at timestamp`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS trade_facts_tenant_evidence_unique ON trade_facts(tenant_id, source_id, content_hash, field_key)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS trade_facts_entity_field_idx ON trade_facts(tenant_id, entity_id, field_key, verification_status)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS trade_facts_relationship_field_idx ON trade_facts(tenant_id, relationship_id, field_key, verification_status)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS trade_facts_source_freshness_idx ON trade_facts(tenant_id, source_id, retrieved_at)`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS trade_source_snapshots (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        source_id uuid NOT NULL REFERENCES trade_intelligence_sources(id) ON DELETE RESTRICT,
        entity_id uuid REFERENCES trade_knowledge_entities(id) ON DELETE SET NULL,
        document_key text NOT NULL,
        snapshot_type text NOT NULL DEFAULT 'other',
        source_url text NOT NULL,
        document_title text NOT NULL,
        issuing_institution text,
        jurisdiction_country_code text,
        language_code text,
        version_label text,
        content_text text,
        structured_data jsonb NOT NULL DEFAULT '{}'::jsonb,
        affected_products jsonb NOT NULL DEFAULT '[]'::jsonb,
        affected_industries jsonb NOT NULL DEFAULT '[]'::jsonb,
        affected_hs_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
        affected_country_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
        affected_routes jsonb NOT NULL DEFAULT '[]'::jsonb,
        content_hash text NOT NULL,
        published_at timestamp,
        effective_at timestamp,
        retrieved_at timestamp NOT NULL DEFAULT now(),
        captured_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS trade_source_snapshots_tenant_content_unique ON trade_source_snapshots(tenant_id, source_id, document_key, content_hash)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS trade_source_snapshots_history_idx ON trade_source_snapshots(tenant_id, source_id, document_key, retrieved_at)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS trade_source_snapshots_jurisdiction_idx ON trade_source_snapshots(tenant_id, jurisdiction_country_code, snapshot_type, effective_at)`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS trade_source_comparisons (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        source_id uuid NOT NULL REFERENCES trade_intelligence_sources(id) ON DELETE RESTRICT,
        previous_snapshot_id uuid NOT NULL REFERENCES trade_source_snapshots(id) ON DELETE RESTRICT,
        current_snapshot_id uuid NOT NULL REFERENCES trade_source_snapshots(id) ON DELETE RESTRICT,
        canonical_task_id integer REFERENCES tasks(id) ON DELETE SET NULL,
        document_key text NOT NULL,
        comparison_hash text NOT NULL,
        changed_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
        added_passages jsonb NOT NULL DEFAULT '[]'::jsonb,
        removed_passages jsonb NOT NULL DEFAULT '[]'::jsonb,
        affected_scope_changes jsonb NOT NULL DEFAULT '{}'::jsonb,
        text_similarity numeric(4,3) NOT NULL DEFAULT 0,
        materiality_score integer NOT NULL DEFAULT 0,
        is_substantive boolean NOT NULL DEFAULT false,
        deterministic_summary text NOT NULL,
        status text NOT NULL DEFAULT 'review_pending',
        review_outcome_notes text,
        reviewed_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        reviewed_at timestamp,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now(),
        CONSTRAINT trade_source_comparisons_materiality_check CHECK (materiality_score >= 0 AND materiality_score <= 100),
        CONSTRAINT trade_source_comparisons_similarity_check CHECK (text_similarity >= 0 AND text_similarity <= 1),
        CONSTRAINT trade_source_comparisons_distinct_snapshots_check CHECK (previous_snapshot_id <> current_snapshot_id),
        CONSTRAINT trade_source_comparisons_status_check CHECK (status IN ('review_pending', 'confirmed', 'dismissed'))
      )
    `);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS trade_source_comparisons_tenant_current_unique ON trade_source_comparisons(tenant_id, current_snapshot_id)`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS trade_source_comparisons_tenant_hash_unique ON trade_source_comparisons(tenant_id, source_id, comparison_hash)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS trade_source_comparisons_review_idx ON trade_source_comparisons(tenant_id, status, is_substantive, created_at)`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS trade_demand_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        event_type trade_demand_event_type NOT NULL,
        source_surface text NOT NULL,
        anonymous_session_id text,
        user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        industrial_requirement_id uuid REFERENCES industrial_requirements(id) ON DELETE SET NULL,
        source_conversation_id text,
        query_text text,
        normalized_product text,
        product_category text,
        sector_code text,
        origin_country_code text,
        destination_country_code text,
        destination_city text,
        commercial_intent text,
        result_count integer,
        quantity_text text,
        estimated_value numeric(18,2),
        currency_code text,
        conversion_stage text,
        difficulty_score integer NOT NULL DEFAULT 0,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        occurred_at timestamp NOT NULL DEFAULT now(),
        created_at timestamp NOT NULL DEFAULT now(),
        CONSTRAINT trade_demand_events_difficulty_check CHECK (difficulty_score >= 0 AND difficulty_score <= 100),
        CONSTRAINT trade_demand_events_result_count_check CHECK (result_count IS NULL OR result_count >= 0)
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS trade_demand_events_tenant_time_idx ON trade_demand_events(tenant_id, occurred_at)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS trade_demand_events_radar_idx ON trade_demand_events(tenant_id, destination_country_code, sector_code, normalized_product, occurred_at)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS trade_demand_events_requirement_idx ON trade_demand_events(industrial_requirement_id, event_type)`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS trade_industry_sectors (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        code text NOT NULL,
        name text NOT NULL,
        name_fr text,
        description text NOT NULL,
        status text NOT NULL DEFAULT 'draft',
        coverage_tier text NOT NULL DEFAULT 'research_backlog',
        canonical_category_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
        rationale text NOT NULL,
        created_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        approved_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        approved_at timestamp,
        retired_at timestamp,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now(),
        CONSTRAINT trade_industry_sectors_status_check CHECK (status IN ('draft', 'review', 'active', 'retired')),
        CONSTRAINT trade_industry_sectors_coverage_tier_check CHECK (coverage_tier IN ('priority', 'research_backlog'))
      )
    `);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS trade_industry_sectors_tenant_code_unique ON trade_industry_sectors(tenant_id, code)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS trade_industry_sectors_tenant_status_idx ON trade_industry_sectors(tenant_id, status, coverage_tier, code)`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS trade_coverage_cells (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        country_code text NOT NULL,
        dimension trade_coverage_dimension NOT NULL,
        sector_code text NOT NULL DEFAULT '__all__',
        status trade_coverage_status NOT NULL DEFAULT 'empty',
        coverage_percent integer NOT NULL DEFAULT 0,
        quality_score integer NOT NULL DEFAULT 0,
        entity_count integer NOT NULL DEFAULT 0,
        fact_count integer NOT NULL DEFAULT 0,
        verified_fact_count integer NOT NULL DEFAULT 0,
        source_count integer NOT NULL DEFAULT 0,
        missing_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
        last_verified_at timestamp,
        next_review_at timestamp,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now(),
        CONSTRAINT trade_coverage_cells_coverage_check CHECK (coverage_percent >= 0 AND coverage_percent <= 100),
        CONSTRAINT trade_coverage_cells_quality_check CHECK (quality_score >= 0 AND quality_score <= 100)
      )
    `);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS trade_coverage_cells_tenant_cell_unique ON trade_coverage_cells(tenant_id, country_code, dimension, sector_code)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS trade_coverage_cells_status_idx ON trade_coverage_cells(tenant_id, status, country_code, dimension)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS trade_coverage_cells_review_idx ON trade_coverage_cells(tenant_id, next_review_at, status)`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS trade_research_missions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        canonical_task_id integer REFERENCES tasks(id) ON DELETE SET NULL,
        triggered_by_demand_event_id uuid REFERENCES trade_demand_events(id) ON DELETE SET NULL,
        coverage_cell_id uuid REFERENCES trade_coverage_cells(id) ON DELETE SET NULL,
        mission_type text NOT NULL,
        title text NOT NULL,
        objective text NOT NULL,
        country_code text,
        sector_code text,
        priority text NOT NULL DEFAULT 'medium',
        status trade_research_mission_status NOT NULL DEFAULT 'proposed',
        approval_status text NOT NULL DEFAULT 'pending',
        assigned_agent_id integer,
        evidence_requirements jsonb NOT NULL DEFAULT '[]'::jsonb,
        evidence_count integer NOT NULL DEFAULT 0,
        confidence numeric(4,3),
        result_summary text,
        recommended_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        started_at timestamp,
        completed_at timestamp,
        created_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now(),
        CONSTRAINT trade_research_missions_confidence_check CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1))
      )
    `);
    await db.execute(sql`ALTER TABLE trade_research_missions ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS trade_research_missions_canonical_task_unique ON trade_research_missions(canonical_task_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS trade_research_missions_queue_idx ON trade_research_missions(tenant_id, status, priority, created_at)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS trade_research_missions_scope_idx ON trade_research_missions(tenant_id, country_code, sector_code, status)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS trade_research_missions_demand_idx ON trade_research_missions(triggered_by_demand_event_id, status)`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS trade_research_mission_evidence (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        mission_id uuid NOT NULL REFERENCES trade_research_missions(id) ON DELETE CASCADE,
        fact_id uuid REFERENCES trade_facts(id) ON DELETE SET NULL,
        source_id uuid NOT NULL REFERENCES trade_intelligence_sources(id) ON DELETE RESTRICT,
        evidence_type text NOT NULL,
        title text NOT NULL,
        source_url text NOT NULL,
        content_hash text NOT NULL,
        evidence_excerpt text,
        notes text,
        verification_status trade_verification_status NOT NULL DEFAULT 'evidence_pending',
        verified_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        verified_at timestamp,
        created_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS trade_research_mission_evidence_tenant_unique ON trade_research_mission_evidence(tenant_id, mission_id, content_hash)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS trade_research_mission_evidence_mission_status_idx ON trade_research_mission_evidence(tenant_id, mission_id, verification_status)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS trade_research_mission_evidence_source_idx ON trade_research_mission_evidence(tenant_id, source_id, created_at)`);

    await db.execute(sql`
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
          citation_count >= 0 AND verified_citation_count >= 0 AND distinct_source_count >= 0 AND verified_citation_count <= citation_count
        ),
        CONSTRAINT trade_newsroom_articles_current_version_check CHECK (current_version > 0),
        CONSTRAINT trade_newsroom_articles_language_check CHECK (primary_language ~ '^[a-z]{2}(-[A-Z]{2})?$'),
        CONSTRAINT trade_newsroom_articles_draft_origin_check CHECK (draft_origin IN ('human', 'ai_assisted', 'imported'))
      )
    `);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS trade_newsroom_articles_tenant_slug_unique ON trade_newsroom_articles(tenant_id, slug)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS trade_newsroom_articles_tenant_status_idx ON trade_newsroom_articles(tenant_id, status, updated_at)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS trade_newsroom_articles_public_scope_idx ON trade_newsroom_articles(tenant_id, status, country_code, sector_code, published_at)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS trade_newsroom_articles_mission_idx ON trade_newsroom_articles(research_mission_id, status)`);

    await db.execute(sql`
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
      )
    `);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS trade_newsroom_citations_tenant_hash_unique ON trade_newsroom_citations(tenant_id, article_id, content_hash)`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS trade_newsroom_citations_article_sequence_unique ON trade_newsroom_citations(article_id, sequence)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS trade_newsroom_citations_article_review_idx ON trade_newsroom_citations(tenant_id, article_id, verification_status)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS trade_newsroom_citations_source_idx ON trade_newsroom_citations(tenant_id, source_id, created_at)`);

    await db.execute(sql`
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
      )
    `);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS trade_newsroom_revisions_article_version_unique ON trade_newsroom_revisions(article_id, version)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS trade_newsroom_revisions_tenant_created_idx ON trade_newsroom_revisions(tenant_id, created_at)`);

    await db.execute(sql`
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
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS trade_newsroom_review_events_article_idx ON trade_newsroom_review_events(tenant_id, article_id, created_at)`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS trade_regulatory_changes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        source_id uuid NOT NULL REFERENCES trade_intelligence_sources(id) ON DELETE RESTRICT,
        entity_id uuid REFERENCES trade_knowledge_entities(id) ON DELETE SET NULL,
        canonical_task_id integer REFERENCES tasks(id) ON DELETE SET NULL,
        comparison_id uuid REFERENCES trade_source_comparisons(id) ON DELETE SET NULL,
        previous_snapshot_id uuid REFERENCES trade_source_snapshots(id) ON DELETE SET NULL,
        current_snapshot_id uuid REFERENCES trade_source_snapshots(id) ON DELETE SET NULL,
        jurisdiction_country_code text NOT NULL,
        change_type text NOT NULL,
        title text NOT NULL,
        summary text NOT NULL,
        issuing_institution text,
        source_url text NOT NULL,
        content_hash text NOT NULL,
        previous_value jsonb,
        current_value jsonb,
        affected_products jsonb NOT NULL DEFAULT '[]'::jsonb,
        affected_industries jsonb NOT NULL DEFAULT '[]'::jsonb,
        affected_hs_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
        affected_country_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
        affected_routes jsonb NOT NULL DEFAULT '[]'::jsonb,
        consequences text,
        recommended_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
        confidence numeric(4,3) NOT NULL DEFAULT 0,
        severity text NOT NULL DEFAULT 'informational',
        verification_status trade_verification_status NOT NULL DEFAULT 'evidence_pending',
        publication_status trade_publication_status NOT NULL DEFAULT 'draft',
        source_published_at timestamp,
        effective_at timestamp,
        detected_at timestamp NOT NULL DEFAULT now(),
        reviewed_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        reviewed_at timestamp,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now(),
        CONSTRAINT trade_regulatory_changes_confidence_check CHECK (confidence >= 0 AND confidence <= 1)
      )
    `);
    await db.execute(sql`ALTER TABLE trade_regulatory_changes ADD COLUMN IF NOT EXISTS comparison_id uuid REFERENCES trade_source_comparisons(id) ON DELETE SET NULL`);
    await db.execute(sql`ALTER TABLE trade_regulatory_changes ADD COLUMN IF NOT EXISTS previous_snapshot_id uuid REFERENCES trade_source_snapshots(id) ON DELETE SET NULL`);
    await db.execute(sql`ALTER TABLE trade_regulatory_changes ADD COLUMN IF NOT EXISTS current_snapshot_id uuid REFERENCES trade_source_snapshots(id) ON DELETE SET NULL`);
    await db.execute(sql`ALTER TABLE trade_regulatory_changes ADD COLUMN IF NOT EXISTS issuing_institution text`);
    await db.execute(sql`ALTER TABLE trade_regulatory_changes ADD COLUMN IF NOT EXISTS affected_products jsonb NOT NULL DEFAULT '[]'::jsonb`);
    await db.execute(sql`ALTER TABLE trade_regulatory_changes ADD COLUMN IF NOT EXISTS affected_industries jsonb NOT NULL DEFAULT '[]'::jsonb`);
    await db.execute(sql`ALTER TABLE trade_regulatory_changes ADD COLUMN IF NOT EXISTS affected_hs_codes jsonb NOT NULL DEFAULT '[]'::jsonb`);
    await db.execute(sql`ALTER TABLE trade_regulatory_changes ADD COLUMN IF NOT EXISTS affected_country_codes jsonb NOT NULL DEFAULT '[]'::jsonb`);
    await db.execute(sql`ALTER TABLE trade_regulatory_changes ADD COLUMN IF NOT EXISTS affected_routes jsonb NOT NULL DEFAULT '[]'::jsonb`);
    await db.execute(sql`ALTER TABLE trade_regulatory_changes ADD COLUMN IF NOT EXISTS consequences text`);
    await db.execute(sql`ALTER TABLE trade_regulatory_changes ADD COLUMN IF NOT EXISTS recommended_actions jsonb NOT NULL DEFAULT '[]'::jsonb`);
    await db.execute(sql`ALTER TABLE trade_regulatory_changes ADD COLUMN IF NOT EXISTS confidence numeric(4,3) NOT NULL DEFAULT 0`);
    await db.execute(sql`ALTER TABLE trade_regulatory_changes ADD COLUMN IF NOT EXISTS source_published_at timestamp`);
    await db.execute(sql`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trade_regulatory_changes_confidence_check') THEN
          ALTER TABLE trade_regulatory_changes ADD CONSTRAINT trade_regulatory_changes_confidence_check CHECK (confidence >= 0 AND confidence <= 1);
        END IF;
      END $$
    `);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS trade_regulatory_changes_tenant_hash_unique ON trade_regulatory_changes(tenant_id, source_id, content_hash)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS trade_regulatory_changes_review_idx ON trade_regulatory_changes(tenant_id, verification_status, detected_at)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS trade_regulatory_changes_jurisdiction_idx ON trade_regulatory_changes(tenant_id, jurisdiction_country_code, effective_at)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS trade_regulatory_changes_comparison_idx ON trade_regulatory_changes(tenant_id, comparison_id)`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS trade_intelligence_alerts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        comparison_id uuid NOT NULL REFERENCES trade_source_comparisons(id) ON DELETE CASCADE,
        regulatory_change_id uuid REFERENCES trade_regulatory_changes(id) ON DELETE SET NULL,
        entity_id uuid REFERENCES trade_knowledge_entities(id) ON DELETE SET NULL,
        title text NOT NULL,
        summary text NOT NULL,
        consequences text,
        severity text NOT NULL DEFAULT 'informational',
        verification_status trade_verification_status NOT NULL DEFAULT 'evidence_pending',
        publication_status trade_publication_status NOT NULL DEFAULT 'draft',
        delivery_status text NOT NULL DEFAULT 'withheld',
        affected_products jsonb NOT NULL DEFAULT '[]'::jsonb,
        affected_industries jsonb NOT NULL DEFAULT '[]'::jsonb,
        affected_hs_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
        affected_country_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
        affected_routes jsonb NOT NULL DEFAULT '[]'::jsonb,
        recommended_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
        source_url text NOT NULL,
        source_published_at timestamp,
        effective_at timestamp,
        approved_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        approved_at timestamp,
        released_at timestamp,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now(),
        CONSTRAINT trade_intelligence_alerts_delivery_check CHECK (delivery_status IN ('withheld', 'ready_for_approval', 'sent', 'cancelled'))
      )
    `);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS trade_intelligence_alerts_tenant_comparison_unique ON trade_intelligence_alerts(tenant_id, comparison_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS trade_intelligence_alerts_review_idx ON trade_intelligence_alerts(tenant_id, verification_status, publication_status, created_at)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS trade_intelligence_alerts_delivery_idx ON trade_intelligence_alerts(tenant_id, delivery_status, severity, effective_at)`);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS trade_intelligence_alert_impacts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        alert_id uuid NOT NULL REFERENCES trade_intelligence_alerts(id) ON DELETE CASCADE,
        industrial_requirement_id uuid NOT NULL REFERENCES industrial_requirements(id) ON DELETE CASCADE,
        user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        recipient_role text NOT NULL,
        match_key text NOT NULL,
        match_score integer NOT NULL DEFAULT 0,
        match_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
        status text NOT NULL DEFAULT 'identified',
        notified_at timestamp,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now(),
        CONSTRAINT trade_intelligence_alert_impacts_match_score_check CHECK (match_score >= 0 AND match_score <= 100)
      )
    `);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS trade_intelligence_alert_impacts_tenant_match_unique ON trade_intelligence_alert_impacts(tenant_id, alert_id, match_key)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS trade_intelligence_alert_impacts_alert_status_idx ON trade_intelligence_alert_impacts(tenant_id, alert_id, status, match_score)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS trade_intelligence_alert_impacts_user_status_idx ON trade_intelligence_alert_impacts(tenant_id, user_id, status, created_at)`);

    const tenantsResult = await db.execute<{ id: number }>(sql`
      SELECT id FROM tenants WHERE lower(key) = 'exportunity'
    `);
    const exportunityTenantId = Number(tenantsResult.rows[0]?.id || 0);
    if (exportunityTenantId > 0) {
      await db
        .insert(tradeIndustrySectors)
        .values(
          TRADE_INTELLIGENCE_PRIORITY_SECTORS.map((sector) => ({
            tenantId: exportunityTenantId,
            code: sector.code,
            name: sector.name,
            nameFr: sector.nameFr,
            description: sector.description,
            status: "active",
            coverageTier: "priority",
            canonicalCategoryCodes: [...sector.canonicalCategoryCodes],
            rationale: "Initial source-backed Trade Intelligence launch taxonomy.",
            metadata: {
              seededFrom: "trade_intelligence_priority_sectors",
              emptyCoverageIsNotEvidence: true,
              externalCommunicationAllowed: false,
            },
          })),
        )
        .onConflictDoNothing();
      const activeSectors = await db
        .select({
          code: tradeIndustrySectors.code,
          name: tradeIndustrySectors.name,
          nameFr: tradeIndustrySectors.nameFr,
          description: tradeIndustrySectors.description,
          canonicalCategoryCodes: tradeIndustrySectors.canonicalCategoryCodes,
        })
        .from(tradeIndustrySectors)
        .where(
          and(
            eq(tradeIndustrySectors.tenantId, exportunityTenantId),
            eq(tradeIndustrySectors.status, "active"),
          ),
        );
      const coverageTargets = buildTradeIntelligenceCoverageTargets(
        exportunityTenantId,
        activeSectors.map((sector) => ({
          code: sector.code,
          name: sector.name,
          nameFr: sector.nameFr || sector.name,
          description: sector.description,
          canonicalCategoryCodes: sector.canonicalCategoryCodes || [],
        })),
      );
      await db
        .insert(tradeCoverageCells)
        .values(coverageTargets)
        .onConflictDoNothing();
    }
  })().catch((error) => {
    ensurePromise = null;
    throw error;
  });

  return ensurePromise;
}
