-- Extend the pre-existing internal supplier-cost ledger. This migration does
-- not create a parallel quote table and does not touch industrial_quotes,
-- which remains the customer-facing offer model.
CREATE TABLE IF NOT EXISTS industrial_supplier_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  requirement_id uuid NOT NULL REFERENCES industrial_requirements(id) ON DELETE CASCADE,
  supplier_profile_id uuid REFERENCES industrial_supplier_profiles(id) ON DELETE SET NULL,
  supplier_match_id uuid REFERENCES industrial_requirement_supplier_matches(id) ON DELETE SET NULL,
  reference_code text NOT NULL,
  product text,
  specification text,
  quantity_text text,
  unit text,
  unit_price numeric(16,4),
  total_cost numeric(16,2),
  currency_code text DEFAULT 'XOF',
  incoterm text,
  origin text,
  destination text,
  packaging text,
  minimum_order_quantity text,
  lead_time_days integer,
  payment_terms text,
  valid_until timestamp,
  certifications jsonb NOT NULL DEFAULT '[]'::jsonb,
  document_references jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_channel text NOT NULL DEFAULT 'manual',
  raw_source_message_id text,
  raw_source_text text,
  extraction_confidence numeric(4,3),
  status text NOT NULL DEFAULT 'needs_review',
  internal_notes text,
  created_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  received_at timestamp,
  reviewed_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  quote_intake_id uuid REFERENCES industrial_supplier_quote_intakes(id) ON DELETE RESTRICT,
  rfq_dispatch_id uuid REFERENCES industrial_supplier_rfq_dispatches(id) ON DELETE RESTRICT,
  rfq_draft_id uuid REFERENCES industrial_supplier_rfq_drafts(id) ON DELETE RESTRICT,
  source_received_at timestamptz,
  supplier_quote_reference text,
  unit_price_text text,
  total_amount_text text,
  lead_time_text text,
  validity_text text,
  certifications_text text,
  warranty text,
  supplier_notes text,
  projection_version text,
  normalization_version text,
  quote_hash text,
  field_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  provided_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  missing_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  ambiguous_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  comparison_ready boolean NOT NULL DEFAULT false,
  comparison_blockers jsonb NOT NULL DEFAULT '["canonical_projection_pending"]'::jsonb,
  offer_preparation_ready boolean NOT NULL DEFAULT false,
  offer_preparation_blockers jsonb NOT NULL DEFAULT '["canonical_projection_pending"]'::jsonb,
  qualified_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  qualified_at timestamptz,
  CONSTRAINT industrial_supplier_quotes_tenant_reference_unique UNIQUE (tenant_id, reference_code)
);

-- Production already has the legacy columns above. Add only the evidence and
-- lineage fields it cannot express. Nullable columns preserve any legacy rows;
-- canonical rows are governed by the conditional constraints below.
ALTER TABLE industrial_supplier_quotes
  ALTER COLUMN product DROP NOT NULL,
  ALTER COLUMN currency_code DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS quote_intake_id uuid REFERENCES industrial_supplier_quote_intakes(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS rfq_dispatch_id uuid REFERENCES industrial_supplier_rfq_dispatches(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS rfq_draft_id uuid REFERENCES industrial_supplier_rfq_drafts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS source_received_at timestamptz,
  ADD COLUMN IF NOT EXISTS supplier_quote_reference text,
  ADD COLUMN IF NOT EXISTS unit_price_text text,
  ADD COLUMN IF NOT EXISTS total_amount_text text,
  ADD COLUMN IF NOT EXISTS lead_time_text text,
  ADD COLUMN IF NOT EXISTS validity_text text,
  ADD COLUMN IF NOT EXISTS certifications_text text,
  ADD COLUMN IF NOT EXISTS warranty text,
  ADD COLUMN IF NOT EXISTS supplier_notes text,
  ADD COLUMN IF NOT EXISTS projection_version text,
  ADD COLUMN IF NOT EXISTS normalization_version text,
  ADD COLUMN IF NOT EXISTS quote_hash text,
  ADD COLUMN IF NOT EXISTS field_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS provided_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS missing_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ambiguous_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS comparison_ready boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS comparison_blockers jsonb NOT NULL DEFAULT '["canonical_projection_pending"]'::jsonb,
  ADD COLUMN IF NOT EXISTS offer_preparation_ready boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS offer_preparation_blockers jsonb NOT NULL DEFAULT '["canonical_projection_pending"]'::jsonb,
  ADD COLUMN IF NOT EXISTS qualified_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS qualified_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS industrial_supplier_quotes_intake_unique
  ON industrial_supplier_quotes(quote_intake_id);

CREATE INDEX IF NOT EXISTS industrial_supplier_quotes_tenant_requirement_idx
  ON industrial_supplier_quotes(tenant_id, requirement_id, status, updated_at);

CREATE INDEX IF NOT EXISTS industrial_supplier_quotes_tenant_supplier_idx
  ON industrial_supplier_quotes(tenant_id, supplier_profile_id, status);

CREATE INDEX IF NOT EXISTS industrial_supplier_quotes_source_message_idx
  ON industrial_supplier_quotes(tenant_id, raw_source_message_id);

CREATE INDEX IF NOT EXISTS industrial_supplier_quotes_tenant_readiness_idx
  ON industrial_supplier_quotes(
    tenant_id,
    comparison_ready,
    offer_preparation_ready,
    qualified_at DESC
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'industrial_supplier_quotes_canonical_lineage_check'
      AND conrelid = 'industrial_supplier_quotes'::regclass
  ) THEN
    ALTER TABLE industrial_supplier_quotes
      ADD CONSTRAINT industrial_supplier_quotes_canonical_lineage_check
      CHECK (
        quote_intake_id IS NULL OR (
          rfq_dispatch_id IS NOT NULL
          AND rfq_draft_id IS NOT NULL
          AND requirement_id IS NOT NULL
          AND supplier_profile_id IS NOT NULL
          AND source_received_at IS NOT NULL
          AND projection_version IS NOT NULL
          AND normalization_version IS NOT NULL
          AND quote_hash IS NOT NULL
          AND qualified_at IS NOT NULL
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'industrial_supplier_quotes_canonical_values_check'
      AND conrelid = 'industrial_supplier_quotes'::regclass
  ) THEN
    ALTER TABLE industrial_supplier_quotes
      ADD CONSTRAINT industrial_supplier_quotes_canonical_values_check
      CHECK (
        quote_intake_id IS NULL OR (
          char_length(btrim(reference_code)) BETWEEN 12 AND 80
          AND status IN ('qualified', 'superseded', 'withdrawn', 'expired')
          AND source_channel IN ('email', 'whatsapp')
          AND char_length(btrim(projection_version)) BETWEEN 3 AND 80
          AND char_length(btrim(normalization_version)) BETWEEN 3 AND 80
          AND quote_hash ~ '^[0-9a-f]{64}$'
          AND (currency_code IS NULL OR currency_code ~ '^[A-Z]{3}$')
          AND (incoterm IS NULL OR incoterm ~ '^[A-Z]{3}$')
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'industrial_supplier_quotes_canonical_evidence_check'
      AND conrelid = 'industrial_supplier_quotes'::regclass
  ) THEN
    ALTER TABLE industrial_supplier_quotes
      ADD CONSTRAINT industrial_supplier_quotes_canonical_evidence_check
      CHECK (
        jsonb_typeof(field_evidence) = 'object'
        AND jsonb_typeof(provided_fields) = 'array'
        AND jsonb_typeof(missing_fields) = 'array'
        AND jsonb_typeof(ambiguous_fields) = 'array'
        AND jsonb_typeof(comparison_blockers) = 'array'
        AND jsonb_typeof(offer_preparation_blockers) = 'array'
        AND (
          quote_intake_id IS NULL OR (
            comparison_ready = (jsonb_array_length(comparison_blockers) = 0)
            AND offer_preparation_ready =
              (jsonb_array_length(offer_preparation_blockers) = 0)
          )
        )
      );
  END IF;
END $$;

-- Preserve prior human work: qualified, correlated intakes become canonical,
-- source-backed rows in the existing supplier ledger. No offer, price conversion, ranking, order, payment,
-- or external action is created.
WITH qualified AS (
  SELECT
    intake.*,
    CASE WHEN intake.normalized_quote->'supplierQuoteReference'->>'state' = 'provided' THEN intake.normalized_quote->'supplierQuoteReference'->>'value' END AS supplier_quote_reference_value,
    CASE WHEN intake.normalized_quote->'productName'->>'state' = 'provided' THEN intake.normalized_quote->'productName'->>'value' END AS product_name_value,
    CASE WHEN intake.normalized_quote->'specification'->>'state' = 'provided' THEN intake.normalized_quote->'specification'->>'value' END AS specification_value,
    CASE WHEN intake.normalized_quote->'offeredQuantity'->>'state' = 'provided' THEN intake.normalized_quote->'offeredQuantity'->>'value' END AS offered_quantity_value,
    CASE WHEN intake.normalized_quote->'unitOfMeasure'->>'state' = 'provided' THEN intake.normalized_quote->'unitOfMeasure'->>'value' END AS unit_of_measure_value,
    CASE WHEN intake.normalized_quote->'currencyCode'->>'state' = 'provided' THEN intake.normalized_quote->'currencyCode'->>'value' END AS currency_code_value,
    CASE WHEN intake.normalized_quote->'unitPrice'->>'state' = 'provided' THEN intake.normalized_quote->'unitPrice'->>'value' END AS unit_price_value,
    CASE WHEN intake.normalized_quote->'totalAmount'->>'state' = 'provided' THEN intake.normalized_quote->'totalAmount'->>'value' END AS total_amount_value,
    CASE WHEN intake.normalized_quote->'minimumOrderQuantity'->>'state' = 'provided' THEN intake.normalized_quote->'minimumOrderQuantity'->>'value' END AS minimum_order_quantity_value,
    CASE WHEN intake.normalized_quote->'packaging'->>'state' = 'provided' THEN intake.normalized_quote->'packaging'->>'value' END AS packaging_value,
    CASE WHEN intake.normalized_quote->'leadTime'->>'state' = 'provided' THEN intake.normalized_quote->'leadTime'->>'value' END AS lead_time_value,
    CASE WHEN intake.normalized_quote->'incoterm'->>'state' = 'provided' THEN intake.normalized_quote->'incoterm'->>'value' END AS incoterm_value,
    CASE WHEN intake.normalized_quote->'paymentTerms'->>'state' = 'provided' THEN intake.normalized_quote->'paymentTerms'->>'value' END AS payment_terms_value,
    CASE WHEN intake.normalized_quote->'validity'->>'state' = 'provided' THEN intake.normalized_quote->'validity'->>'value' END AS validity_value,
    CASE WHEN intake.normalized_quote->'countryOfOrigin'->>'state' = 'provided' THEN intake.normalized_quote->'countryOfOrigin'->>'value' END AS country_of_origin_value,
    CASE WHEN intake.normalized_quote->'certifications'->>'state' = 'provided' THEN intake.normalized_quote->'certifications'->>'value' END AS certifications_value,
    CASE WHEN intake.normalized_quote->'warranty'->>'state' = 'provided' THEN intake.normalized_quote->'warranty'->>'value' END AS warranty_value,
    CASE WHEN intake.normalized_quote->'supplierNotes'->>'state' = 'provided' THEN intake.normalized_quote->'supplierNotes'->>'value' END AS supplier_notes_value
  FROM industrial_supplier_quote_intakes AS intake
  WHERE intake.review_status = 'qualified'
    AND intake.rfq_dispatch_id IS NOT NULL
    AND intake.rfq_draft_id IS NOT NULL
    AND intake.requirement_id IS NOT NULL
    AND intake.supplier_profile_id IS NOT NULL
), projected AS (
  SELECT
    qualified.*,
    COALESCE(
      (
        SELECT jsonb_agg(field.key ORDER BY field.key)
        FROM jsonb_each(qualified.normalized_quote) AS field(key, value)
        WHERE field.value->>'state' = 'provided'
      ),
      '[]'::jsonb
    ) AS provided_fields_value,
    to_jsonb(array_remove(ARRAY[
      CASE WHEN product_name_value IS NULL THEN 'productName:' || COALESCE(normalized_quote->'productName'->>'state', 'missing') END,
      CASE WHEN offered_quantity_value IS NULL THEN 'offeredQuantity:' || COALESCE(normalized_quote->'offeredQuantity'->>'state', 'missing') END,
      CASE WHEN unit_of_measure_value IS NULL THEN 'unitOfMeasure:' || COALESCE(normalized_quote->'unitOfMeasure'->>'state', 'missing') END,
      CASE WHEN currency_code_value IS NULL THEN 'currencyCode:' || COALESCE(normalized_quote->'currencyCode'->>'state', 'missing') END,
      CASE WHEN unit_price_value IS NULL AND total_amount_value IS NULL THEN 'price:unitPrice_' || COALESCE(normalized_quote->'unitPrice'->>'state', 'missing') || '_and_totalAmount_' || COALESCE(normalized_quote->'totalAmount'->>'state', 'missing') END
    ], NULL)) AS comparison_blockers_value,
    to_jsonb(array_remove(ARRAY[
      CASE WHEN product_name_value IS NULL THEN 'productName:' || COALESCE(normalized_quote->'productName'->>'state', 'missing') END,
      CASE WHEN offered_quantity_value IS NULL THEN 'offeredQuantity:' || COALESCE(normalized_quote->'offeredQuantity'->>'state', 'missing') END,
      CASE WHEN unit_of_measure_value IS NULL THEN 'unitOfMeasure:' || COALESCE(normalized_quote->'unitOfMeasure'->>'state', 'missing') END,
      CASE WHEN currency_code_value IS NULL THEN 'currencyCode:' || COALESCE(normalized_quote->'currencyCode'->>'state', 'missing') END,
      CASE WHEN unit_price_value IS NULL AND total_amount_value IS NULL THEN 'price:unitPrice_' || COALESCE(normalized_quote->'unitPrice'->>'state', 'missing') || '_and_totalAmount_' || COALESCE(normalized_quote->'totalAmount'->>'state', 'missing') END,
      CASE WHEN specification_value IS NULL THEN 'specification:' || COALESCE(normalized_quote->'specification'->>'state', 'missing') END,
      CASE WHEN lead_time_value IS NULL THEN 'leadTime:' || COALESCE(normalized_quote->'leadTime'->>'state', 'missing') END,
      CASE WHEN incoterm_value IS NULL THEN 'incoterm:' || COALESCE(normalized_quote->'incoterm'->>'state', 'missing') END,
      CASE WHEN payment_terms_value IS NULL THEN 'paymentTerms:' || COALESCE(normalized_quote->'paymentTerms'->>'state', 'missing') END,
      CASE WHEN validity_value IS NULL THEN 'validity:' || COALESCE(normalized_quote->'validity'->>'state', 'missing') END,
      CASE WHEN country_of_origin_value IS NULL THEN 'countryOfOrigin:' || COALESCE(normalized_quote->'countryOfOrigin'->>'state', 'missing') END
    ], NULL)) AS offer_blockers_value
  FROM qualified
)
INSERT INTO industrial_supplier_quotes (
  tenant_id,
  quote_intake_id,
  rfq_dispatch_id,
  rfq_draft_id,
  requirement_id,
  supplier_profile_id,
  reference_code,
  status,
  source_channel,
  source_received_at,
  supplier_quote_reference,
  product,
  specification,
  quantity_text,
  unit,
  currency_code,
  unit_price_text,
  total_amount_text,
  minimum_order_quantity,
  packaging,
  lead_time_text,
  incoterm,
  payment_terms,
  validity_text,
  origin,
  certifications_text,
  warranty,
  supplier_notes,
  projection_version,
  normalization_version,
  quote_hash,
  field_evidence,
  provided_fields,
  missing_fields,
  ambiguous_fields,
  comparison_ready,
  comparison_blockers,
  offer_preparation_ready,
  offer_preparation_blockers,
  qualified_by_user_id,
  qualified_at,
  created_by_user_id,
  received_at,
  reviewed_at
)
SELECT
  tenant_id,
  id,
  rfq_dispatch_id,
  rfq_draft_id,
  requirement_id,
  supplier_profile_id,
  'SUPQ-' || upper(replace(id::text, '-', '')),
  'qualified',
  channel,
  source_received_at,
  supplier_quote_reference_value,
  product_name_value,
  specification_value,
  offered_quantity_value,
  unit_of_measure_value,
  currency_code_value,
  unit_price_value,
  total_amount_value,
  minimum_order_quantity_value,
  packaging_value,
  lead_time_value,
  incoterm_value,
  payment_terms_value,
  validity_value,
  country_of_origin_value,
  certifications_value,
  warranty_value,
  supplier_notes_value,
  'source-backed-sql-v1',
  normalization_version,
  encode(
    digest(
      concat_ws(':', 'source-backed-sql-v1', normalization_version, normalized_quote::text),
      'sha256'
    ),
    'hex'
  ),
  normalized_quote,
  provided_fields_value,
  missing_fields,
  ambiguous_fields,
  jsonb_array_length(comparison_blockers_value) = 0,
  comparison_blockers_value,
  jsonb_array_length(offer_blockers_value) = 0,
  offer_blockers_value,
  reviewed_by_user_id,
  COALESCE(reviewed_at, updated_at),
  reviewed_by_user_id,
  source_received_at AT TIME ZONE 'UTC',
  COALESCE(reviewed_at, updated_at) AT TIME ZONE 'UTC'
FROM projected
ON CONFLICT (quote_intake_id) DO NOTHING;

COMMENT ON TABLE industrial_supplier_quotes IS
  'Existing internal supplier-cost ledger extended with exact source-intake lineage, evidence states, and readiness gates. industrial_quotes remains the customer-facing offer table.';

-- Rollback contract:
-- * Before any canonical row exists, the added constraints, readiness/intake
--   indexes, and added columns may be removed after verifying
--   NOT EXISTS (SELECT 1 FROM industrial_supplier_quotes WHERE quote_intake_id IS NOT NULL).
-- * After canonical evidence exists, do not drop it. Ship an additive forward
--   fix and leave offer/order/payment activation disabled until it is verified.
