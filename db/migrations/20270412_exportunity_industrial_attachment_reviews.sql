-- Governed image/OCR/CAD interpretation. Model output is never authoritative
-- and cannot mutate a requirement until a human-approved apply action occurs.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'industrial_attachment_review_kind'
  ) THEN
    CREATE TYPE industrial_attachment_review_kind AS ENUM (
      'image_vision',
      'scanned_document_ocr',
      'cad_technical',
      'manual'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'industrial_attachment_review_status'
  ) THEN
    CREATE TYPE industrial_attachment_review_status AS ENUM (
      'pending_analysis',
      'analysis_ready',
      'analysis_failed',
      'under_review',
      'approved',
      'rejected',
      'applied'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS industrial_attachment_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  requirement_id uuid NOT NULL REFERENCES industrial_requirements(id) ON DELETE CASCADE,
  attachment_id uuid NOT NULL REFERENCES industrial_requirement_attachments(id) ON DELETE CASCADE,
  review_kind industrial_attachment_review_kind NOT NULL,
  status industrial_attachment_review_status NOT NULL DEFAULT 'under_review',
  analysis_proposal jsonb NOT NULL DEFAULT '{}'::jsonb,
  reviewed_proposal jsonb NOT NULL DEFAULT '{}'::jsonb,
  generation_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  analysis_warning text,
  review_notes text,
  applied_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  requested_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  requested_at timestamp,
  reviewed_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  reviewed_at timestamp,
  approved_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  approved_at timestamp,
  rejected_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  rejected_at timestamp,
  applied_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  applied_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, attachment_id)
);

CREATE INDEX IF NOT EXISTS industrial_attachment_reviews_requirement_status_idx
  ON industrial_attachment_reviews(tenant_id, requirement_id, status, updated_at);

CREATE TABLE IF NOT EXISTS industrial_attachment_review_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  review_id uuid NOT NULL REFERENCES industrial_attachment_reviews(id) ON DELETE CASCADE,
  requirement_id uuid NOT NULL REFERENCES industrial_requirements(id) ON DELETE CASCADE,
  attachment_id uuid NOT NULL REFERENCES industrial_requirement_attachments(id) ON DELETE CASCADE,
  action text NOT NULL,
  from_status industrial_attachment_review_status,
  to_status industrial_attachment_review_status NOT NULL,
  reason text,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS industrial_attachment_review_events_review_timeline_idx
  ON industrial_attachment_review_events(review_id, created_at);

CREATE INDEX IF NOT EXISTS industrial_attachment_review_events_requirement_timeline_idx
  ON industrial_attachment_review_events(tenant_id, requirement_id, created_at);
