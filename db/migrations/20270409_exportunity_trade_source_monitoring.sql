BEGIN;

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
);

CREATE UNIQUE INDEX IF NOT EXISTS trade_source_snapshots_tenant_content_unique
  ON trade_source_snapshots(tenant_id, source_id, document_key, content_hash);
CREATE INDEX IF NOT EXISTS trade_source_snapshots_history_idx
  ON trade_source_snapshots(tenant_id, source_id, document_key, retrieved_at);
CREATE INDEX IF NOT EXISTS trade_source_snapshots_jurisdiction_idx
  ON trade_source_snapshots(tenant_id, jurisdiction_country_code, snapshot_type, effective_at);

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
);

CREATE UNIQUE INDEX IF NOT EXISTS trade_source_comparisons_tenant_current_unique
  ON trade_source_comparisons(tenant_id, current_snapshot_id);
CREATE UNIQUE INDEX IF NOT EXISTS trade_source_comparisons_tenant_hash_unique
  ON trade_source_comparisons(tenant_id, source_id, comparison_hash);
CREATE INDEX IF NOT EXISTS trade_source_comparisons_review_idx
  ON trade_source_comparisons(tenant_id, status, is_substantive, created_at);

ALTER TABLE trade_regulatory_changes
  ADD COLUMN IF NOT EXISTS comparison_id uuid REFERENCES trade_source_comparisons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS previous_snapshot_id uuid REFERENCES trade_source_snapshots(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS current_snapshot_id uuid REFERENCES trade_source_snapshots(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS issuing_institution text,
  ADD COLUMN IF NOT EXISTS affected_products jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS affected_industries jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS affected_hs_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS affected_country_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS affected_routes jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS consequences text,
  ADD COLUMN IF NOT EXISTS recommended_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS confidence numeric(4,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_published_at timestamp;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'trade_regulatory_changes_confidence_check'
  ) THEN
    ALTER TABLE trade_regulatory_changes
      ADD CONSTRAINT trade_regulatory_changes_confidence_check
      CHECK (confidence >= 0 AND confidence <= 1);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS trade_regulatory_changes_comparison_idx
  ON trade_regulatory_changes(tenant_id, comparison_id);

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
);

CREATE UNIQUE INDEX IF NOT EXISTS trade_intelligence_alerts_tenant_comparison_unique
  ON trade_intelligence_alerts(tenant_id, comparison_id);
CREATE INDEX IF NOT EXISTS trade_intelligence_alerts_review_idx
  ON trade_intelligence_alerts(tenant_id, verification_status, publication_status, created_at);
CREATE INDEX IF NOT EXISTS trade_intelligence_alerts_delivery_idx
  ON trade_intelligence_alerts(tenant_id, delivery_status, severity, effective_at);

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
);

CREATE UNIQUE INDEX IF NOT EXISTS trade_intelligence_alert_impacts_tenant_match_unique
  ON trade_intelligence_alert_impacts(tenant_id, alert_id, match_key);
CREATE INDEX IF NOT EXISTS trade_intelligence_alert_impacts_alert_status_idx
  ON trade_intelligence_alert_impacts(tenant_id, alert_id, status, match_score);
CREATE INDEX IF NOT EXISTS trade_intelligence_alert_impacts_user_status_idx
  ON trade_intelligence_alert_impacts(tenant_id, user_id, status, created_at);

COMMIT;
