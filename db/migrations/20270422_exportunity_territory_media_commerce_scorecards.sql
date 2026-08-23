-- Extends the canonical territory_kpis table; no parallel scorecard or budget table is created.
-- Existing rows remain evidence_status='unknown' with nullable media-to-commerce metrics.

ALTER TABLE IF EXISTS territory_kpis
  ADD COLUMN IF NOT EXISTS fulfilled_gmv_minor bigint,
  ADD COLUMN IF NOT EXISTS producer_income_minor bigint,
  ADD COLUMN IF NOT EXISTS contribution_margin_minor bigint,
  ADD COLUMN IF NOT EXISTS creator_attributed_sales_minor bigint,
  ADD COLUMN IF NOT EXISTS media_spend_minor bigint,
  ADD COLUMN IF NOT EXISTS product_page_sessions integer,
  ADD COLUMN IF NOT EXISTS qualified_leads integer,
  ADD COLUMN IF NOT EXISTS acquired_customers integer,
  ADD COLUMN IF NOT EXISTS attributable_completed_orders integer,
  ADD COLUMN IF NOT EXISTS group_order_campaigns integer,
  ADD COLUMN IF NOT EXISTS group_order_thresholds_reached integer,
  ADD COLUMN IF NOT EXISTS payment_attempts integer,
  ADD COLUMN IF NOT EXISTS payment_successes integer,
  ADD COLUMN IF NOT EXISTS delivery_attempts integer,
  ADD COLUMN IF NOT EXISTS successful_deliveries integer,
  ADD COLUMN IF NOT EXISTS on_time_deliveries integer,
  ADD COLUMN IF NOT EXISTS disputes integer,
  ADD COLUMN IF NOT EXISTS refunds integer,
  ADD COLUMN IF NOT EXISTS repeat_buyers integer,
  ADD COLUMN IF NOT EXISTS rights_cleared_assets integer,
  ADD COLUMN IF NOT EXISTS published_content_assets integer,
  ADD COLUMN IF NOT EXISTS currency_code text,
  ADD COLUMN IF NOT EXISTS evidence_status text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS metric_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS source_window_start timestamptz,
  ADD COLUMN IF NOT EXISTS source_window_end timestamptz,
  ADD COLUMN IF NOT EXISTS evidence_idempotency_key text,
  ADD COLUMN IF NOT EXISTS evidence_version integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS scorecard_action_run_id integer,
  ADD COLUMN IF NOT EXISTS recorded_by_user_id integer,
  ADD COLUMN IF NOT EXISTS recorded_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'territory_kpis_evidence_status_check'
  ) THEN
    ALTER TABLE territory_kpis
      ADD CONSTRAINT territory_kpis_evidence_status_check
      CHECK (evidence_status IN ('unknown', 'partial', 'verified')) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'territory_kpis_currency_check'
  ) THEN
    ALTER TABLE territory_kpis
      ADD CONSTRAINT territory_kpis_currency_check
      CHECK (currency_code IS NULL OR currency_code ~ '^[A-Z]{3}$') NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'territory_kpis_metric_counts_check'
  ) THEN
    ALTER TABLE territory_kpis
      ADD CONSTRAINT territory_kpis_metric_counts_check CHECK (
        (fulfilled_gmv_minor IS NULL OR fulfilled_gmv_minor >= 0)
        AND (producer_income_minor IS NULL OR producer_income_minor >= 0)
        AND (creator_attributed_sales_minor IS NULL OR creator_attributed_sales_minor >= 0)
        AND (media_spend_minor IS NULL OR media_spend_minor >= 0)
        AND (product_page_sessions IS NULL OR product_page_sessions >= 0)
        AND (qualified_leads IS NULL OR qualified_leads >= 0)
        AND (acquired_customers IS NULL OR acquired_customers >= 0)
        AND (attributable_completed_orders IS NULL OR attributable_completed_orders >= 0)
        AND (group_order_campaigns IS NULL OR group_order_campaigns >= 0)
        AND (group_order_thresholds_reached IS NULL OR group_order_thresholds_reached >= 0)
        AND (payment_attempts IS NULL OR payment_attempts >= 0)
        AND (payment_successes IS NULL OR payment_successes >= 0)
        AND (delivery_attempts IS NULL OR delivery_attempts >= 0)
        AND (successful_deliveries IS NULL OR successful_deliveries >= 0)
        AND (on_time_deliveries IS NULL OR on_time_deliveries >= 0)
        AND (disputes IS NULL OR disputes >= 0)
        AND (refunds IS NULL OR refunds >= 0)
        AND (repeat_buyers IS NULL OR repeat_buyers >= 0)
        AND (rights_cleared_assets IS NULL OR rights_cleared_assets >= 0)
        AND (published_content_assets IS NULL OR published_content_assets >= 0)
        AND evidence_version >= 0
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'territory_kpis_metric_bounds_check'
  ) THEN
    ALTER TABLE territory_kpis
      ADD CONSTRAINT territory_kpis_metric_bounds_check CHECK (
        (group_order_thresholds_reached IS NULL OR group_order_campaigns IS NULL OR group_order_thresholds_reached <= group_order_campaigns)
        AND (payment_successes IS NULL OR payment_attempts IS NULL OR payment_successes <= payment_attempts)
        AND (successful_deliveries IS NULL OR delivery_attempts IS NULL OR successful_deliveries <= delivery_attempts)
        AND (on_time_deliveries IS NULL OR successful_deliveries IS NULL OR on_time_deliveries <= successful_deliveries)
        AND (disputes IS NULL OR attributable_completed_orders IS NULL OR disputes <= attributable_completed_orders)
        AND (refunds IS NULL OR attributable_completed_orders IS NULL OR refunds <= attributable_completed_orders)
        AND (acquired_customers IS NULL OR qualified_leads IS NULL OR acquired_customers <= qualified_leads)
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'territory_kpis_evidence_binding_check'
  ) THEN
    ALTER TABLE territory_kpis
      ADD CONSTRAINT territory_kpis_evidence_binding_check CHECK (
        evidence_status = 'unknown'
        OR (
          currency_code IS NOT NULL
          AND source_window_start IS NOT NULL
          AND source_window_end IS NOT NULL
          AND source_window_end >= source_window_start
          AND recorded_at IS NOT NULL
          AND evidence_idempotency_key IS NOT NULL
          AND evidence_version > 0
          AND metric_evidence @> '{"credentialsExcluded": true}'::jsonb
          AND jsonb_typeof(metric_evidence -> 'metricKeys') = 'array'
          AND jsonb_array_length(metric_evidence -> 'metricKeys') > 0
          AND jsonb_typeof(metric_evidence -> 'metrics') = 'object'
        )
      ) NOT VALID;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS territory_kpis_evidence_idempotency_uniq
  ON territory_kpis(territory_id, evidence_idempotency_key)
  WHERE evidence_idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS territory_kpis_evidence_status_idx
  ON territory_kpis(territory_id, evidence_status, month DESC);

-- Rollback (manual, destructive): drop the indexes/constraints above, then the added columns.
-- Do not drop territory_kpis: it predates and remains canonical after this migration.
