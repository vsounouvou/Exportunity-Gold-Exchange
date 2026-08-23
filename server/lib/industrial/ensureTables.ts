import { sql } from "drizzle-orm";

import { db } from "@db";
import { ensureCompanyBrainTables } from "../company-brain/ensureTables";
import { ensureCarrierNetworkTables } from "./ensureCarrierNetworkTables";

let ensurePromise: Promise<void> | null = null;

export async function ensureIndustrialTables() {
  if (ensurePromise) return ensurePromise;

  ensurePromise = (async () => {
    await ensureCompanyBrainTables();
    await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    await db.execute(sql`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_visibility') THEN
          CREATE TYPE industrial_visibility AS ENUM ('public', 'verified_users_only', 'parties_to_transaction', 'factory_team_only', 'exportunity_internal', 'admin_only');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_factory_status') THEN
          CREATE TYPE industrial_factory_status AS ENUM ('draft', 'submitted', 'under_review', 'active', 'suspended', 'archived');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_verification_status') THEN
          CREATE TYPE industrial_verification_status AS ENUM ('unverified', 'submitted', 'under_review', 'verified', 'rejected', 'suspended');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_catalog_classification') THEN
          CREATE TYPE industrial_catalog_classification AS ENUM ('export_ready_factory_product', 'machinery', 'raw_material', 'industrial_input', 'spare_part', 'industrial_service');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_catalog_status') THEN
          CREATE TYPE industrial_catalog_status AS ENUM ('draft', 'under_review', 'approved', 'archived');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_requirement_match_status') THEN
          CREATE TYPE industrial_requirement_match_status AS ENUM ('candidate', 'shortlisted', 'selected', 'rejected');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_supplier_status') THEN
          CREATE TYPE industrial_supplier_status AS ENUM ('draft', 'under_review', 'active', 'suspended', 'archived');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_supplier_nda_status') THEN
          CREATE TYPE industrial_supplier_nda_status AS ENUM ('not_assessed', 'under_review', 'signed', 'not_required');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_quote_status') THEN
          CREATE TYPE industrial_quote_status AS ENUM ('draft', 'under_review', 'ready_for_account_manager', 'issued', 'accepted', 'declined', 'expired', 'cancelled');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_order_status') THEN
          CREATE TYPE industrial_order_status AS ENUM ('confirmed', 'procurement', 'manufacturing', 'quality_control', 'delivery', 'completed', 'cancelled');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_fulfillment_kind') THEN
          CREATE TYPE industrial_fulfillment_kind AS ENUM ('standard_order', 'sample', 'prototype');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_fulfillment_status') THEN
          CREATE TYPE industrial_fulfillment_status AS ENUM ('release_review', 'procurement', 'inspection', 'ready_to_ship', 'in_transit', 'customs', 'last_mile', 'delivered', 'exception', 'cancelled');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_fulfillment_service_type') THEN
          CREATE TYPE industrial_fulfillment_service_type AS ENUM ('procurement', 'inspection', 'freight', 'customs', 'last_mile');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_fulfillment_service_status') THEN
          CREATE TYPE industrial_fulfillment_service_status AS ENUM ('candidate', 'approval_required', 'approved', 'in_progress', 'completed', 'exception', 'cancelled');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_fulfillment_event_source') THEN
          CREATE TYPE industrial_fulfillment_event_source AS ENUM ('system_payment', 'staff', 'delivery_network', 'provider_callback');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_factory_claim_status') THEN
          CREATE TYPE industrial_factory_claim_status AS ENUM ('submitted', 'under_review', 'approved', 'rejected', 'cancelled');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_requirement_type') THEN
          CREATE TYPE industrial_requirement_type AS ENUM ('machinery', 'raw_material', 'industrial_input', 'spare_part', 'custom_manufacturing', 'industrial_service', 'export_quotation');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_requirement_status') THEN
          CREATE TYPE industrial_requirement_status AS ENUM ('draft', 'submitted', 'triaged', 'under_review', 'supplier_matching', 'quote_preparation', 'quoted', 'closed', 'cancelled');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_recurring_requirement_status') THEN
          CREATE TYPE industrial_recurring_requirement_status AS ENUM ('draft', 'active', 'paused', 'closed');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_challenge_status') THEN
          CREATE TYPE industrial_challenge_status AS ENUM ('submitted', 'triaged', 'grouped', 'sourcing_review', 'engineering_review', 'local_manufacturing_review', 'resolved', 'declined', 'closed');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_challenge_outcome') THEN
          CREATE TYPE industrial_challenge_outcome AS ENUM ('review_required', 'stock_candidate', 'group_procurement', 'reverse_engineering', 'local_manufacturing', 'redesign', 'engineering_partner', 'declined');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_part_record_status') THEN
          CREATE TYPE industrial_part_record_status AS ENUM ('captured', 'digitization', 'technical_review', 'route_review', 'route_selected', 'prototype', 'validated', 'catalog_candidate', 'archived');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_part_route_decision') THEN
          CREATE TYPE industrial_part_route_decision AS ENUM ('review_required', 'stock', 'distribute', 'assemble', 'manufacture_local', 'import');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_factory_lead_status') THEN
          CREATE TYPE industrial_factory_lead_status AS ENUM ('new', 'under_review', 'qualified', 'contact_ready', 'rejected', 'converted');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_discovery_candidate_status') THEN
          CREATE TYPE industrial_discovery_candidate_status AS ENUM ('discovered', 'under_review', 'verification_pending', 'rejected', 'promoted');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_supplier_rfq_status') THEN
          CREATE TYPE industrial_supplier_rfq_status AS ENUM ('draft', 'approval_pending', 'approved_for_outreach', 'rejected', 'cancelled');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_supplier_rfq_decision') THEN
          CREATE TYPE industrial_supplier_rfq_decision AS ENUM ('approved', 'rejected');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_supplier_contact_channel') THEN
          CREATE TYPE industrial_supplier_contact_channel AS ENUM ('email', 'whatsapp');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_supplier_contact_control_state') THEN
          CREATE TYPE industrial_supplier_contact_control_state AS ENUM ('authorized', 'suppressed');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_supplier_contact_authorization_basis') THEN
          CREATE TYPE industrial_supplier_contact_authorization_basis AS ENUM ('explicit_consent', 'existing_business_relationship', 'supplier_initiated_inquiry');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_supplier_rfq_dispatch_status') THEN
          CREATE TYPE industrial_supplier_rfq_dispatch_status AS ENUM ('reserved', 'sending', 'accepted', 'failed', 'unknown');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_supplier_quote_correlation_status') THEN
          CREATE TYPE industrial_supplier_quote_correlation_status AS ENUM ('exact', 'inferred', 'ambiguous', 'unmatched');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_supplier_quote_review_status') THEN
          CREATE TYPE industrial_supplier_quote_review_status AS ENUM ('needs_review', 'qualified', 'rejected');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_factory_relationship_stage') THEN
          CREATE TYPE industrial_factory_relationship_stage AS ENUM ('identified', 'research_in_progress', 'contacted', 'qualified', 'visit_scheduled', 'factory_visited', 'requirements_collected', 'proposal_in_preparation', 'active_customer', 'recurring_customer', 'dormant', 'disqualified');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_legacy_product_review_status') THEN
          CREATE TYPE industrial_legacy_product_review_status AS ENUM ('APPROVED_EXPORT_PRODUCT', 'APPROVED_MACHINERY', 'APPROVED_RAW_MATERIAL', 'APPROVED_INDUSTRIAL_INPUT', 'APPROVED_SPARE_PART', 'APPROVED_INDUSTRIAL_SERVICE', 'REQUIRES_RECLASSIFICATION', 'REQUIRES_VERIFICATION', 'INCOMPLETE', 'DUPLICATE', 'OUT_OF_SCOPE', 'ARCHIVED');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_attachment_review_kind') THEN
          CREATE TYPE industrial_attachment_review_kind AS ENUM ('image_vision', 'scanned_document_ocr', 'cad_technical', 'manual');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_attachment_review_status') THEN
          CREATE TYPE industrial_attachment_review_status AS ENUM ('pending_analysis', 'analysis_ready', 'analysis_failed', 'under_review', 'approved', 'rejected', 'applied');
        END IF;
      END $$;
    `);
    await db.execute(
      sql`ALTER TYPE industrial_discovery_candidate_status ADD VALUE IF NOT EXISTS 'promoted'`,
    );
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS industrial_factories (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        owner_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        account_manager_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        legal_name text NOT NULL,
        display_name text NOT NULL,
        normalized_name text NOT NULL,
        registration_number text,
        factory_status industrial_factory_status NOT NULL DEFAULT 'draft',
        verification_status industrial_verification_status NOT NULL DEFAULT 'unverified',
        public_visibility industrial_visibility NOT NULL DEFAULT 'exportunity_internal',
        country_code text NOT NULL,
        region text,
        city text,
        industrial_zone text,
        public_address text,
        latitude numeric(10,7),
        longitude numeric(10,7),
        primary_industry text NOT NULL,
        industries jsonb NOT NULL DEFAULT '[]'::jsonb,
        public_description text,
        public_website text,
        public_email text,
        public_phone text,
        public_certifications jsonb NOT NULL DEFAULT '[]'::jsonb,
        export_markets jsonb NOT NULL DEFAULT '[]'::jsonb,
        private_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
        admin_notes text,
        submitted_at timestamp,
        verified_at timestamp,
        archived_at timestamp,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await db.execute(
      sql`CREATE UNIQUE INDEX IF NOT EXISTS industrial_factories_tenant_name_unique ON industrial_factories(tenant_id, normalized_name)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_factories_tenant_visibility_idx ON industrial_factories(tenant_id, factory_status, verification_status, public_visibility)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_factories_tenant_location_idx ON industrial_factories(tenant_id, country_code, city, industrial_zone)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_factories_tenant_industry_idx ON industrial_factories(tenant_id, primary_industry)`,
    );

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS industrial_factory_relationships (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        factory_id uuid NOT NULL REFERENCES industrial_factories(id) ON DELETE CASCADE,
        account_manager_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        stage industrial_factory_relationship_stage NOT NULL DEFAULT 'identified',
        next_action text,
        next_review_at timestamp,
        last_contacted_at timestamp,
        last_contacted_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        last_contact_summary text,
        internal_notes text,
        created_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        updated_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now(),
        CONSTRAINT industrial_factory_relationships_factory_unique UNIQUE (factory_id)
      )
    `);
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_factory_relationships_tenant_stage_idx ON industrial_factory_relationships(tenant_id, stage, next_review_at)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_factory_relationships_tenant_manager_idx ON industrial_factory_relationships(tenant_id, account_manager_user_id, stage)`,
    );

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS industrial_factory_leads (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        source text NOT NULL DEFAULT 'manual',
        discovery_key text,
        google_place_id text,
        name text NOT NULL,
        normalized_name text NOT NULL,
        primary_industry text,
        google_types jsonb NOT NULL DEFAULT '[]'::jsonb,
        address text,
        city text,
        country_code text,
        latitude numeric(10,7),
        longitude numeric(10,7),
        phone text,
        website text,
        google_maps_url text,
        rating numeric(3,2),
        review_count integer,
        business_status text,
        opening_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
        lead_status industrial_factory_lead_status NOT NULL DEFAULT 'new',
        qualification_score integer NOT NULL DEFAULT 0,
        screening_notes text,
        contact_status text NOT NULL DEFAULT 'not_contacted',
        last_enriched_at timestamp,
        reviewed_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        reviewed_at timestamp,
        converted_factory_id uuid REFERENCES industrial_factories(id) ON DELETE SET NULL,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await db.execute(
      sql`CREATE UNIQUE INDEX IF NOT EXISTS industrial_factory_leads_tenant_google_place_unique ON industrial_factory_leads(tenant_id, google_place_id)`,
    );
    await db.execute(sql`
      ALTER TABLE industrial_factory_leads
        ADD COLUMN IF NOT EXISTS discovery_key text
    `);
    await db.execute(
      sql`CREATE UNIQUE INDEX IF NOT EXISTS industrial_factory_leads_tenant_discovery_key_unique ON industrial_factory_leads(tenant_id, discovery_key)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_factory_leads_tenant_name_city_idx ON industrial_factory_leads(tenant_id, normalized_name, city)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_factory_leads_tenant_status_idx ON industrial_factory_leads(tenant_id, lead_status, qualification_score)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_factory_leads_tenant_location_idx ON industrial_factory_leads(tenant_id, country_code, city)`,
    );
    await db.execute(sql`
      ALTER TABLE industrial_factory_leads
      ADD COLUMN IF NOT EXISTS converted_factory_id uuid REFERENCES industrial_factories(id) ON DELETE SET NULL
    `);
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_factory_leads_converted_factory_idx ON industrial_factory_leads(converted_factory_id)`,
    );

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS industrial_production_lines (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        factory_id uuid NOT NULL REFERENCES industrial_factories(id) ON DELETE CASCADE,
        name text NOT NULL,
        industry text,
        operating_status text NOT NULL DEFAULT 'unknown',
        visibility industrial_visibility NOT NULL DEFAULT 'factory_team_only',
        public_summary text,
        private_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_production_lines_factory_idx ON industrial_production_lines(factory_id, visibility)`,
    );

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS industrial_machines (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        factory_id uuid NOT NULL REFERENCES industrial_factories(id) ON DELETE CASCADE,
        production_line_id uuid REFERENCES industrial_production_lines(id) ON DELETE SET NULL,
        name text NOT NULL,
        manufacturer text,
        model text,
        serial_number text,
        machine_category text,
        operating_status text NOT NULL DEFAULT 'unknown',
        visibility industrial_visibility NOT NULL DEFAULT 'factory_team_only',
        private_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_machines_factory_idx ON industrial_machines(factory_id, visibility)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_machines_line_idx ON industrial_machines(production_line_id)`,
    );

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS industrial_machine_assemblies (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        factory_id uuid NOT NULL REFERENCES industrial_factories(id) ON DELETE CASCADE,
        machine_id uuid NOT NULL REFERENCES industrial_machines(id) ON DELETE CASCADE,
        name text NOT NULL,
        assembly_type text,
        operating_status text NOT NULL DEFAULT 'unknown',
        visibility industrial_visibility NOT NULL DEFAULT 'factory_team_only',
        public_summary text,
        private_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_machine_assemblies_factory_idx ON industrial_machine_assemblies(factory_id, visibility)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_machine_assemblies_machine_idx ON industrial_machine_assemblies(machine_id, visibility)`,
    );

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS industrial_machine_components (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        factory_id uuid NOT NULL REFERENCES industrial_factories(id) ON DELETE CASCADE,
        machine_id uuid NOT NULL REFERENCES industrial_machines(id) ON DELETE CASCADE,
        assembly_id uuid REFERENCES industrial_machine_assemblies(id) ON DELETE SET NULL,
        name text NOT NULL,
        component_type text,
        part_number text,
        manufacturer text,
        model text,
        criticality text NOT NULL DEFAULT 'standard',
        operating_status text NOT NULL DEFAULT 'unknown',
        visibility industrial_visibility NOT NULL DEFAULT 'factory_team_only',
        private_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_machine_components_factory_idx ON industrial_machine_components(factory_id, visibility)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_machine_components_machine_idx ON industrial_machine_components(machine_id, visibility)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_machine_components_assembly_idx ON industrial_machine_components(assembly_id, visibility)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_machine_components_factory_part_number_idx ON industrial_machine_components(factory_id, part_number)`,
    );

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS industrial_catalog_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        factory_id uuid NOT NULL REFERENCES industrial_factories(id) ON DELETE CASCADE,
        classification industrial_catalog_classification NOT NULL,
        category_code text NOT NULL,
        name text NOT NULL,
        normalized_name text NOT NULL,
        public_description text,
        product_code text,
        supply_modes jsonb NOT NULL DEFAULT '[]'::jsonb,
        price_mode text NOT NULL DEFAULT 'quote_required',
        availability_status text NOT NULL DEFAULT 'subject_to_confirmation',
        manufacturer text,
        brand text,
        model text,
        part_number text,
        country_of_origin text,
        technical_specifications jsonb NOT NULL DEFAULT '{}'::jsonb,
        application text,
        compatible_machinery jsonb NOT NULL DEFAULT '[]'::jsonb,
        material text,
        unit_of_measure text,
        minimum_order_quantity text,
        available_quantity_text text,
        production_capacity_text text,
        lead_time_text text,
        supply_frequency text,
        currency_code text,
        price_text text,
        certifications jsonb NOT NULL DEFAULT '[]'::jsonb,
        visibility industrial_visibility NOT NULL DEFAULT 'exportunity_internal',
        approval_status industrial_catalog_status NOT NULL DEFAULT 'draft',
        public_media jsonb NOT NULL DEFAULT '[]'::jsonb,
        private_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_catalog_items_tenant_public_idx ON industrial_catalog_items(tenant_id, approval_status, visibility, classification)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_catalog_items_factory_idx ON industrial_catalog_items(factory_id, approval_status)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_catalog_items_tenant_name_idx ON industrial_catalog_items(tenant_id, normalized_name)`,
    );
    await db.execute(sql`
      ALTER TABLE industrial_catalog_items
        ADD COLUMN IF NOT EXISTS manufacturer text,
        ADD COLUMN IF NOT EXISTS brand text,
        ADD COLUMN IF NOT EXISTS model text,
        ADD COLUMN IF NOT EXISTS part_number text,
        ADD COLUMN IF NOT EXISTS country_of_origin text,
        ADD COLUMN IF NOT EXISTS technical_specifications jsonb NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS application text,
        ADD COLUMN IF NOT EXISTS compatible_machinery jsonb NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS material text,
        ADD COLUMN IF NOT EXISTS unit_of_measure text,
        ADD COLUMN IF NOT EXISTS minimum_order_quantity text,
        ADD COLUMN IF NOT EXISTS available_quantity_text text,
        ADD COLUMN IF NOT EXISTS production_capacity_text text,
        ADD COLUMN IF NOT EXISTS lead_time_text text,
        ADD COLUMN IF NOT EXISTS supply_frequency text,
        ADD COLUMN IF NOT EXISTS currency_code text,
        ADD COLUMN IF NOT EXISTS price_text text,
        ADD COLUMN IF NOT EXISTS certifications jsonb NOT NULL DEFAULT '[]'::jsonb
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS industrial_requirements (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        factory_id uuid REFERENCES industrial_factories(id) ON DELETE SET NULL,
        requester_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        assigned_account_manager_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        reference_code text NOT NULL,
        requirement_type industrial_requirement_type NOT NULL,
        category_code text NOT NULL,
        title text NOT NULL,
        details text NOT NULL,
        quantity_text text,
        delivery_country_code text,
        delivery_city text,
        required_by timestamp,
        urgency text NOT NULL DEFAULT 'standard',
        requester_company text,
        requester_name text NOT NULL,
        requester_email text,
        requester_phone text,
        status industrial_requirement_status NOT NULL DEFAULT 'draft',
        visibility industrial_visibility NOT NULL DEFAULT 'exportunity_internal',
        internal_notes text,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        submitted_at timestamp,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await db.execute(
      sql`CREATE UNIQUE INDEX IF NOT EXISTS industrial_requirements_tenant_reference_unique ON industrial_requirements(tenant_id, reference_code)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_requirements_tenant_status_idx ON industrial_requirements(tenant_id, status, requirement_type)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_requirements_factory_idx ON industrial_requirements(factory_id, status)`,
    );
    await db.execute(sql`
      ALTER TABLE industrial_requirements
        ALTER COLUMN requester_email DROP NOT NULL,
        ADD COLUMN IF NOT EXISTS machine_id uuid,
        ADD COLUMN IF NOT EXISTS assembly_id uuid,
        ADD COLUMN IF NOT EXISTS component_id uuid,
        ADD COLUMN IF NOT EXISTS commercial_intent text,
        ADD COLUMN IF NOT EXISTS commercial_action_mode text,
        ADD COLUMN IF NOT EXISTS intent_confidence numeric(4,3),
        ADD COLUMN IF NOT EXISTS assigned_commercial_agent_id integer,
        ADD COLUMN IF NOT EXISTS customer_contact_id integer REFERENCES contacts(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS source_conversation_id text,
        ADD COLUMN IF NOT EXISTS next_action text,
        ADD COLUMN IF NOT EXISTS next_action_at timestamp
    `);
    await db.execute(sql`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'industrial_requirements_machine_id_fkey') THEN
          ALTER TABLE industrial_requirements ADD CONSTRAINT industrial_requirements_machine_id_fkey FOREIGN KEY (machine_id) REFERENCES industrial_machines(id) ON DELETE SET NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'industrial_requirements_assembly_id_fkey') THEN
          ALTER TABLE industrial_requirements ADD CONSTRAINT industrial_requirements_assembly_id_fkey FOREIGN KEY (assembly_id) REFERENCES industrial_machine_assemblies(id) ON DELETE SET NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'industrial_requirements_component_id_fkey') THEN
          ALTER TABLE industrial_requirements ADD CONSTRAINT industrial_requirements_component_id_fkey FOREIGN KEY (component_id) REFERENCES industrial_machine_components(id) ON DELETE SET NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'industrial_requirements_assigned_commercial_agent_id_fkey') THEN
          ALTER TABLE industrial_requirements ADD CONSTRAINT industrial_requirements_assigned_commercial_agent_id_fkey FOREIGN KEY (assigned_commercial_agent_id) REFERENCES agents(id) ON DELETE SET NULL;
        END IF;
      END $$
    `);
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_requirements_technical_context_idx ON industrial_requirements(factory_id, machine_id, assembly_id, component_id)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_requirements_commercial_queue_idx ON industrial_requirements(tenant_id, commercial_intent, status, next_action_at)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_requirements_customer_contact_idx ON industrial_requirements(tenant_id, customer_contact_id, status)`,
    );

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS industrial_product_requirements (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        requirement_id uuid NOT NULL REFERENCES industrial_requirements(id) ON DELETE CASCADE,
        source_message_id integer,
        intent text NOT NULL,
        intent_confidence numeric(4,3),
        suggested_action text NOT NULL DEFAULT 'ASK',
        product_name text,
        product_category text,
        specification text,
        quantity numeric(20,6),
        quantity_text text,
        unit text,
        origin text,
        destination text,
        target_price text,
        currency text,
        deadline_text text,
        frequency text,
        incoterm text,
        customer_type text,
        missing_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      ALTER TABLE industrial_product_requirements
        ADD COLUMN IF NOT EXISTS source_message_id integer,
        ADD COLUMN IF NOT EXISTS quantity numeric(20,6)
    `);
    await db.execute(sql`
      DO $$
      BEGIN
        IF to_regclass('public.chat_messages') IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'industrial_product_requirements_source_message_id_fkey'
        ) THEN
          ALTER TABLE industrial_product_requirements
            ADD CONSTRAINT industrial_product_requirements_source_message_id_fkey
            FOREIGN KEY (source_message_id) REFERENCES chat_messages(id) ON DELETE SET NULL;
        END IF;
      END $$
    `);
    await db.execute(
      sql`CREATE UNIQUE INDEX IF NOT EXISTS industrial_product_requirements_requirement_unique ON industrial_product_requirements(requirement_id)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_product_requirements_tenant_intent_idx ON industrial_product_requirements(tenant_id, intent, created_at)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_product_requirements_tenant_product_idx ON industrial_product_requirements(tenant_id, product_category, product_name)`,
    );
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS industrial_agent_staffing_requests (
        id serial PRIMARY KEY,
        tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        company_id integer REFERENCES companies(id) ON DELETE CASCADE,
        requirement_id uuid REFERENCES industrial_requirements(id) ON DELETE SET NULL,
        role_template_id integer REFERENCES ece_agent_templates(id) ON DELETE SET NULL,
        role_code text NOT NULL,
        role_title text NOT NULL,
        department_key text NOT NULL,
        reason text NOT NULL,
        evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
        priority text NOT NULL DEFAULT 'medium',
        status text NOT NULL DEFAULT 'proposed',
        proposed_by_agent_id integer REFERENCES agents(id) ON DELETE SET NULL,
        reviewed_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        review_note text,
        provisioned_agent_id integer REFERENCES agents(id) ON DELETE SET NULL,
        demand_count integer NOT NULL DEFAULT 1,
        demand_threshold integer NOT NULL DEFAULT 1,
        signal_type text NOT NULL DEFAULT 'critical_capability_gap',
        evidence_items jsonb NOT NULL DEFAULT '[]'::jsonb,
        company_brain_context_pack_id integer REFERENCES company_brain_context_packs(id) ON DELETE SET NULL,
        governance_status text NOT NULL DEFAULT 'pending',
        governance_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
        last_signal_at timestamp,
        activated_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        activated_at timestamp,
        paused_at timestamp,
        reviewed_at timestamp,
        provisioned_at timestamp,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      ALTER TABLE industrial_agent_staffing_requests
        ADD COLUMN IF NOT EXISTS demand_count integer NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS demand_threshold integer NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS signal_type text NOT NULL DEFAULT 'critical_capability_gap',
        ADD COLUMN IF NOT EXISTS evidence_items jsonb NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS company_brain_context_pack_id integer REFERENCES company_brain_context_packs(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS governance_status text NOT NULL DEFAULT 'pending',
        ADD COLUMN IF NOT EXISTS governance_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS last_signal_at timestamp,
        ADD COLUMN IF NOT EXISTS activated_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS activated_at timestamp,
        ADD COLUMN IF NOT EXISTS paused_at timestamp
    `);
    await db.execute(sql`
      UPDATE industrial_agent_staffing_requests
      SET evidence_items = jsonb_build_array(evidence),
          last_signal_at = coalesce(last_signal_at, updated_at)
      WHERE jsonb_array_length(coalesce(evidence_items, '[]'::jsonb)) = 0
        AND evidence <> '{}'::jsonb
    `);
    await db.execute(
      sql`DROP INDEX IF EXISTS industrial_agent_staffing_requests_open_role_unique`,
    );
    await db.execute(
      sql`CREATE UNIQUE INDEX IF NOT EXISTS industrial_agent_staffing_requests_open_role_unique ON industrial_agent_staffing_requests(tenant_id, role_code) WHERE status IN ('monitoring', 'proposed', 'approved', 'provisioned', 'active', 'paused')`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_agent_staffing_requests_tenant_status_idx ON industrial_agent_staffing_requests(tenant_id, status, priority, created_at)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_agent_staffing_requests_requirement_idx ON industrial_agent_staffing_requests(requirement_id, created_at)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_agent_staffing_requests_governance_idx ON industrial_agent_staffing_requests(tenant_id, governance_status, updated_at)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_product_requirements_tenant_source_message_idx ON industrial_product_requirements(tenant_id, source_message_id)`,
    );

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS industrial_requirement_matches (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        requirement_id uuid NOT NULL REFERENCES industrial_requirements(id) ON DELETE CASCADE,
        factory_id uuid NOT NULL REFERENCES industrial_factories(id) ON DELETE CASCADE,
        catalog_item_id uuid NOT NULL REFERENCES industrial_catalog_items(id) ON DELETE CASCADE,
        status industrial_requirement_match_status NOT NULL DEFAULT 'candidate',
        match_score integer,
        match_reason text,
        internal_notes text,
        created_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        selected_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        selected_at timestamp,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now(),
        CONSTRAINT industrial_requirement_matches_requirement_catalog_unique UNIQUE (requirement_id, catalog_item_id)
      )
    `);
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_requirement_matches_tenant_requirement_idx ON industrial_requirement_matches(tenant_id, requirement_id, status)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_requirement_matches_tenant_factory_idx ON industrial_requirement_matches(tenant_id, factory_id, status)`,
    );

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS industrial_supplier_profiles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        linked_factory_id uuid REFERENCES industrial_factories(id) ON DELETE SET NULL,
        owner_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        legal_name text NOT NULL,
        display_name text NOT NULL,
        normalized_name text NOT NULL,
        supplier_status industrial_supplier_status NOT NULL DEFAULT 'draft',
        verification_status industrial_verification_status NOT NULL DEFAULT 'unverified',
        visibility industrial_visibility NOT NULL DEFAULT 'exportunity_internal',
        country_code text NOT NULL,
        region text,
        city text,
        industrial_zone text,
        address text,
        website text,
        email text,
        phone text,
        industries_served jsonb NOT NULL DEFAULT '[]'::jsonb,
        category_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
        capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
        equipment_available jsonb NOT NULL DEFAULT '[]'::jsonb,
        materials_handled jsonb NOT NULL DEFAULT '[]'::jsonb,
        maximum_dimensions text,
        tolerances text,
        production_capacity_text text,
        certifications jsonb NOT NULL DEFAULT '[]'::jsonb,
        quality_control_capability text,
        lead_time_text text,
        previous_performance_notes text,
        on_time_delivery_rate numeric(5,2),
        technical_document_references jsonb NOT NULL DEFAULT '[]'::jsonb,
        media_references jsonb NOT NULL DEFAULT '[]'::jsonb,
        nda_status industrial_supplier_nda_status NOT NULL DEFAULT 'not_assessed',
        admin_notes text,
        verified_at timestamp,
        archived_at timestamp,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now(),
        CONSTRAINT industrial_supplier_profiles_tenant_name_unique UNIQUE (tenant_id, normalized_name)
      )
    `);
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_supplier_profiles_tenant_review_idx ON industrial_supplier_profiles(tenant_id, supplier_status, verification_status)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_supplier_profiles_tenant_location_idx ON industrial_supplier_profiles(tenant_id, country_code, city, industrial_zone)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_supplier_profiles_linked_factory_idx ON industrial_supplier_profiles(linked_factory_id)`,
    );

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS industrial_requirement_supplier_matches (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        requirement_id uuid NOT NULL REFERENCES industrial_requirements(id) ON DELETE CASCADE,
        supplier_profile_id uuid NOT NULL REFERENCES industrial_supplier_profiles(id) ON DELETE CASCADE,
        status industrial_requirement_match_status NOT NULL DEFAULT 'candidate',
        match_score integer,
        match_reason text,
        internal_notes text,
        created_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        selected_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        selected_at timestamp,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now(),
        CONSTRAINT industrial_requirement_supplier_matches_requirement_supplier_unique UNIQUE (requirement_id, supplier_profile_id)
      )
    `);
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_requirement_supplier_matches_tenant_requirement_idx ON industrial_requirement_supplier_matches(tenant_id, requirement_id, status)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_requirement_supplier_matches_tenant_supplier_idx ON industrial_requirement_supplier_matches(tenant_id, supplier_profile_id, status)`,
    );
    await db.execute(sql`
      ALTER TABLE industrial_requirement_supplier_matches
        ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'internal_supplier_network',
        ADD COLUMN IF NOT EXISTS discovery_url text,
        ADD COLUMN IF NOT EXISTS discovery_agent_id integer,
        ADD COLUMN IF NOT EXISTS verification_score integer,
        ADD COLUMN IF NOT EXISTS relevance_score integer,
        ADD COLUMN IF NOT EXISTS contactability_score integer,
        ADD COLUMN IF NOT EXISTS last_verified_at timestamp
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS industrial_requirement_discovery_candidates (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        requirement_id uuid NOT NULL REFERENCES industrial_requirements(id) ON DELETE CASCADE,
        factory_lead_id uuid NOT NULL REFERENCES industrial_factory_leads(id) ON DELETE CASCADE,
        candidate_key text NOT NULL,
        status industrial_discovery_candidate_status NOT NULL DEFAULT 'discovered',
        relevance_score integer NOT NULL DEFAULT 0,
        relevance_rationale text NOT NULL,
        contact_status text NOT NULL DEFAULT 'not_contacted',
        outreach_allowed boolean NOT NULL DEFAULT false,
        human_approval_required boolean NOT NULL DEFAULT true,
        created_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        reviewed_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        reviewed_at timestamp,
        review_notes text,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now(),
        CONSTRAINT industrial_requirement_discovery_candidates_requirement_candidate_unique UNIQUE (requirement_id, candidate_key),
        CONSTRAINT industrial_requirement_discovery_candidates_relevance_check CHECK (relevance_score BETWEEN 0 AND 100),
        CONSTRAINT industrial_requirement_discovery_candidates_no_contact_check CHECK (contact_status = 'not_contacted' AND outreach_allowed = false),
        CONSTRAINT industrial_requirement_discovery_candidates_human_review_check CHECK (human_approval_required = true)
      )
    `);
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_requirement_discovery_candidates_tenant_queue_idx ON industrial_requirement_discovery_candidates(tenant_id, status, updated_at)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_requirement_discovery_candidates_tenant_requirement_idx ON industrial_requirement_discovery_candidates(tenant_id, requirement_id, status)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_requirement_discovery_candidates_factory_lead_idx ON industrial_requirement_discovery_candidates(factory_lead_id, status)`,
    );

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS industrial_discovery_evidence (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        discovery_candidate_id uuid NOT NULL REFERENCES industrial_requirement_discovery_candidates(id) ON DELETE CASCADE,
        source_type text NOT NULL,
        source_name text NOT NULL,
        source_url text NOT NULL,
        retrieved_at timestamp NOT NULL,
        content_hash text NOT NULL,
        evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        created_at timestamp NOT NULL DEFAULT now(),
        CONSTRAINT industrial_discovery_evidence_candidate_source_hash_unique UNIQUE (discovery_candidate_id, source_url, content_hash),
        CONSTRAINT industrial_discovery_evidence_content_hash_check CHECK (content_hash ~ '^[0-9a-f]{64}$'),
        CONSTRAINT industrial_discovery_evidence_source_type_check CHECK (source_type IN ('official_website', 'government_registry', 'trade_directory', 'marketplace', 'search_result', 'manual_research'))
      )
    `);
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_discovery_evidence_tenant_candidate_idx ON industrial_discovery_evidence(tenant_id, discovery_candidate_id, created_at)`,
    );

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS industrial_supplier_promotions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        discovery_candidate_id uuid NOT NULL REFERENCES industrial_requirement_discovery_candidates(id) ON DELETE CASCADE,
        requirement_id uuid NOT NULL REFERENCES industrial_requirements(id) ON DELETE CASCADE,
        supplier_profile_id uuid NOT NULL REFERENCES industrial_supplier_profiles(id) ON DELETE RESTRICT,
        verification_scope text NOT NULL,
        evidence_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
        official_evidence_id uuid NOT NULL REFERENCES industrial_discovery_evidence(id) ON DELETE RESTRICT,
        contact_evidence_id uuid NOT NULL REFERENCES industrial_discovery_evidence(id) ON DELETE RESTRICT,
        legal_name text NOT NULL,
        country_code text NOT NULL,
        contact_type text NOT NULL,
        contact_value text NOT NULL,
        checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
        decision_notes text NOT NULL,
        approved_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        approved_at timestamp NOT NULL,
        outreach_allowed boolean NOT NULL DEFAULT false,
        created_at timestamp NOT NULL DEFAULT now(),
        CONSTRAINT industrial_supplier_promotions_candidate_unique UNIQUE (discovery_candidate_id),
        CONSTRAINT industrial_supplier_promotions_scope_check CHECK (verification_scope = 'business_identity_and_requirement_product_relevance'),
        CONSTRAINT industrial_supplier_promotions_evidence_check CHECK (jsonb_typeof(evidence_ids) = 'array' AND jsonb_array_length(evidence_ids) BETWEEN 2 AND 10 AND official_evidence_id <> contact_evidence_id),
        CONSTRAINT industrial_supplier_promotions_country_check CHECK (country_code ~ '^[A-Z]{2}$'),
        CONSTRAINT industrial_supplier_promotions_contact_type_check CHECK (contact_type IN ('email', 'phone', 'website')),
        CONSTRAINT industrial_supplier_promotions_attestation_check CHECK (checklist @> '{"legalIdentityConfirmed":true,"countryOfRegistrationConfirmed":true,"requirementProductRelevanceConfirmed":true,"publicBusinessContactConfirmed":true,"evidenceReviewedByHuman":true,"noOutreachAuthorized":true}'::jsonb),
        CONSTRAINT industrial_supplier_promotions_notes_check CHECK (char_length(btrim(decision_notes)) BETWEEN 24 AND 2000),
        CONSTRAINT industrial_supplier_promotions_no_outreach_check CHECK (outreach_allowed = false)
      )
    `);
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_supplier_promotions_tenant_supplier_idx ON industrial_supplier_promotions(tenant_id, supplier_profile_id, approved_at)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_supplier_promotions_tenant_requirement_idx ON industrial_supplier_promotions(tenant_id, requirement_id, approved_at)`,
    );

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS industrial_supplier_rfq_drafts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        promotion_id uuid NOT NULL REFERENCES industrial_supplier_promotions(id) ON DELETE RESTRICT,
        requirement_id uuid NOT NULL REFERENCES industrial_requirements(id) ON DELETE RESTRICT,
        supplier_profile_id uuid NOT NULL REFERENCES industrial_supplier_profiles(id) ON DELETE RESTRICT,
        requirement_supplier_match_id uuid NOT NULL REFERENCES industrial_requirement_supplier_matches(id) ON DELETE RESTRICT,
        reference_code text NOT NULL,
        revision integer NOT NULL DEFAULT 1,
        status industrial_supplier_rfq_status NOT NULL DEFAULT 'draft',
        subject text NOT NULL,
        message_body text NOT NULL,
        requested_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
        requirement_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
        supplier_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
        buyer_instructions text,
        response_deadline timestamp NOT NULL,
        content_hash text NOT NULL,
        created_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        submitted_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        submitted_at timestamp,
        delivery_status text NOT NULL DEFAULT 'not_sent',
        delivery_channel text,
        delivered_at timestamp,
        external_message_id text,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now(),
        CONSTRAINT industrial_supplier_rfq_drafts_tenant_reference_unique UNIQUE (tenant_id, reference_code),
        CONSTRAINT industrial_supplier_rfq_drafts_promotion_revision_unique UNIQUE (promotion_id, revision),
        CONSTRAINT industrial_supplier_rfq_drafts_promotion_content_unique UNIQUE (promotion_id, content_hash),
        CONSTRAINT industrial_supplier_rfq_drafts_reference_check CHECK (char_length(btrim(reference_code)) BETWEEN 8 AND 80),
        CONSTRAINT industrial_supplier_rfq_drafts_revision_check CHECK (revision BETWEEN 1 AND 1000),
        CONSTRAINT industrial_supplier_rfq_drafts_subject_check CHECK (char_length(btrim(subject)) BETWEEN 8 AND 240),
        CONSTRAINT industrial_supplier_rfq_drafts_message_check CHECK (char_length(btrim(message_body)) BETWEEN 120 AND 12000),
        CONSTRAINT industrial_supplier_rfq_drafts_requested_fields_check CHECK (jsonb_typeof(requested_fields) = 'array' AND jsonb_array_length(requested_fields) BETWEEN 6 AND 20),
        CONSTRAINT industrial_supplier_rfq_drafts_snapshots_check CHECK (jsonb_typeof(requirement_snapshot) = 'object' AND jsonb_typeof(supplier_snapshot) = 'object'),
        CONSTRAINT industrial_supplier_rfq_drafts_content_hash_check CHECK (content_hash ~ '^[0-9a-f]{64}$'),
        CONSTRAINT industrial_supplier_rfq_drafts_response_deadline_check CHECK (response_deadline > created_at),
        CONSTRAINT industrial_supplier_rfq_drafts_submission_state_check CHECK ((status = 'draft' AND submitted_at IS NULL AND submitted_by_user_id IS NULL) OR (status IN ('approval_pending', 'approved_for_outreach', 'rejected', 'cancelled') AND submitted_at IS NOT NULL)),
        CONSTRAINT industrial_supplier_rfq_drafts_no_delivery_check CHECK (delivery_status = 'not_sent' AND delivery_channel IS NULL AND delivered_at IS NULL AND external_message_id IS NULL)
      )
    `);
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_supplier_rfq_drafts_tenant_status_idx ON industrial_supplier_rfq_drafts(tenant_id, status, updated_at)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_supplier_rfq_drafts_tenant_requirement_idx ON industrial_supplier_rfq_drafts(tenant_id, requirement_id, status)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_supplier_rfq_drafts_tenant_supplier_idx ON industrial_supplier_rfq_drafts(tenant_id, supplier_profile_id, status)`,
    );

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS industrial_supplier_rfq_decisions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        rfq_draft_id uuid NOT NULL REFERENCES industrial_supplier_rfq_drafts(id) ON DELETE RESTRICT,
        decision industrial_supplier_rfq_decision NOT NULL,
        content_hash text NOT NULL,
        checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
        decision_notes text NOT NULL,
        decided_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        decided_at timestamp NOT NULL,
        authorization_expires_at timestamp,
        outreach_authorized boolean NOT NULL DEFAULT false,
        dispatch_created boolean NOT NULL DEFAULT false,
        created_at timestamp NOT NULL DEFAULT now(),
        CONSTRAINT industrial_supplier_rfq_decisions_draft_unique UNIQUE (rfq_draft_id),
        CONSTRAINT industrial_supplier_rfq_decisions_content_hash_check CHECK (content_hash ~ '^[0-9a-f]{64}$'),
        CONSTRAINT industrial_supplier_rfq_decisions_notes_check CHECK (char_length(btrim(decision_notes)) BETWEEN 24 AND 2000),
        CONSTRAINT industrial_supplier_rfq_decisions_dispatch_check CHECK (dispatch_created = false),
        CONSTRAINT industrial_supplier_rfq_decisions_state_check CHECK ((decision = 'approved' AND outreach_authorized = true AND authorization_expires_at > decided_at AND checklist @> '{"contentReviewed":true,"recipientMatchesVerifiedContact":true,"requirementStillCurrent":true,"noUnsupportedCommercialClaims":true,"buyerDataApprovedForDisclosure":true,"separateDispatchRequired":true}'::jsonb) OR (decision = 'rejected' AND outreach_authorized = false AND authorization_expires_at IS NULL))
      )
    `);
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_supplier_rfq_decisions_tenant_decision_idx ON industrial_supplier_rfq_decisions(tenant_id, decision, decided_at)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_supplier_rfq_decisions_tenant_expiry_idx ON industrial_supplier_rfq_decisions(tenant_id, authorization_expires_at)`,
    );

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS industrial_supplier_contact_controls (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        supplier_profile_id uuid NOT NULL REFERENCES industrial_supplier_profiles(id) ON DELETE RESTRICT,
        source_promotion_id uuid REFERENCES industrial_supplier_promotions(id) ON DELETE RESTRICT,
        channel industrial_supplier_contact_channel NOT NULL,
        contact_hash text NOT NULL,
        contact_masked text NOT NULL,
        state industrial_supplier_contact_control_state NOT NULL,
        authorization_basis industrial_supplier_contact_authorization_basis,
        evidence_reference text,
        notes text NOT NULL,
        authorized_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        authorized_at timestamp,
        authorization_expires_at timestamp,
        suppressed_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        suppressed_at timestamp,
        suppression_reason text,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now(),
        CONSTRAINT industrial_supplier_contact_controls_tenant_contact_unique UNIQUE (tenant_id, supplier_profile_id, channel, contact_hash),
        CONSTRAINT industrial_supplier_contact_controls_hash_check CHECK (contact_hash ~ '^[0-9a-f]{64}$'),
        CONSTRAINT industrial_supplier_contact_controls_mask_check CHECK (char_length(btrim(contact_masked)) BETWEEN 5 AND 340),
        CONSTRAINT industrial_supplier_contact_controls_notes_check CHECK (char_length(btrim(notes)) BETWEEN 24 AND 1000),
        CONSTRAINT industrial_supplier_contact_controls_state_check CHECK ((state = 'authorized' AND source_promotion_id IS NOT NULL AND authorization_basis IS NOT NULL AND evidence_reference IS NOT NULL AND char_length(btrim(evidence_reference)) BETWEEN 8 AND 500 AND authorized_at IS NOT NULL AND authorization_expires_at > authorized_at AND suppressed_at IS NULL AND suppressed_by_user_id IS NULL AND suppression_reason IS NULL) OR (state = 'suppressed' AND authorization_basis IS NULL AND evidence_reference IS NULL AND authorized_at IS NULL AND authorized_by_user_id IS NULL AND authorization_expires_at IS NULL AND suppressed_at IS NOT NULL AND suppression_reason IS NOT NULL AND char_length(btrim(suppression_reason)) BETWEEN 12 AND 1000))
      )
    `);
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_supplier_contact_controls_tenant_state_idx ON industrial_supplier_contact_controls(tenant_id, state, updated_at)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_supplier_contact_controls_tenant_expiry_idx ON industrial_supplier_contact_controls(tenant_id, authorization_expires_at)`,
    );
    await db.execute(
      sql`ALTER TABLE industrial_supplier_rfq_decisions DROP CONSTRAINT IF EXISTS industrial_supplier_rfq_decisions_dispatch_check`,
    );
    await db.execute(sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'industrial_supplier_rfq_decisions_dispatch_state_check'
            AND conrelid = 'industrial_supplier_rfq_decisions'::regclass
        ) THEN
          ALTER TABLE industrial_supplier_rfq_decisions
            ADD CONSTRAINT industrial_supplier_rfq_decisions_dispatch_state_check
            CHECK (decision = 'approved' OR dispatch_created = false);
        END IF;
      END $$
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS industrial_supplier_rfq_dispatches (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        rfq_draft_id uuid NOT NULL REFERENCES industrial_supplier_rfq_drafts(id) ON DELETE RESTRICT,
        decision_id uuid NOT NULL REFERENCES industrial_supplier_rfq_decisions(id) ON DELETE RESTRICT,
        contact_control_id uuid NOT NULL REFERENCES industrial_supplier_contact_controls(id) ON DELETE RESTRICT,
        contact_authorization_basis industrial_supplier_contact_authorization_basis NOT NULL,
        contact_evidence_reference text NOT NULL,
        contact_authorized_at timestamp NOT NULL,
        contact_authorization_expires_at timestamp NOT NULL,
        supplier_profile_id uuid NOT NULL REFERENCES industrial_supplier_profiles(id) ON DELETE RESTRICT,
        channel industrial_supplier_contact_channel NOT NULL,
        content_hash text NOT NULL,
        recipient_hash text NOT NULL,
        recipient_masked text NOT NULL,
        sender_agent_key text NOT NULL,
        idempotency_key text NOT NULL,
        checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
        dispatch_notes text NOT NULL,
        status industrial_supplier_rfq_dispatch_status NOT NULL DEFAULT 'reserved',
        attempt_count integer NOT NULL DEFAULT 0,
        reserved_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        reserved_at timestamp NOT NULL,
        attempted_at timestamp,
        completed_at timestamp,
        provider_message_id text,
        provider_status text,
        provider_response jsonb NOT NULL DEFAULT '{}'::jsonb,
        error_code text,
        error_message text,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now(),
        CONSTRAINT industrial_supplier_rfq_dispatches_draft_unique UNIQUE (rfq_draft_id),
        CONSTRAINT industrial_supplier_rfq_dispatches_decision_unique UNIQUE (decision_id),
        CONSTRAINT industrial_supplier_rfq_dispatches_tenant_idempotency_unique UNIQUE (tenant_id, idempotency_key),
        CONSTRAINT industrial_supplier_rfq_dispatches_content_hash_check CHECK (content_hash ~ '^[0-9a-f]{64}$'),
        CONSTRAINT industrial_supplier_rfq_dispatches_recipient_hash_check CHECK (recipient_hash ~ '^[0-9a-f]{64}$'),
        CONSTRAINT industrial_supplier_rfq_dispatches_idempotency_check CHECK (idempotency_key ~ '^[0-9a-f]{64}$'),
        CONSTRAINT industrial_supplier_rfq_dispatches_sender_check CHECK (char_length(btrim(sender_agent_key)) BETWEEN 2 AND 80),
        CONSTRAINT industrial_supplier_rfq_dispatches_notes_check CHECK (char_length(btrim(dispatch_notes)) BETWEEN 24 AND 1000),
        CONSTRAINT industrial_supplier_rfq_dispatches_authorization_evidence_check CHECK (char_length(btrim(contact_evidence_reference)) BETWEEN 8 AND 500),
        CONSTRAINT industrial_supplier_rfq_dispatches_provider_response_check CHECK (jsonb_typeof(provider_response) = 'object'),
        CONSTRAINT industrial_supplier_rfq_dispatches_checklist_check CHECK (checklist @> '{"exactApprovedContent":true,"recipientMatchesVerifiedPromotion":true,"contactAuthorizationCurrent":true,"suppressionRegistryChecked":true,"singleRecipientOnly":true,"noAutomaticRetry":true}'::jsonb),
        CONSTRAINT industrial_supplier_rfq_dispatches_attempt_check CHECK (attempt_count BETWEEN 0 AND 1),
        CONSTRAINT industrial_supplier_rfq_dispatches_state_check CHECK ((status = 'reserved' AND attempt_count = 0 AND attempted_at IS NULL AND completed_at IS NULL AND provider_message_id IS NULL AND provider_status IS NULL AND error_code IS NULL AND error_message IS NULL) OR (status = 'sending' AND attempt_count = 1 AND attempted_at IS NOT NULL AND completed_at IS NULL AND provider_message_id IS NULL AND error_code IS NULL AND error_message IS NULL) OR (status = 'accepted' AND attempt_count = 1 AND attempted_at IS NOT NULL AND completed_at IS NOT NULL AND provider_message_id IS NOT NULL AND provider_status IS NOT NULL AND error_code IS NULL AND error_message IS NULL) OR (status IN ('failed', 'unknown') AND attempt_count = 1 AND attempted_at IS NOT NULL AND completed_at IS NOT NULL AND error_message IS NOT NULL AND char_length(btrim(error_message)) BETWEEN 1 AND 2000)),
        CONSTRAINT industrial_supplier_rfq_dispatches_time_check CHECK (contact_authorized_at <= reserved_at AND contact_authorization_expires_at > reserved_at AND (attempted_at IS NULL OR attempted_at >= reserved_at) AND (attempted_at IS NULL OR contact_authorization_expires_at > attempted_at) AND (completed_at IS NULL OR (attempted_at IS NOT NULL AND completed_at >= attempted_at)))
      )
    `);
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_supplier_rfq_dispatches_tenant_status_idx ON industrial_supplier_rfq_dispatches(tenant_id, status, updated_at)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_supplier_rfq_dispatches_tenant_supplier_idx ON industrial_supplier_rfq_dispatches(tenant_id, supplier_profile_id, created_at)`,
    );

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS industrial_supplier_contact_suppressions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        channel text NOT NULL,
        contact_hash text NOT NULL,
        contact_masked text NOT NULL,
        reason text NOT NULL,
        source_kind text NOT NULL DEFAULT 'recipient_opt_out',
        source_email_message_id integer REFERENCES email_messages(id) ON DELETE RESTRICT,
        source_communications_message_id integer REFERENCES communications_messages(id) ON DELETE RESTRICT,
        created_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT industrial_supplier_contact_suppressions_channel_check CHECK (channel IN ('email', 'whatsapp')),
        CONSTRAINT industrial_supplier_contact_suppressions_hash_check CHECK (contact_hash ~ '^[0-9a-f]{64}$'),
        CONSTRAINT industrial_supplier_contact_suppressions_mask_check CHECK (char_length(btrim(contact_masked)) BETWEEN 5 AND 340),
        CONSTRAINT industrial_supplier_contact_suppressions_reason_check CHECK (char_length(btrim(reason)) BETWEEN 12 AND 1000),
        CONSTRAINT industrial_supplier_contact_suppressions_source_kind_check CHECK (source_kind = 'recipient_opt_out'),
        CONSTRAINT industrial_supplier_contact_suppressions_source_check CHECK ((channel = 'email' AND source_email_message_id IS NOT NULL AND source_communications_message_id IS NULL) OR (channel = 'whatsapp' AND source_email_message_id IS NULL AND source_communications_message_id IS NOT NULL)),
        CONSTRAINT industrial_supplier_contact_suppressions_tenant_contact_unique UNIQUE (tenant_id, channel, contact_hash)
      )
    `);
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_supplier_contact_suppressions_tenant_updated_idx ON industrial_supplier_contact_suppressions(tenant_id, updated_at DESC)`,
    );

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS industrial_supplier_quote_intakes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        rfq_dispatch_id uuid REFERENCES industrial_supplier_rfq_dispatches(id) ON DELETE RESTRICT,
        rfq_draft_id uuid REFERENCES industrial_supplier_rfq_drafts(id) ON DELETE RESTRICT,
        requirement_id uuid REFERENCES industrial_requirements(id) ON DELETE RESTRICT,
        supplier_profile_id uuid REFERENCES industrial_supplier_profiles(id) ON DELETE RESTRICT,
        contact_suppression_id uuid REFERENCES industrial_supplier_contact_suppressions(id) ON DELETE RESTRICT,
        channel text NOT NULL,
        source_email_message_id integer REFERENCES email_messages(id) ON DELETE RESTRICT,
        source_communications_message_id integer REFERENCES communications_messages(id) ON DELETE RESTRICT,
        source_provider_message_id text NOT NULL,
        source_agent_key text NOT NULL,
        source_contact_hash text NOT NULL,
        source_contact_masked text NOT NULL,
        source_received_at timestamptz NOT NULL,
        source_attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
        correlation_status industrial_supplier_quote_correlation_status NOT NULL,
        correlation_method text NOT NULL,
        candidate_dispatch_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
        normalization_version text NOT NULL,
        normalized_quote jsonb NOT NULL DEFAULT '{}'::jsonb,
        missing_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
        ambiguous_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
        quote_like_signals jsonb NOT NULL DEFAULT '[]'::jsonb,
        opt_out_detected boolean NOT NULL DEFAULT false,
        suppression_applied_at timestamptz,
        suppressed_control_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
        review_status industrial_supplier_quote_review_status NOT NULL DEFAULT 'needs_review',
        review_checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
        review_notes text,
        reviewed_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        reviewed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT industrial_supplier_quote_intakes_channel_check CHECK (channel IN ('email', 'whatsapp')),
        CONSTRAINT industrial_supplier_quote_intakes_source_check CHECK ((channel = 'email' AND source_email_message_id IS NOT NULL AND source_communications_message_id IS NULL) OR (channel = 'whatsapp' AND source_email_message_id IS NULL AND source_communications_message_id IS NOT NULL)),
        CONSTRAINT industrial_supplier_quote_intakes_provider_id_check CHECK (char_length(btrim(source_provider_message_id)) BETWEEN 2 AND 300),
        CONSTRAINT industrial_supplier_quote_intakes_agent_key_check CHECK (char_length(btrim(source_agent_key)) BETWEEN 2 AND 80),
        CONSTRAINT industrial_supplier_quote_intakes_contact_hash_check CHECK (source_contact_hash ~ '^[0-9a-f]{64}$'),
        CONSTRAINT industrial_supplier_quote_intakes_contact_mask_check CHECK (char_length(btrim(source_contact_masked)) BETWEEN 5 AND 340),
        CONSTRAINT industrial_supplier_quote_intakes_json_types_check CHECK (jsonb_typeof(source_attachments) = 'array' AND jsonb_typeof(candidate_dispatch_ids) = 'array' AND jsonb_typeof(normalized_quote) = 'object' AND jsonb_typeof(missing_fields) = 'array' AND jsonb_typeof(ambiguous_fields) = 'array' AND jsonb_typeof(quote_like_signals) = 'array' AND jsonb_typeof(suppressed_control_ids) = 'array' AND jsonb_typeof(review_checklist) = 'object'),
        CONSTRAINT industrial_supplier_quote_intakes_correlation_method_check CHECK (char_length(btrim(correlation_method)) BETWEEN 3 AND 80),
        CONSTRAINT industrial_supplier_quote_intakes_normalization_version_check CHECK (char_length(btrim(normalization_version)) BETWEEN 3 AND 80),
        CONSTRAINT industrial_supplier_quote_intakes_correlation_check CHECK ((correlation_status IN ('exact', 'inferred') AND rfq_dispatch_id IS NOT NULL AND rfq_draft_id IS NOT NULL AND requirement_id IS NOT NULL AND supplier_profile_id IS NOT NULL) OR (correlation_status IN ('ambiguous', 'unmatched') AND rfq_dispatch_id IS NULL AND rfq_draft_id IS NULL AND requirement_id IS NULL AND supplier_profile_id IS NULL)),
        CONSTRAINT industrial_supplier_quote_intakes_suppression_check CHECK ((opt_out_detected = true AND suppression_applied_at IS NOT NULL AND contact_suppression_id IS NOT NULL) OR (opt_out_detected = false AND suppression_applied_at IS NULL AND contact_suppression_id IS NULL)),
        CONSTRAINT industrial_supplier_quote_intakes_review_check CHECK ((review_status = 'needs_review' AND review_notes IS NULL AND reviewed_at IS NULL) OR (review_status IN ('qualified', 'rejected') AND review_notes IS NOT NULL AND char_length(btrim(review_notes)) BETWEEN 24 AND 2000 AND reviewed_at IS NOT NULL)),
        CONSTRAINT industrial_supplier_quote_intakes_qualified_checklist_check CHECK (review_status <> 'qualified' OR review_checklist @> '{"sourceMessageReviewed":true,"correlationReviewed":true,"noInventedFields":true,"missingFieldsAcknowledged":true}'::jsonb)
      )
    `);
    await db.execute(
      sql`CREATE UNIQUE INDEX IF NOT EXISTS industrial_supplier_quote_intakes_source_email_unique ON industrial_supplier_quote_intakes(source_email_message_id) WHERE source_email_message_id IS NOT NULL`,
    );
    await db.execute(
      sql`CREATE UNIQUE INDEX IF NOT EXISTS industrial_supplier_quote_intakes_source_communications_unique ON industrial_supplier_quote_intakes(source_communications_message_id) WHERE source_communications_message_id IS NOT NULL`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_supplier_quote_intakes_tenant_review_idx ON industrial_supplier_quote_intakes(tenant_id, review_status, updated_at DESC)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_supplier_quote_intakes_tenant_requirement_idx ON industrial_supplier_quote_intakes(tenant_id, requirement_id, review_status)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_supplier_quote_intakes_tenant_supplier_idx ON industrial_supplier_quote_intakes(tenant_id, supplier_profile_id, created_at DESC)`,
    );

    await db.execute(sql`
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
      )
    `);
    await db.execute(sql`
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
        ADD COLUMN IF NOT EXISTS qualified_at timestamptz
    `);
    await db.execute(sql`
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
    `);
    await db.execute(
      sql`CREATE UNIQUE INDEX IF NOT EXISTS industrial_supplier_quotes_intake_unique ON industrial_supplier_quotes(quote_intake_id)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_supplier_quotes_tenant_requirement_idx ON industrial_supplier_quotes(tenant_id, requirement_id, status, updated_at)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_supplier_quotes_tenant_supplier_idx ON industrial_supplier_quotes(tenant_id, supplier_profile_id, status)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_supplier_quotes_source_message_idx ON industrial_supplier_quotes(tenant_id, raw_source_message_id)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_supplier_quotes_tenant_readiness_idx ON industrial_supplier_quotes(tenant_id, comparison_ready, offer_preparation_ready, qualified_at DESC)`,
    );

    await db.execute(sql`
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
      )
    `);
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_legacy_product_reviews_tenant_status_idx ON industrial_legacy_product_reviews(tenant_id, review_status, updated_at)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_legacy_product_reviews_tenant_catalog_item_idx ON industrial_legacy_product_reviews(tenant_id, industrial_catalog_item_id)`,
    );

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS industrial_supplier_quotes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        requirement_id uuid NOT NULL REFERENCES industrial_requirements(id) ON DELETE CASCADE,
        supplier_profile_id uuid REFERENCES industrial_supplier_profiles(id) ON DELETE SET NULL,
        supplier_match_id uuid REFERENCES industrial_requirement_supplier_matches(id) ON DELETE SET NULL,
        reference_code text NOT NULL,
        product text NOT NULL,
        specification text,
        quantity_text text,
        unit text,
        unit_price numeric(16,4),
        total_cost numeric(16,2),
        currency_code text NOT NULL DEFAULT 'XOF',
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
        CONSTRAINT industrial_supplier_quotes_tenant_reference_unique UNIQUE (tenant_id, reference_code)
      )
    `);
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_supplier_quotes_tenant_requirement_idx ON industrial_supplier_quotes(tenant_id, requirement_id, status, updated_at)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_supplier_quotes_tenant_supplier_idx ON industrial_supplier_quotes(tenant_id, supplier_profile_id, status)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_supplier_quotes_source_message_idx ON industrial_supplier_quotes(tenant_id, raw_source_message_id)`,
    );

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS industrial_commercial_offers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        requirement_id uuid NOT NULL REFERENCES industrial_requirements(id) ON DELETE CASCADE,
        customer_contact_id integer REFERENCES contacts(id) ON DELETE SET NULL,
        reference_code text NOT NULL,
        version integer NOT NULL DEFAULT 1,
        supplier_quote_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
        cost_stack jsonb NOT NULL DEFAULT '{}'::jsonb,
        total_cost numeric(16,2) NOT NULL,
        internal_margin numeric(16,2) NOT NULL,
        margin_percent numeric(7,3) NOT NULL,
        customer_price numeric(16,2) NOT NULL,
        currency_code text NOT NULL DEFAULT 'XOF',
        incoterm text,
        delivery_estimate text,
        payment_terms text,
        offer_valid_until timestamp,
        terms text,
        status text NOT NULL DEFAULT 'draft',
        pricing_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        approved_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        approved_at timestamp,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now(),
        CONSTRAINT industrial_commercial_offers_tenant_reference_unique UNIQUE (tenant_id, reference_code),
        CONSTRAINT industrial_commercial_offers_requirement_version_unique UNIQUE (requirement_id, version)
      )
    `);
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_commercial_offers_tenant_requirement_idx ON industrial_commercial_offers(tenant_id, requirement_id, status, updated_at)`,
    );

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS industrial_quotes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        requirement_id uuid NOT NULL REFERENCES industrial_requirements(id) ON DELETE CASCADE,
        requirement_match_id uuid REFERENCES industrial_requirement_matches(id) ON DELETE SET NULL,
        factory_id uuid REFERENCES industrial_factories(id) ON DELETE SET NULL,
        catalog_item_id uuid REFERENCES industrial_catalog_items(id) ON DELETE SET NULL,
        reference_code text NOT NULL,
        status industrial_quote_status NOT NULL DEFAULT 'draft',
        currency_code text NOT NULL DEFAULT 'XOF',
        total_amount numeric(24,3),
        line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
        lead_time_text text,
        valid_until timestamp,
        commercial_terms text,
        customer_notes text,
        internal_notes text,
        source_supplier_quote_id uuid,
        pricing_version text,
        pricing_hash text,
        supplier_cost_minor numeric(30,0),
        additional_costs_minor numeric(30,0),
        total_cost_minor numeric(30,0),
        target_gross_margin_bps integer,
        margin_minor numeric(30,0),
        customer_price_minor numeric(30,0),
        cost_stack jsonb NOT NULL DEFAULT '[]'::jsonb,
        pricing_checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
        pricing_notes text,
        pricing_submitted_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        pricing_submitted_at timestamp,
        pricing_approved_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        pricing_approved_at timestamp,
        pricing_decision_notes text,
        visibility industrial_visibility NOT NULL DEFAULT 'parties_to_transaction',
        created_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        issued_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        issued_at timestamp,
        responded_at timestamp,
        customer_response_hash text,
        customer_response_channel text,
        customer_response_reference text,
        customer_response_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
        customer_response_recorded_by_user_id integer
          CONSTRAINT industrial_quotes_customer_response_recorded_by_fkey
          REFERENCES ece_users(id) ON DELETE SET NULL,
        closed_at timestamp,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now(),
        CONSTRAINT industrial_quotes_tenant_reference_unique UNIQUE (tenant_id, reference_code)
      )
    `);
    await db.execute(sql`
      ALTER TABLE industrial_quotes
        ALTER COLUMN total_amount TYPE numeric(24,3) USING total_amount::numeric(24,3),
        ADD COLUMN IF NOT EXISTS source_supplier_quote_id uuid,
        ADD COLUMN IF NOT EXISTS pricing_version text,
        ADD COLUMN IF NOT EXISTS pricing_hash text,
        ADD COLUMN IF NOT EXISTS supplier_cost_minor numeric(30,0),
        ADD COLUMN IF NOT EXISTS additional_costs_minor numeric(30,0),
        ADD COLUMN IF NOT EXISTS total_cost_minor numeric(30,0),
        ADD COLUMN IF NOT EXISTS target_gross_margin_bps integer,
        ADD COLUMN IF NOT EXISTS margin_minor numeric(30,0),
        ADD COLUMN IF NOT EXISTS customer_price_minor numeric(30,0),
        ADD COLUMN IF NOT EXISTS cost_stack jsonb NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS pricing_checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS pricing_notes text,
        ADD COLUMN IF NOT EXISTS pricing_submitted_by_user_id integer,
        ADD COLUMN IF NOT EXISTS pricing_submitted_at timestamp,
        ADD COLUMN IF NOT EXISTS pricing_approved_by_user_id integer,
        ADD COLUMN IF NOT EXISTS pricing_approved_at timestamp,
        ADD COLUMN IF NOT EXISTS pricing_decision_notes text,
        ADD COLUMN IF NOT EXISTS customer_response_hash text,
        ADD COLUMN IF NOT EXISTS customer_response_channel text,
        ADD COLUMN IF NOT EXISTS customer_response_reference text,
        ADD COLUMN IF NOT EXISTS customer_response_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS customer_response_recorded_by_user_id integer
    `);
    await db.execute(sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'industrial_quotes_source_supplier_quote_id_fkey'
            AND conrelid = 'industrial_quotes'::regclass
        ) THEN
          ALTER TABLE industrial_quotes
            ADD CONSTRAINT industrial_quotes_source_supplier_quote_id_fkey
            FOREIGN KEY (source_supplier_quote_id)
            REFERENCES industrial_supplier_quotes(id)
            ON DELETE RESTRICT;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'industrial_quotes_pricing_submitted_by_user_id_fkey'
            AND conrelid = 'industrial_quotes'::regclass
        ) THEN
          ALTER TABLE industrial_quotes
            ADD CONSTRAINT industrial_quotes_pricing_submitted_by_user_id_fkey
            FOREIGN KEY (pricing_submitted_by_user_id)
            REFERENCES ece_users(id)
            ON DELETE SET NULL;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'industrial_quotes_pricing_approved_by_user_id_fkey'
            AND conrelid = 'industrial_quotes'::regclass
        ) THEN
          ALTER TABLE industrial_quotes
            ADD CONSTRAINT industrial_quotes_pricing_approved_by_user_id_fkey
            FOREIGN KEY (pricing_approved_by_user_id)
            REFERENCES ece_users(id)
            ON DELETE SET NULL;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'industrial_quotes_customer_response_recorded_by_fkey'
            AND conrelid = 'industrial_quotes'::regclass
        ) THEN
          ALTER TABLE industrial_quotes
            ADD CONSTRAINT industrial_quotes_customer_response_recorded_by_fkey
            FOREIGN KEY (customer_response_recorded_by_user_id)
            REFERENCES ece_users(id)
            ON DELETE SET NULL;
        END IF;
      END $$;
    `);
    await db.execute(sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'industrial_quotes_exact_pricing_check'
            AND conrelid = 'industrial_quotes'::regclass
        ) THEN
          ALTER TABLE industrial_quotes
            ADD CONSTRAINT industrial_quotes_exact_pricing_check
            CHECK (
              pricing_version IS NULL
              OR (
                source_supplier_quote_id IS NOT NULL
                AND char_length(btrim(pricing_version)) BETWEEN 3 AND 80
                AND pricing_hash ~ '^[0-9a-f]{64}$'
                AND currency_code ~ '^[A-Z]{3}$'
                AND supplier_cost_minor IS NOT NULL
                AND supplier_cost_minor > 0
                AND additional_costs_minor IS NOT NULL
                AND additional_costs_minor >= 0
                AND total_cost_minor IS NOT NULL
                AND total_cost_minor = supplier_cost_minor + additional_costs_minor
                AND target_gross_margin_bps BETWEEN 0 AND 5000
                AND margin_minor IS NOT NULL
                AND margin_minor >= 0
                AND customer_price_minor IS NOT NULL
                AND customer_price_minor = total_cost_minor + margin_minor
                AND total_amount IS NOT NULL
                AND total_amount >= 0
                AND jsonb_typeof(cost_stack) = 'array'
                AND jsonb_array_length(cost_stack) >= 1
                AND jsonb_typeof(pricing_checklist) = 'object'
                AND jsonb_typeof(line_items) = 'array'
                AND (
                  status NOT IN ('draft', 'under_review', 'ready_for_account_manager')
                  OR visibility = 'exportunity_internal'
                )
              )
            );
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'industrial_quotes_pricing_review_state_check'
            AND conrelid = 'industrial_quotes'::regclass
        ) THEN
          ALTER TABLE industrial_quotes
            ADD CONSTRAINT industrial_quotes_pricing_review_state_check
            CHECK (
              pricing_version IS NULL
              OR (
                (
                  status <> 'under_review'
                  OR (
                    pricing_submitted_by_user_id IS NOT NULL
                    AND pricing_submitted_at IS NOT NULL
                    AND pricing_decision_notes IS NOT NULL
                    AND char_length(btrim(pricing_decision_notes)) BETWEEN 24 AND 2000
                  )
                )
                AND (
                  status NOT IN ('ready_for_account_manager', 'issued', 'accepted', 'declined', 'expired')
                  OR (
                    pricing_submitted_by_user_id IS NOT NULL
                    AND pricing_submitted_at IS NOT NULL
                    AND pricing_approved_by_user_id IS NOT NULL
                    AND pricing_approved_at IS NOT NULL
                    AND pricing_decision_notes IS NOT NULL
                    AND char_length(btrim(pricing_decision_notes)) BETWEEN 24 AND 2000
                  )
                )
              )
            );
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'industrial_quotes_exact_customer_response_check'
            AND conrelid = 'industrial_quotes'::regclass
        ) THEN
          ALTER TABLE industrial_quotes
            ADD CONSTRAINT industrial_quotes_exact_customer_response_check
            CHECK (
              pricing_version IS NULL
              OR status NOT IN ('accepted', 'declined')
              OR (
                customer_response_hash ~ '^[0-9a-f]{64}$'
                AND customer_response_channel IN ('email', 'whatsapp', 'phone', 'platform', 'signed_document', 'in_person', 'other')
                AND char_length(btrim(customer_response_reference)) BETWEEN 8 AND 500
                AND jsonb_typeof(customer_response_evidence) = 'object'
                AND customer_response_recorded_by_user_id IS NOT NULL
                AND responded_at IS NOT NULL
              )
            ) NOT VALID;
        END IF;
      END $$;
    `);
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_quotes_tenant_requirement_idx ON industrial_quotes(tenant_id, requirement_id, status)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_quotes_tenant_factory_idx ON industrial_quotes(tenant_id, factory_id, status)`,
    );
    await db.execute(sql`
      ALTER TABLE industrial_quotes
        ADD COLUMN IF NOT EXISTS commercial_offer_id uuid REFERENCES industrial_commercial_offers(id) ON DELETE SET NULL
    `);
    await db.execute(
      sql`CREATE UNIQUE INDEX IF NOT EXISTS industrial_quotes_commercial_offer_unique ON industrial_quotes(tenant_id, commercial_offer_id)`,
    );
    await db.execute(
      sql`CREATE UNIQUE INDEX IF NOT EXISTS industrial_quotes_tenant_pricing_hash_unique ON industrial_quotes(tenant_id, pricing_hash)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_quotes_tenant_source_supplier_quote_idx ON industrial_quotes(tenant_id, source_supplier_quote_id, status)`,
    );
    await db.execute(
      sql`CREATE UNIQUE INDEX IF NOT EXISTS industrial_quotes_tenant_customer_response_hash_unique ON industrial_quotes(tenant_id, customer_response_hash) WHERE customer_response_hash IS NOT NULL`,
    );

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS industrial_orders (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        quote_id uuid NOT NULL REFERENCES industrial_quotes(id),
        requirement_id uuid NOT NULL REFERENCES industrial_requirements(id),
        factory_id uuid REFERENCES industrial_factories(id) ON DELETE SET NULL,
        catalog_item_id uuid REFERENCES industrial_catalog_items(id) ON DELETE SET NULL,
        reference_code text NOT NULL,
        status industrial_order_status NOT NULL DEFAULT 'confirmed',
        currency_code text NOT NULL DEFAULT 'XOF',
        total_amount numeric(30,3),
        total_amount_minor numeric(30,0),
        source_pricing_hash text,
        customer_response_hash text,
        order_confirmation_hash text,
        order_confirmation_checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
        payment_status text NOT NULL DEFAULT 'unpaid',
        paid_amount numeric(16,2),
        paid_currency_code text,
        paid_at timestamp,
        last_payment_id uuid,
        line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
        commercial_terms text,
        delivery_notes text,
        internal_notes text,
        source_quote_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
        visibility industrial_visibility NOT NULL DEFAULT 'parties_to_transaction',
        confirmed_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        confirmed_at timestamp,
        planned_delivery_at timestamp,
        completed_at timestamp,
        cancelled_at timestamp,
        created_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        updated_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await db.execute(sql`
      ALTER TABLE industrial_orders
        ALTER COLUMN total_amount TYPE numeric(30,3) USING total_amount::numeric(30,3),
        ADD COLUMN IF NOT EXISTS total_amount_minor numeric(30,0),
        ADD COLUMN IF NOT EXISTS source_pricing_hash text,
        ADD COLUMN IF NOT EXISTS customer_response_hash text,
        ADD COLUMN IF NOT EXISTS order_confirmation_hash text,
        ADD COLUMN IF NOT EXISTS order_confirmation_checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid',
        ADD COLUMN IF NOT EXISTS paid_amount numeric(16,2),
        ADD COLUMN IF NOT EXISTS paid_currency_code text,
        ADD COLUMN IF NOT EXISTS paid_at timestamp,
        ADD COLUMN IF NOT EXISTS last_payment_id uuid
    `);
    await db.execute(sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'industrial_orders_exact_confirmation_check'
            AND conrelid = 'industrial_orders'::regclass
        ) THEN
          ALTER TABLE industrial_orders
            ADD CONSTRAINT industrial_orders_exact_confirmation_check
            CHECK (
              source_pricing_hash IS NULL
              OR (
                source_pricing_hash ~ '^[0-9a-f]{64}$'
                AND customer_response_hash ~ '^[0-9a-f]{64}$'
                AND order_confirmation_hash ~ '^[0-9a-f]{64}$'
                AND total_amount_minor IS NOT NULL
                AND total_amount_minor > 0
                AND total_amount IS NOT NULL
                AND total_amount > 0
                AND jsonb_typeof(order_confirmation_checklist) = 'object'
                AND confirmed_by_user_id IS NOT NULL
                AND confirmed_at IS NOT NULL
              )
            ) NOT VALID;
        END IF;
      END $$;
    `);
    await db.execute(
      sql`CREATE UNIQUE INDEX IF NOT EXISTS industrial_orders_tenant_reference_unique ON industrial_orders(tenant_id, reference_code)`,
    );
    await db.execute(
      sql`CREATE UNIQUE INDEX IF NOT EXISTS industrial_orders_tenant_quote_unique ON industrial_orders(tenant_id, quote_id)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_orders_tenant_status_idx ON industrial_orders(tenant_id, status, updated_at)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_orders_tenant_payment_status_idx ON industrial_orders(tenant_id, payment_status, updated_at)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_orders_factory_status_idx ON industrial_orders(factory_id, status, updated_at)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_orders_requirement_idx ON industrial_orders(requirement_id, status)`,
    );
    await db.execute(
      sql`CREATE UNIQUE INDEX IF NOT EXISTS industrial_orders_tenant_confirmation_hash_unique ON industrial_orders(tenant_id, order_confirmation_hash) WHERE order_confirmation_hash IS NOT NULL`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_orders_tenant_source_pricing_hash_idx ON industrial_orders(tenant_id, source_pricing_hash) WHERE source_pricing_hash IS NOT NULL`,
    );

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS industrial_fulfillment_plans (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        order_id uuid NOT NULL REFERENCES industrial_orders(id) ON DELETE CASCADE,
        kind industrial_fulfillment_kind NOT NULL DEFAULT 'standard_order',
        status industrial_fulfillment_status NOT NULL DEFAULT 'release_review',
        tracking_code text NOT NULL,
        procurement_task_id integer,
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
      )
    `);
    await db.execute(
      sql`CREATE UNIQUE INDEX IF NOT EXISTS industrial_fulfillment_plans_tenant_order_unique ON industrial_fulfillment_plans(tenant_id, order_id)`,
    );
    await db.execute(
      sql`CREATE UNIQUE INDEX IF NOT EXISTS industrial_fulfillment_plans_tenant_tracking_unique ON industrial_fulfillment_plans(tenant_id, tracking_code)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_fulfillment_plans_tenant_status_idx ON industrial_fulfillment_plans(tenant_id, status, updated_at)`,
    );

    await db.execute(sql`
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
        CONSTRAINT industrial_fulfillment_services_rating_check CHECK (performance_rating IS NULL OR performance_rating BETWEEN 1 AND 5),
        CONSTRAINT industrial_fulfillment_services_issue_count_check CHECK (issue_count >= 0),
        CONSTRAINT industrial_fulfillment_services_cost_check CHECK (quoted_cost IS NULL OR quoted_cost >= 0),
        CONSTRAINT industrial_fulfillment_services_currency_check CHECK (currency_code IS NULL OR currency_code ~ '^[A-Z]{3}$')
      )
    `);
    await db.execute(
      sql`CREATE UNIQUE INDEX IF NOT EXISTS industrial_fulfillment_services_plan_type_unique ON industrial_fulfillment_services(plan_id, service_type)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_fulfillment_services_tenant_status_idx ON industrial_fulfillment_services(tenant_id, status, updated_at)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_fulfillment_services_order_idx ON industrial_fulfillment_services(order_id, service_type)`,
    );

    await db.execute(sql`
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
      )
    `);
    await db.execute(
      sql`CREATE UNIQUE INDEX IF NOT EXISTS industrial_fulfillment_events_plan_sequence_unique ON industrial_fulfillment_events(plan_id, sequence)`,
    );
    await db.execute(
      sql`CREATE UNIQUE INDEX IF NOT EXISTS industrial_fulfillment_events_tenant_idempotency_unique ON industrial_fulfillment_events(tenant_id, idempotency_key)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_fulfillment_events_tenant_order_idx ON industrial_fulfillment_events(tenant_id, order_id, occurred_at)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_fulfillment_events_public_timeline_idx ON industrial_fulfillment_events(plan_id, customer_visible, sequence)`,
    );

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS industrial_factory_claims (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        factory_id uuid NOT NULL REFERENCES industrial_factories(id) ON DELETE CASCADE,
        claimant_user_id integer NOT NULL REFERENCES ece_users(id) ON DELETE CASCADE,
        relationship text NOT NULL,
        contact_email text,
        contact_phone text,
        authorization_reference text,
        message text,
        status industrial_factory_claim_status NOT NULL DEFAULT 'submitted',
        review_notes text,
        reviewed_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        reviewed_at timestamp,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_factory_claims_tenant_status_idx ON industrial_factory_claims(tenant_id, status, created_at)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_factory_claims_factory_status_idx ON industrial_factory_claims(factory_id, status)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_factory_claims_claimant_idx ON industrial_factory_claims(claimant_user_id, status)`,
    );
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS industrial_factory_claims_active_claimant_unique
      ON industrial_factory_claims(factory_id, claimant_user_id)
      WHERE status IN ('submitted', 'under_review')
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS industrial_recurring_requirements (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        factory_id uuid NOT NULL REFERENCES industrial_factories(id) ON DELETE CASCADE,
        created_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        updated_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        requirement_type industrial_requirement_type NOT NULL,
        category_code text NOT NULL,
        title text NOT NULL,
        details text NOT NULL DEFAULT '',
        quantity_text text,
        frequency text NOT NULL,
        reorder_threshold text,
        preferred_delivery_date text,
        preferred_supplier text,
        alternative_supplier text,
        price_agreement_period text,
        contract_start_at timestamp,
        contract_end_at timestamp,
        approval_workflow text NOT NULL DEFAULT 'factory_owner_approval',
        approval_required boolean NOT NULL DEFAULT true,
        status industrial_recurring_requirement_status NOT NULL DEFAULT 'draft',
        next_review_at timestamp,
        last_reminder_at timestamp,
        internal_notes text,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_recurring_requirements_factory_status_idx ON industrial_recurring_requirements(factory_id, status, updated_at)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_recurring_requirements_tenant_review_idx ON industrial_recurring_requirements(tenant_id, status, next_review_at)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_recurring_requirements_tenant_category_idx ON industrial_recurring_requirements(tenant_id, requirement_type, category_code)`,
    );
    await db.execute(sql`
      ALTER TABLE industrial_recurring_requirements
        ADD COLUMN IF NOT EXISTS machine_id uuid,
        ADD COLUMN IF NOT EXISTS assembly_id uuid,
        ADD COLUMN IF NOT EXISTS component_id uuid
    `);
    await db.execute(sql`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'industrial_recurring_requirements_machine_id_fkey') THEN
          ALTER TABLE industrial_recurring_requirements ADD CONSTRAINT industrial_recurring_requirements_machine_id_fkey FOREIGN KEY (machine_id) REFERENCES industrial_machines(id) ON DELETE SET NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'industrial_recurring_requirements_assembly_id_fkey') THEN
          ALTER TABLE industrial_recurring_requirements ADD CONSTRAINT industrial_recurring_requirements_assembly_id_fkey FOREIGN KEY (assembly_id) REFERENCES industrial_machine_assemblies(id) ON DELETE SET NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'industrial_recurring_requirements_component_id_fkey') THEN
          ALTER TABLE industrial_recurring_requirements ADD CONSTRAINT industrial_recurring_requirements_component_id_fkey FOREIGN KEY (component_id) REFERENCES industrial_machine_components(id) ON DELETE SET NULL;
        END IF;
      END $$
    `);
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_recurring_requirements_technical_context_idx ON industrial_recurring_requirements(factory_id, machine_id, assembly_id, component_id)`,
    );

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS industrial_challenges (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        factory_id uuid NOT NULL REFERENCES industrial_factories(id) ON DELETE CASCADE,
        requirement_id uuid NOT NULL REFERENCES industrial_requirements(id) ON DELETE CASCADE,
        machine_id uuid REFERENCES industrial_machines(id) ON DELETE SET NULL,
        assembly_id uuid REFERENCES industrial_machine_assemblies(id) ON DELETE SET NULL,
        component_id uuid REFERENCES industrial_machine_components(id) ON DELETE SET NULL,
        created_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        assigned_staff_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        reviewed_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        requirement_type industrial_requirement_type NOT NULL,
        category_code text NOT NULL,
        title text NOT NULL,
        normalized_title text NOT NULL,
        details text NOT NULL,
        problem_type text NOT NULL,
        production_stopped boolean NOT NULL DEFAULT false,
        impact_text text,
        recurrence_frequency text,
        estimated_downtime text,
        current_workaround text,
        desired_outcome industrial_challenge_outcome NOT NULL DEFAULT 'review_required',
        urgency text NOT NULL DEFAULT 'standard',
        status industrial_challenge_status NOT NULL DEFAULT 'submitted',
        visibility industrial_visibility NOT NULL DEFAULT 'factory_team_only',
        group_key text,
        triage_notes text,
        resolution_notes text,
        reviewed_at timestamp,
        resolved_at timestamp,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await db.execute(
      sql`CREATE UNIQUE INDEX IF NOT EXISTS industrial_challenges_requirement_unique ON industrial_challenges(requirement_id)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_challenges_tenant_status_urgency_idx ON industrial_challenges(tenant_id, status, urgency, updated_at)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_challenges_factory_status_idx ON industrial_challenges(factory_id, status, updated_at)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_challenges_technical_context_idx ON industrial_challenges(factory_id, machine_id, assembly_id, component_id)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_challenges_tenant_group_idx ON industrial_challenges(tenant_id, group_key, status)`,
    );

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS industrial_requirement_attachments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        requirement_id uuid NOT NULL REFERENCES industrial_requirements(id) ON DELETE CASCADE,
        uploaded_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        file_name text NOT NULL,
        storage_key text NOT NULL,
        mime_type text NOT NULL,
        size_bytes integer NOT NULL,
        extraction_status text NOT NULL DEFAULT 'pending',
        extraction_method text,
        extracted_text text,
        extraction_warning text,
        extraction_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        extracted_at timestamp,
        visibility industrial_visibility NOT NULL DEFAULT 'factory_team_only',
        created_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await db.execute(
      sql`ALTER TABLE industrial_requirement_attachments ADD COLUMN IF NOT EXISTS extraction_status text NOT NULL DEFAULT 'pending'`,
    );
    await db.execute(
      sql`ALTER TABLE industrial_requirement_attachments ADD COLUMN IF NOT EXISTS extraction_method text`,
    );
    await db.execute(
      sql`ALTER TABLE industrial_requirement_attachments ADD COLUMN IF NOT EXISTS extracted_text text`,
    );
    await db.execute(
      sql`ALTER TABLE industrial_requirement_attachments ADD COLUMN IF NOT EXISTS extraction_warning text`,
    );
    await db.execute(
      sql`ALTER TABLE industrial_requirement_attachments ADD COLUMN IF NOT EXISTS extraction_metadata jsonb NOT NULL DEFAULT '{}'::jsonb`,
    );
    await db.execute(
      sql`ALTER TABLE industrial_requirement_attachments ADD COLUMN IF NOT EXISTS extracted_at timestamp`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_requirement_attachments_requirement_idx ON industrial_requirement_attachments(requirement_id, visibility)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_requirement_attachments_extraction_idx ON industrial_requirement_attachments(tenant_id, extraction_status, created_at)`,
    );

    await db.execute(sql`
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
      )
    `);
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_attachment_reviews_requirement_status_idx ON industrial_attachment_reviews(tenant_id, requirement_id, status, updated_at)`,
    );

    await db.execute(sql`
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
      )
    `);
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_attachment_review_events_review_timeline_idx ON industrial_attachment_review_events(review_id, created_at)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_attachment_review_events_requirement_timeline_idx ON industrial_attachment_review_events(tenant_id, requirement_id, created_at)`,
    );

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS industrial_factory_documents (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        factory_id uuid NOT NULL REFERENCES industrial_factories(id) ON DELETE CASCADE,
        uploaded_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        document_type text NOT NULL,
        title text NOT NULL,
        file_name text NOT NULL,
        storage_key text NOT NULL,
        mime_type text NOT NULL,
        size_bytes integer NOT NULL,
        visibility industrial_visibility NOT NULL DEFAULT 'factory_team_only',
        expires_at timestamp,
        archived_at timestamp,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_factory_documents_factory_active_idx ON industrial_factory_documents(factory_id, archived_at, updated_at)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_factory_documents_tenant_type_idx ON industrial_factory_documents(tenant_id, document_type, archived_at)`,
    );

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS industrial_part_records (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        factory_id uuid NOT NULL REFERENCES industrial_factories(id) ON DELETE CASCADE,
        source_requirement_id uuid REFERENCES industrial_requirements(id) ON DELETE SET NULL,
        challenge_id uuid REFERENCES industrial_challenges(id) ON DELETE SET NULL,
        machine_id uuid REFERENCES industrial_machines(id) ON DELETE SET NULL,
        assembly_id uuid REFERENCES industrial_machine_assemblies(id) ON DELETE SET NULL,
        component_id uuid REFERENCES industrial_machine_components(id) ON DELETE SET NULL,
        created_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        reviewed_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        reference_code text NOT NULL,
        title text NOT NULL,
        normalized_title text NOT NULL,
        part_number text,
        requirement_type industrial_requirement_type NOT NULL DEFAULT 'spare_part',
        category_code text NOT NULL,
        technical_details text NOT NULL DEFAULT '',
        material text,
        dimensions_text text,
        weight_text text,
        application text,
        current_source text,
        demand_signal_text text,
        status industrial_part_record_status NOT NULL DEFAULT 'captured',
        route_decision industrial_part_route_decision NOT NULL DEFAULT 'review_required',
        route_rationale text,
        review_notes text,
        visibility industrial_visibility NOT NULL DEFAULT 'factory_team_only',
        revision integer NOT NULL DEFAULT 1,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        reviewed_at timestamp,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await db.execute(
      sql`CREATE UNIQUE INDEX IF NOT EXISTS industrial_part_records_tenant_reference_unique ON industrial_part_records(tenant_id, reference_code)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_part_records_factory_status_idx ON industrial_part_records(factory_id, status, updated_at)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_part_records_tenant_route_idx ON industrial_part_records(tenant_id, route_decision, status, updated_at)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_part_records_technical_context_idx ON industrial_part_records(factory_id, machine_id, assembly_id, component_id)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_part_records_requirement_idx ON industrial_part_records(source_requirement_id, challenge_id)`,
    );

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS industrial_part_record_documents (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        part_record_id uuid NOT NULL REFERENCES industrial_part_records(id) ON DELETE CASCADE,
        uploaded_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        document_type text NOT NULL,
        title text NOT NULL,
        file_name text NOT NULL,
        storage_key text NOT NULL,
        mime_type text NOT NULL,
        size_bytes integer NOT NULL,
        visibility industrial_visibility NOT NULL DEFAULT 'factory_team_only',
        created_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_part_record_documents_part_record_idx ON industrial_part_record_documents(part_record_id, created_at)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_part_record_documents_tenant_type_idx ON industrial_part_record_documents(tenant_id, document_type, created_at)`,
    );

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS industrial_audit_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id integer NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        actor_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        action text NOT NULL,
        entity_type text NOT NULL,
        entity_id uuid,
        reason text,
        previous_value jsonb NOT NULL DEFAULT '{}'::jsonb,
        next_value jsonb NOT NULL DEFAULT '{}'::jsonb,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_audit_logs_tenant_entity_idx ON industrial_audit_logs(tenant_id, entity_type, entity_id)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_audit_logs_tenant_action_idx ON industrial_audit_logs(tenant_id, action, created_at)`,
    );
    await ensureCarrierNetworkTables();
  })();

  return ensurePromise;
}
