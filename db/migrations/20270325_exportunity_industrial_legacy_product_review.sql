-- Controlled legacy product review ledger for Exportunity's industrial scope.
-- This migration does not alter, archive, publish, or delete seller_products.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_legacy_product_review_status') THEN
    CREATE TYPE industrial_legacy_product_review_status AS ENUM (
      'APPROVED_EXPORT_PRODUCT',
      'APPROVED_MACHINERY',
      'APPROVED_RAW_MATERIAL',
      'APPROVED_INDUSTRIAL_INPUT',
      'APPROVED_SPARE_PART',
      'APPROVED_INDUSTRIAL_SERVICE',
      'REQUIRES_RECLASSIFICATION',
      'REQUIRES_VERIFICATION',
      'INCOMPLETE',
      'DUPLICATE',
      'OUT_OF_SCOPE',
      'ARCHIVED'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS industrial_legacy_product_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  legacy_seller_product_id integer NOT NULL,
  legacy_seller_id integer,
  legacy_category_id integer,
  source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  review_status industrial_legacy_product_review_status NOT NULL DEFAULT 'REQUIRES_RECLASSIFICATION',
  suggested_status industrial_legacy_product_review_status,
  suggested_classification industrial_catalog_classification,
  proposed_classification industrial_catalog_classification,
  industrial_catalog_item_id uuid REFERENCES industrial_catalog_items(id) ON DELETE SET NULL,
  duplicate_of_legacy_product_id integer,
  review_reason text,
  reviewed_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  reviewed_at timestamp,
  archived_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT industrial_legacy_product_reviews_tenant_product_unique UNIQUE (tenant_id, legacy_seller_product_id)
);

CREATE INDEX IF NOT EXISTS industrial_legacy_product_reviews_tenant_status_idx
  ON industrial_legacy_product_reviews(tenant_id, review_status, updated_at);
CREATE INDEX IF NOT EXISTS industrial_legacy_product_reviews_tenant_catalog_item_idx
  ON industrial_legacy_product_reviews(tenant_id, industrial_catalog_item_id);
