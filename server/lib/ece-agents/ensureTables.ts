import { sql } from "drizzle-orm";
import { db } from "@db";

let ensurePromise: Promise<void> | null = null;

async function seedDefaults() {
  await db.execute(sql`
    insert into ece_agent_templates (
      code, title, description, category, default_tools, default_limits, base_salary_monthly, setup_fee, visibility, allowed_tenants, is_active
    )
    values
      (
        'procurement_agent',
        'Procurement Agent',
        'Sources suppliers, drafts RFQs, and coordinates purchase follow-ups.',
        'operations',
        '["supplier_lookup","rfq_builder","mail"]'::jsonb,
        '{"tokensPerDay":80000,"tasksPerDay":40}'::jsonb,
        180.00,
        15.00,
        'public',
        '[]'::jsonb,
        true
      ),
      (
        'compliance_agent',
        'Compliance Agent',
        'Prepares KYC/KYB packs, validates docs, and tracks policy gates.',
        'compliance',
        '["kyc_check","document_review","mail"]'::jsonb,
        '{"tokensPerDay":70000,"tasksPerDay":30}'::jsonb,
        220.00,
        20.00,
        'public',
        '[]'::jsonb,
        true
      ),
      (
        'outreach_agent',
        'Outreach Agent',
        'Drafts and follows up with leads through approved communication channels.',
        'growth',
        '["mail","whatsapp","crm"]'::jsonb,
        '{"tokensPerDay":100000,"tasksPerDay":60}'::jsonb,
        160.00,
        10.00,
        'public',
        '[]'::jsonb,
        true
      ),
      (
        'seo_agent',
        'SEO Agent',
        'Builds SEO recommendations, metadata drafts, and publishing plans.',
        'marketing',
        '["seo_audit","content_draft"]'::jsonb,
        '{"tokensPerDay":90000,"tasksPerDay":50}'::jsonb,
        190.00,
        10.00,
        'public',
        '[]'::jsonb,
        true
      )
    on conflict (code) do update
      set title = excluded.title,
          description = excluded.description,
          category = excluded.category,
          default_tools = excluded.default_tools,
          default_limits = excluded.default_limits,
          base_salary_monthly = excluded.base_salary_monthly,
          setup_fee = excluded.setup_fee,
          visibility = excluded.visibility,
          is_active = true,
          updated_at = now()
  `);

  await db.execute(sql`
    insert into ece_org_plans (
      tenant_id, plan_name, monthly_fee, included_agents_count, included_tokens, overage_token_price, max_agents, features, is_active
    )
    select null, 'Starter', 49.00, 2, 120000, 0.0006, 3, '{"teamMode":false,"prioritySupport":false}'::jsonb, true
    where not exists (
      select 1 from ece_org_plans p where p.tenant_id is null and p.plan_name = 'Starter'
    )
  `);

  await db.execute(sql`
    insert into ece_org_plans (
      tenant_id, plan_name, monthly_fee, included_agents_count, included_tokens, overage_token_price, max_agents, features, is_active
    )
    select null, 'Growth', 129.00, 5, 450000, 0.00045, 8, '{"teamMode":true,"prioritySupport":true}'::jsonb, true
    where not exists (
      select 1 from ece_org_plans p where p.tenant_id is null and p.plan_name = 'Growth'
    )
  `);

  await db.execute(sql`
    insert into ece_org_plans (
      tenant_id, plan_name, monthly_fee, included_agents_count, included_tokens, overage_token_price, max_agents, features, is_active
    )
    select null, 'Scale', 299.00, 12, 1200000, 0.0003, 20, '{"teamMode":true,"prioritySupport":true,"advancedLogs":true}'::jsonb, true
    where not exists (
      select 1 from ece_org_plans p where p.tenant_id is null and p.plan_name = 'Scale'
    )
  `);
}

export async function ensureEceAgentsTables() {
  if (ensurePromise) return ensurePromise;

  ensurePromise = (async () => {
    await db.execute(sql`
      create table if not exists ece_agent_templates (
        id serial primary key,
        tenant_id int references tenants(id) on delete cascade,
        code text not null unique,
        title text not null,
        description text,
        category text not null default 'operations',
        default_tools jsonb not null default '[]'::jsonb,
        default_limits jsonb not null default '{}'::jsonb,
        base_salary_monthly numeric(12, 2) not null default 0,
        setup_fee numeric(12, 2) not null default 0,
        visibility text not null default 'public',
        allowed_tenants jsonb not null default '[]'::jsonb,
        is_active boolean not null default true,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `);

    await db.execute(sql`
      create table if not exists ece_agent_orgs (
        id serial primary key,
        tenant_id int not null references tenants(id) on delete cascade,
        owner_user_id int not null references ece_users(id) on delete cascade,
        name text not null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique (tenant_id, owner_user_id)
      )
    `);

    await db.execute(sql`
      create index if not exists ece_agent_orgs_tenant_idx on ece_agent_orgs (tenant_id, created_at desc)
    `);

    await db.execute(sql`
      create table if not exists ece_org_plans (
        id serial primary key,
        tenant_id int references tenants(id) on delete cascade,
        plan_name text not null,
        monthly_fee numeric(12, 2) not null default 0,
        included_agents_count int not null default 1,
        included_tokens int not null default 50000,
        overage_token_price numeric(12, 4) not null default 0,
        max_agents int not null default 1,
        features jsonb not null default '{}'::jsonb,
        is_active boolean not null default true,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique (tenant_id, plan_name)
      )
    `);

    await db.execute(sql`
      create table if not exists ece_billing_subscriptions (
        id serial primary key,
        tenant_id int not null references tenants(id) on delete cascade,
        org_id int not null references ece_agent_orgs(id) on delete cascade,
        plan_id int not null references ece_org_plans(id) on delete restrict,
        status text not null default 'active',
        renewal_date timestamptz,
        provider text,
        provider_ref text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique (tenant_id, org_id)
      )
    `);

    await db.execute(sql`
      create index if not exists ece_billing_subscriptions_tenant_idx
      on ece_billing_subscriptions (tenant_id, updated_at desc)
    `);

    await db.execute(sql`
      create table if not exists ece_org_agents (
        id serial primary key,
        tenant_id int not null references tenants(id) on delete cascade,
        org_id int not null references ece_agent_orgs(id) on delete cascade,
        template_id int references ece_agent_templates(id) on delete set null,
        display_name text not null,
        status text not null default 'active',
        salary_monthly numeric(12, 2) not null default 0,
        billing_plan_id int references ece_org_plans(id) on delete set null,
        tool_policy jsonb not null default '{}'::jsonb,
        model_tier text not null default 'L0',
        language text not null default 'fr',
        goals text,
        token_budget_daily int not null default 10000,
        timebox_minutes int not null default 60,
        quota_snapshot jsonb not null default '{}'::jsonb,
        created_by_user_id int references ece_users(id) on delete set null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `);

    await db.execute(sql`
      create index if not exists ece_org_agents_tenant_org_idx
      on ece_org_agents (tenant_id, org_id, created_at desc)
    `);

    await db.execute(sql`
      create table if not exists ece_org_agent_threads (
        id serial primary key,
        tenant_id int not null references tenants(id) on delete cascade,
        org_id int not null references ece_agent_orgs(id) on delete cascade,
        org_agent_id int not null references ece_org_agents(id) on delete cascade,
        title text not null,
        last_message_at timestamptz,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique (tenant_id, org_agent_id)
      )
    `);

    await db.execute(sql`
      create index if not exists ece_org_agent_threads_tenant_idx
      on ece_org_agent_threads (tenant_id, org_id, last_message_at desc nulls last)
    `);

    await db.execute(sql`
      create table if not exists ece_org_agent_messages (
        id serial primary key,
        tenant_id int not null references tenants(id) on delete cascade,
        org_id int not null references ece_agent_orgs(id) on delete cascade,
        org_agent_id int not null references ece_org_agents(id) on delete cascade,
        sender_type text not null,
        sender_user_id int references ece_users(id) on delete set null,
        content text not null,
        metadata jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now()
      )
    `);

    await db.execute(sql`
      create index if not exists ece_org_agent_messages_thread_idx
      on ece_org_agent_messages (tenant_id, org_agent_id, created_at asc)
    `);

    await db.execute(sql`
      create table if not exists ece_org_agent_tasks (
        id serial primary key,
        tenant_id int not null references tenants(id) on delete cascade,
        org_id int not null references ece_agent_orgs(id) on delete cascade,
        org_agent_id int not null references ece_org_agents(id) on delete cascade,
        type text not null,
        title text not null,
        status text not null default 'needs_approval',
        payload_json jsonb not null default '{}'::jsonb,
        approval_required boolean not null default true,
        approved_by_user_id int references ece_users(id) on delete set null,
        approved_at timestamptz,
        rejected_by_user_id int references ece_users(id) on delete set null,
        rejected_at timestamptz,
        rejection_reason text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `);

    await db.execute(sql`
      create index if not exists ece_org_agent_tasks_tenant_idx
      on ece_org_agent_tasks (tenant_id, org_id, status, created_at desc)
    `);

    await db.execute(sql`
      create table if not exists ece_agent_salary_charges (
        id serial primary key,
        tenant_id int not null references tenants(id) on delete cascade,
        org_agent_id int not null references ece_org_agents(id) on delete cascade,
        period text not null,
        amount numeric(12, 2) not null,
        status text not null default 'pending',
        invoice_url text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique (tenant_id, org_agent_id, period)
      )
    `);

    await db.execute(sql`
      create index if not exists ece_agent_salary_charges_tenant_idx
      on ece_agent_salary_charges (tenant_id, created_at desc)
    `);

    await seedDefaults();
  })();

  return ensurePromise;
}
