import { sql } from "drizzle-orm";
import { db } from "@db";

let ready = false;
let inFlight: Promise<void> | null = null;

export async function ensureCommercialCrmTables() {
  if (ready) return;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS sales_leads (
        id serial PRIMARY KEY,
        tenant_id integer REFERENCES tenants(id) ON DELETE CASCADE,
        company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        source_chat_lead_id uuid REFERENCES chat_leads(id) ON DELETE SET NULL,
        name text NOT NULL,
        email text,
        phone text,
        company text,
        source text DEFAULT 'manual',
        status text DEFAULT 'new',
        score integer DEFAULT 0,
        owner_agent_id integer REFERENCES agents(id) ON DELETE SET NULL,
        notes text,
        tags jsonb DEFAULT '[]'::jsonb,
        custom_fields jsonb DEFAULT '{}'::jsonb,
        last_contacted_at timestamp,
        next_follow_up_at timestamp,
        metadata jsonb DEFAULT '{}'::jsonb,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS deals (
        id serial PRIMARY KEY,
        tenant_id integer REFERENCES tenants(id) ON DELETE CASCADE,
        company_id integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        lead_id integer REFERENCES sales_leads(id) ON DELETE SET NULL,
        source_chat_lead_id uuid REFERENCES chat_leads(id) ON DELETE SET NULL,
        industrial_requirement_id uuid REFERENCES industrial_requirements(id) ON DELETE SET NULL,
        reference_code text,
        name text NOT NULL,
        value numeric(15, 2),
        currency text,
        stage text DEFAULT 'lead',
        probability integer DEFAULT 0,
        owner_agent_id integer REFERENCES agents(id) ON DELETE SET NULL,
        expected_close_date timestamp,
        actual_close_date timestamp,
        lost_reason text,
        history jsonb DEFAULT '[]'::jsonb,
        metadata jsonb DEFAULT '{}'::jsonb,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )
    `);

    await db.execute(sql`
      ALTER TABLE sales_leads
        ADD COLUMN IF NOT EXISTS tenant_id integer,
        ADD COLUMN IF NOT EXISTS source_chat_lead_id uuid
    `);
    await db.execute(sql`
      ALTER TABLE deals
        ADD COLUMN IF NOT EXISTS tenant_id integer,
        ADD COLUMN IF NOT EXISTS source_chat_lead_id uuid,
        ADD COLUMN IF NOT EXISTS industrial_requirement_id uuid,
        ADD COLUMN IF NOT EXISTS reference_code text
    `);

    await db.execute(sql`
      UPDATE sales_leads AS lead
      SET tenant_id = company.tenant_id
      FROM companies AS company
      WHERE lead.company_id = company.id
        AND lead.tenant_id IS NULL
    `);
    await db.execute(sql`
      UPDATE deals AS deal
      SET tenant_id = company.tenant_id
      FROM companies AS company
      WHERE deal.company_id = company.id
        AND deal.tenant_id IS NULL
    `);

    await db.execute(sql`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_leads_tenant_id_fkey') THEN
          ALTER TABLE sales_leads ADD CONSTRAINT sales_leads_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_leads_source_chat_lead_id_fkey') THEN
          ALTER TABLE sales_leads ADD CONSTRAINT sales_leads_source_chat_lead_id_fkey FOREIGN KEY (source_chat_lead_id) REFERENCES chat_leads(id) ON DELETE SET NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deals_tenant_id_fkey') THEN
          ALTER TABLE deals ADD CONSTRAINT deals_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deals_source_chat_lead_id_fkey') THEN
          ALTER TABLE deals ADD CONSTRAINT deals_source_chat_lead_id_fkey FOREIGN KEY (source_chat_lead_id) REFERENCES chat_leads(id) ON DELETE SET NULL;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deals_industrial_requirement_id_fkey') THEN
          ALTER TABLE deals ADD CONSTRAINT deals_industrial_requirement_id_fkey FOREIGN KEY (industrial_requirement_id) REFERENCES industrial_requirements(id) ON DELETE SET NULL;
        END IF;
      END $$
    `);

    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS sales_leads_tenant_chat_lead_unique
        ON sales_leads(tenant_id, source_chat_lead_id)
        WHERE tenant_id IS NOT NULL AND source_chat_lead_id IS NOT NULL
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS sales_leads_tenant_status_idx
        ON sales_leads(tenant_id, status, updated_at)
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS deals_tenant_requirement_unique
        ON deals(tenant_id, industrial_requirement_id)
        WHERE tenant_id IS NOT NULL AND industrial_requirement_id IS NOT NULL
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS deals_tenant_reference_unique
        ON deals(tenant_id, reference_code)
        WHERE tenant_id IS NOT NULL AND reference_code IS NOT NULL
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS deals_tenant_chat_lead_idx
        ON deals(tenant_id, source_chat_lead_id, updated_at)
    `);

    ready = true;
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
}
