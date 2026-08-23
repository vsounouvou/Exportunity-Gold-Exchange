BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_fulfillment_kind') THEN
    CREATE TYPE industrial_fulfillment_kind AS ENUM ('standard_order', 'sample', 'prototype');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_fulfillment_status') THEN
    CREATE TYPE industrial_fulfillment_status AS ENUM (
      'release_review', 'procurement', 'inspection', 'ready_to_ship',
      'in_transit', 'customs', 'last_mile', 'delivered', 'exception', 'cancelled'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_fulfillment_service_type') THEN
    CREATE TYPE industrial_fulfillment_service_type AS ENUM (
      'procurement', 'inspection', 'freight', 'customs', 'last_mile'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_fulfillment_service_status') THEN
    CREATE TYPE industrial_fulfillment_service_status AS ENUM (
      'candidate', 'approval_required', 'approved', 'in_progress',
      'completed', 'exception', 'cancelled'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_fulfillment_event_source') THEN
    CREATE TYPE industrial_fulfillment_event_source AS ENUM (
      'system_payment', 'staff', 'delivery_network', 'provider_callback'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS industrial_fulfillment_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES industrial_orders(id) ON DELETE CASCADE,
  kind industrial_fulfillment_kind NOT NULL DEFAULT 'standard_order',
  status industrial_fulfillment_status NOT NULL DEFAULT 'release_review',
  tracking_code text NOT NULL,
  procurement_task_id integer REFERENCES tasks(id) ON DELETE SET NULL,
  public_eta timestamp,
  route_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  exception_summary text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamp,
  delivered_at timestamp,
  cancelled_at timestamp,
  created_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  updated_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS industrial_fulfillment_plans_tenant_order_unique
  ON industrial_fulfillment_plans(tenant_id, order_id);
CREATE UNIQUE INDEX IF NOT EXISTS industrial_fulfillment_plans_tenant_tracking_unique
  ON industrial_fulfillment_plans(tenant_id, tracking_code);
CREATE INDEX IF NOT EXISTS industrial_fulfillment_plans_tenant_status_idx
  ON industrial_fulfillment_plans(tenant_id, status, updated_at);

CREATE TABLE IF NOT EXISTS industrial_fulfillment_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES industrial_fulfillment_plans(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES industrial_orders(id) ON DELETE CASCADE,
  service_type industrial_fulfillment_service_type NOT NULL,
  status industrial_fulfillment_service_status NOT NULL DEFAULT 'candidate',
  provider_kind text NOT NULL DEFAULT 'internal_team',
  provider_name text,
  provider_reference text,
  external_reference text,
  public_label text,
  approval_reason text,
  approved_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  approved_at timestamp,
  approval_action_id integer,
  linked_delivery_order_id integer,
  linked_delivery_reference text,
  quoted_cost numeric(16,2),
  currency_code text,
  scheduled_start_at timestamp,
  scheduled_end_at timestamp,
  started_at timestamp,
  completed_at timestamp,
  performance_rating integer,
  on_time boolean,
  issue_count integer NOT NULL DEFAULT 0,
  performance_notes text,
  internal_notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  updated_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT industrial_fulfillment_services_rating_check
    CHECK (performance_rating IS NULL OR performance_rating BETWEEN 1 AND 5),
  CONSTRAINT industrial_fulfillment_services_issue_count_check
    CHECK (issue_count >= 0),
  CONSTRAINT industrial_fulfillment_services_cost_check
    CHECK (quoted_cost IS NULL OR quoted_cost >= 0),
  CONSTRAINT industrial_fulfillment_services_currency_check
    CHECK (currency_code IS NULL OR currency_code ~ '^[A-Z]{3}$')
);

DO $$
BEGIN
  IF to_regclass('public.action_requests') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'industrial_fulfillment_services_approval_action_id_fkey'
  ) THEN
    ALTER TABLE industrial_fulfillment_services
      ADD CONSTRAINT industrial_fulfillment_services_approval_action_id_fkey
      FOREIGN KEY (approval_action_id) REFERENCES action_requests(id) ON DELETE SET NULL;
  END IF;
  IF to_regclass('public.delivery_orders') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'industrial_fulfillment_services_linked_delivery_order_id_fkey'
  ) THEN
    ALTER TABLE industrial_fulfillment_services
      ADD CONSTRAINT industrial_fulfillment_services_linked_delivery_order_id_fkey
      FOREIGN KEY (linked_delivery_order_id) REFERENCES delivery_orders(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS industrial_fulfillment_services_plan_type_unique
  ON industrial_fulfillment_services(plan_id, service_type);
CREATE INDEX IF NOT EXISTS industrial_fulfillment_services_tenant_status_idx
  ON industrial_fulfillment_services(tenant_id, status, updated_at);
CREATE INDEX IF NOT EXISTS industrial_fulfillment_services_order_idx
  ON industrial_fulfillment_services(order_id, service_type);

CREATE TABLE IF NOT EXISTS industrial_fulfillment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES industrial_fulfillment_plans(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES industrial_orders(id) ON DELETE CASCADE,
  sequence integer NOT NULL,
  idempotency_key text NOT NULL,
  event_type text NOT NULL,
  plan_status industrial_fulfillment_status,
  title text NOT NULL,
  customer_message text,
  internal_notes text,
  customer_visible boolean NOT NULL DEFAULT false,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  proof jsonb NOT NULL DEFAULT '{}'::jsonb,
  source industrial_fulfillment_event_source NOT NULL DEFAULT 'staff',
  actor_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
  occurred_at timestamp NOT NULL DEFAULT now(),
  recorded_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT industrial_fulfillment_events_sequence_check CHECK (sequence > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS industrial_fulfillment_events_plan_sequence_unique
  ON industrial_fulfillment_events(plan_id, sequence);
CREATE UNIQUE INDEX IF NOT EXISTS industrial_fulfillment_events_tenant_idempotency_unique
  ON industrial_fulfillment_events(tenant_id, idempotency_key);
CREATE INDEX IF NOT EXISTS industrial_fulfillment_events_tenant_order_idx
  ON industrial_fulfillment_events(tenant_id, order_id, occurred_at);
CREATE INDEX IF NOT EXISTS industrial_fulfillment_events_public_timeline_idx
  ON industrial_fulfillment_events(plan_id, customer_visible, sequence);

COMMIT;
