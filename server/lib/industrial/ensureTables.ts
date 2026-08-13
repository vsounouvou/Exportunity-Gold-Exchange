import { sql } from "drizzle-orm";

import { db } from "@db";
import { ensureCompanyBrainTables } from "../company-brain/ensureTables";

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
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_factory_relationship_stage') THEN
          CREATE TYPE industrial_factory_relationship_stage AS ENUM ('identified', 'research_in_progress', 'contacted', 'qualified', 'visit_scheduled', 'factory_visited', 'requirements_collected', 'proposal_in_preparation', 'active_customer', 'recurring_customer', 'dormant', 'disqualified');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'industrial_legacy_product_review_status') THEN
          CREATE TYPE industrial_legacy_product_review_status AS ENUM ('APPROVED_EXPORT_PRODUCT', 'APPROVED_MACHINERY', 'APPROVED_RAW_MATERIAL', 'APPROVED_INDUSTRIAL_INPUT', 'APPROVED_SPARE_PART', 'APPROVED_INDUSTRIAL_SERVICE', 'REQUIRES_RECLASSIFICATION', 'REQUIRES_VERIFICATION', 'INCOMPLETE', 'DUPLICATE', 'OUT_OF_SCOPE', 'ARCHIVED');
        END IF;
      END $$;
    `);
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
        requester_email text NOT NULL,
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
        intent text NOT NULL,
        intent_confidence numeric(4,3),
        suggested_action text NOT NULL DEFAULT 'ASK',
        product_name text,
        product_category text,
        specification text,
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
        total_amount numeric(16,2),
        line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
        lead_time_text text,
        valid_until timestamp,
        commercial_terms text,
        customer_notes text,
        internal_notes text,
        visibility industrial_visibility NOT NULL DEFAULT 'parties_to_transaction',
        created_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        issued_by_user_id integer REFERENCES ece_users(id) ON DELETE SET NULL,
        issued_at timestamp,
        responded_at timestamp,
        closed_at timestamp,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now(),
        CONSTRAINT industrial_quotes_tenant_reference_unique UNIQUE (tenant_id, reference_code)
      )
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
        total_amount numeric(16,2),
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
      sql`CREATE INDEX IF NOT EXISTS industrial_orders_factory_status_idx ON industrial_orders(factory_id, status, updated_at)`,
    );
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_orders_requirement_idx ON industrial_orders(requirement_id, status)`,
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
        visibility industrial_visibility NOT NULL DEFAULT 'factory_team_only',
        created_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await db.execute(
      sql`CREATE INDEX IF NOT EXISTS industrial_requirement_attachments_requirement_idx ON industrial_requirement_attachments(requirement_id, visibility)`,
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
  })();

  return ensurePromise;
}
