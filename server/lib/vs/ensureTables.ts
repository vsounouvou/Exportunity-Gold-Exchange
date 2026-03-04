import { db } from "@db";
import { sql } from "drizzle-orm";

async function ensureCoreTables() {
  const ddl: string[] = [
    `create table if not exists vs_user_roles (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      user_id int not null references ece_users(id) on delete cascade,
      role text not null,
      permissions jsonb not null default '[]'::jsonb,
      is_active boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`,
    `create unique index if not exists vs_user_roles_tenant_user_role_uniq on vs_user_roles (tenant_id, user_id, role)`,
    `create table if not exists vs_budget_policies (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      tenant_daily_cap int not null default 750000,
      default_agent_daily_cap int not null default 75000,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`,
    `create unique index if not exists vs_budget_policies_tenant_uniq on vs_budget_policies (tenant_id)`,
    `create table if not exists vs_agent_budget_caps (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      agent_key text not null,
      daily_cap int not null default 20000,
      output_detail_level text not null default 'concise',
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`,
    `create unique index if not exists vs_agent_budget_caps_tenant_agent_uniq on vs_agent_budget_caps (tenant_id, agent_key)`,
    `create table if not exists vs_website_blocks (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      page_path text not null,
      block_key text not null,
      title text,
      content text,
      metadata jsonb not null default '{}'::jsonb,
      is_published boolean not null default true,
      sort_order int not null default 0,
      updated_by_user_id int references ece_users(id) on delete set null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`,
    `create unique index if not exists vs_website_blocks_tenant_page_block_uniq on vs_website_blocks (tenant_id, page_path, block_key)`,
    `create table if not exists vs_inbox_messages (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      type text not null default 'CONTACT',
      channel text not null default 'website',
      sender_name text,
      sender_email text,
      subject text,
      body text not null,
      risk_level text not null default 'low',
      status text not null default 'NEW',
      draft_reply text,
      approved_by_user_id int references ece_users(id) on delete set null,
      replied_at timestamptz,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`,
    `create table if not exists reputation_sources (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      name text not null,
      type text not null default 'RSS',
      url text,
      is_active boolean not null default true,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`,
    `create table if not exists reputation_keywords (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      keyword text not null,
      weight int not null default 1,
      is_active boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`,
    `create unique index if not exists reputation_keywords_tenant_keyword_uniq on reputation_keywords (tenant_id, keyword)`,
    `create table if not exists reputation_mentions (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      source_id int references reputation_sources(id) on delete set null,
      url text,
      domain text,
      title text,
      snippet text,
      sentiment text not null default 'neutral',
      severity text not null default 'medium',
      authority_score int not null default 0,
      status text not null default 'NEW',
      metadata jsonb not null default '{}'::jsonb,
      published_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`,
    `create table if not exists reputation_tags (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      mention_id int not null references reputation_mentions(id) on delete cascade,
      tag text not null,
      created_at timestamptz not null default now()
    )`,
    `create table if not exists reputation_rules (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      name text not null,
      condition_spec jsonb not null default '{}'::jsonb,
      action_spec jsonb not null default '{}'::jsonb,
      is_active boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`,
    `create table if not exists reputation_alerts (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      mention_id int references reputation_mentions(id) on delete set null,
      rule_id int references reputation_rules(id) on delete set null,
      alert_type text not null default 'mention',
      severity text not null default 'warning',
      status text not null default 'OPEN',
      message text not null,
      payload jsonb not null default '{}'::jsonb,
      acknowledged_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`,
    `create table if not exists reputation_tasks (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      mention_id int references reputation_mentions(id) on delete set null,
      title text not null,
      status text not null default 'OPEN',
      priority int not null default 0,
      owner_user_id int references ece_users(id) on delete set null,
      due_at timestamptz,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`,
    `create table if not exists media_outlets (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      name text not null,
      domain text,
      category text,
      region text,
      authority_score int not null default 0,
      is_active boolean not null default true,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`,
    `create table if not exists media_contacts (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      outlet_id int references media_outlets(id) on delete set null,
      full_name text not null,
      title text,
      email text,
      phone text,
      social_handle text,
      tags jsonb not null default '[]'::jsonb,
      last_contacted_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`,
    `create table if not exists press_angles (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      title text not null,
      description text,
      target_audience text,
      status text not null default 'DRAFT',
      created_by_user_id int references ece_users(id) on delete set null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`,
    `create table if not exists outreach_templates (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      name text not null,
      channel text not null default 'EMAIL',
      subject_template text,
      body_template text not null,
      is_active boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`,
    `create table if not exists pr_campaigns (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      name text not null,
      objective text,
      status text not null default 'DRAFT',
      budget_usd numeric(12,2) not null default 0,
      start_date timestamptz,
      end_date timestamptz,
      metadata jsonb not null default '{}'::jsonb,
      created_by_user_id int references ece_users(id) on delete set null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`,
    `create table if not exists outreach_messages (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      campaign_id int references pr_campaigns(id) on delete set null,
      contact_id int references media_contacts(id) on delete set null,
      angle_id int references press_angles(id) on delete set null,
      template_id int references outreach_templates(id) on delete set null,
      subject text,
      body text not null,
      status text not null default 'DRAFT',
      approval_status text not null default 'DRAFT',
      approved_by_user_id int references ece_users(id) on delete set null,
      sent_at timestamptz,
      error text,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`,
    `create table if not exists pr_tasks (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      campaign_id int references pr_campaigns(id) on delete set null,
      title text not null,
      description text,
      status text not null default 'OPEN',
      priority int not null default 0,
      owner_user_id int references ece_users(id) on delete set null,
      due_at timestamptz,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`,
    `create table if not exists social_accounts (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      provider text not null,
      account_id text not null,
      account_name text,
      status text not null default 'CONNECTED',
      connected_at timestamptz,
      last_sync_at timestamptz,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`,
    `create unique index if not exists social_accounts_tenant_provider_account_uniq on social_accounts (tenant_id, provider, account_id)`,
    `create table if not exists social_pages (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      account_id int not null references social_accounts(id) on delete cascade,
      page_id text not null,
      page_name text not null,
      handle text,
      url text,
      is_primary boolean not null default false,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`,
    `create unique index if not exists social_pages_tenant_page_uniq on social_pages (tenant_id, page_id)`,
    `create table if not exists social_tokens (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      account_id int not null references social_accounts(id) on delete cascade,
      access_token text not null,
      refresh_token text,
      expires_at timestamptz,
      scopes jsonb not null default '[]'::jsonb,
      token_meta jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`,
    `create unique index if not exists social_tokens_tenant_account_uniq on social_tokens (tenant_id, account_id)`,
    `create table if not exists social_rate_limits (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      account_id int not null references social_accounts(id) on delete cascade,
      resource text not null,
      limit_per_hour int not null default 200,
      used_count int not null default 0,
      reset_at timestamptz,
      status text not null default 'OK',
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`,
    `create unique index if not exists social_rate_limits_tenant_account_resource_uniq on social_rate_limits (tenant_id, account_id, resource)`,
    `create table if not exists studio_projects (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      name text not null,
      description text,
      status text not null default 'ACTIVE',
      owner_user_id int references ece_users(id) on delete set null,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`,
    `create table if not exists content_items (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      project_id int references studio_projects(id) on delete set null,
      title text not null,
      kind text not null default 'POST',
      brief text,
      body_text text,
      status text not null default 'DRAFT',
      risk_level text not null default 'low',
      approval_status text not null default 'DRAFT',
      approved_by_user_id int references ece_users(id) on delete set null,
      published_at timestamptz,
      source_mention_id int references reputation_mentions(id) on delete set null,
      metadata jsonb not null default '{}'::jsonb,
      created_by_user_id int references ece_users(id) on delete set null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`,
    `create table if not exists content_assets (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      item_id int not null references content_items(id) on delete cascade,
      asset_type text not null,
      url text not null,
      provider text,
      status text not null default 'READY',
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`,
    `create table if not exists content_schedules (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      item_id int not null references content_items(id) on delete cascade,
      social_page_id int references social_pages(id) on delete set null,
      channel text not null,
      scheduled_at timestamptz not null,
      status text not null default 'SCHEDULED',
      approval_status text not null default 'PENDING',
      approved_by_user_id int references ece_users(id) on delete set null,
      published_post_id text,
      error text,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`,
    `create table if not exists publishing_jobs (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      schedule_id int not null references content_schedules(id) on delete cascade,
      provider text not null,
      status text not null default 'QUEUED',
      request_payload jsonb not null default '{}'::jsonb,
      response_payload jsonb not null default '{}'::jsonb,
      retry_count int not null default 0,
      last_error text,
      started_at timestamptz,
      finished_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`,
    `create table if not exists vs_approval_requests (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      scope text not null,
      entity_type text not null,
      entity_id text not null,
      requested_by_user_id int references ece_users(id) on delete set null,
      status text not null default 'PENDING',
      payload jsonb not null default '{}'::jsonb,
      approved_by_user_id int references ece_users(id) on delete set null,
      note text,
      approved_at timestamptz,
      rejected_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`,
    `create table if not exists vs_settings (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      key text not null,
      value jsonb not null default '{}'::jsonb,
      updated_by_user_id int references ece_users(id) on delete set null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )`,
    `create unique index if not exists vs_settings_tenant_key_uniq on vs_settings (tenant_id, key)`,
  ];

  for (const statement of ddl) {
    // eslint-disable-next-line no-await-in-loop
    await db.execute(sql.raw(statement));
  }
}

async function seedDefaultsForTenant(tenantId: number) {
  const websiteBlocks: Array<{ pagePath: string; blockKey: string; title: string; content: string; sortOrder: number }> = [
    { pagePath: "/", blockKey: "hero", title: "Vital Sounouvou", content: "Strategic narrative and reputation infrastructure.", sortOrder: 1 },
    { pagePath: "/", blockKey: "doctrine", title: "Doctrine principles", content: "Clarity. Authority. Discipline. Deterministic execution.", sortOrder: 2 },
    { pagePath: "/", blockKey: "featured_mentions", title: "Featured mentions", content: "Approved citations and coverage highlights.", sortOrder: 3 },
    { pagePath: "/about", blockKey: "bio_short", title: "Short bio", content: "Founder operating governed AI systems across tenants.", sortOrder: 1 },
    { pagePath: "/about", blockKey: "bio_long", title: "Long bio", content: "Building disciplined command structures for AI-native organizations.", sortOrder: 2 },
    { pagePath: "/press", blockKey: "press_kit", title: "Press kit", content: "Bios, headshots, logos, and approved fact sheets.", sortOrder: 1 },
    { pagePath: "/portfolio", blockKey: "portfolio_intro", title: "Portfolio", content: "Curated strategic, operational, and technical implementations.", sortOrder: 1 },
    { pagePath: "/contact", blockKey: "contact_intro", title: "Contact", content: "Media request, partnership, speaking, and other inquiries.", sortOrder: 1 },
  ];

  for (const block of websiteBlocks) {
    // eslint-disable-next-line no-await-in-loop
    await db.execute(sql`
      insert into vs_website_blocks (
        tenant_id, page_path, block_key, title, content, metadata, is_published, sort_order, created_at, updated_at
      )
      values (
        ${tenantId}, ${block.pagePath}, ${block.blockKey}, ${block.title}, ${block.content}, '{}'::jsonb, true, ${block.sortOrder}, now(), now()
      )
      on conflict (tenant_id, page_path, block_key)
      do update set
        title = excluded.title,
        content = excluded.content,
        sort_order = excluded.sort_order,
        updated_at = now();
    `);
  }

  await db.execute(sql`
    insert into vs_budget_policies (tenant_id, tenant_daily_cap, default_agent_daily_cap, metadata, created_at, updated_at)
    select ${tenantId}, 750000, 75000, '{"seededBy":"ensureVsTenantTables"}'::jsonb, now(), now()
    where not exists (select 1 from vs_budget_policies where tenant_id = ${tenantId});
  `);

  await db.execute(sql`
    insert into vs_settings (tenant_id, key, value, created_at, updated_at)
    select ${tenantId}, 'website.identity', '{"name":"Vital Sounouvou","tagline":"Strategic narrative and reputation infrastructure"}'::jsonb, now(), now()
    where not exists (select 1 from vs_settings where tenant_id = ${tenantId} and key = 'website.identity');
  `);

  await db.execute(sql`
    insert into vs_settings (tenant_id, key, value, created_at, updated_at)
    select ${tenantId}, 'press.contact', '{"email":"press@vitalsounouvou.com"}'::jsonb, now(), now()
    where not exists (select 1 from vs_settings where tenant_id = ${tenantId} and key = 'press.contact');
  `);

  await db.execute(sql`
    insert into vs_user_roles (tenant_id, user_id, role, permissions, is_active, created_at, updated_at)
    select utr.tenant_id, utr.user_id, 'TENANT_ADMIN', '["*"]'::jsonb, true, now(), now()
    from user_tenant_roles utr
    where utr.tenant_id = ${tenantId}
      and utr.role in ('TENANT_ADMIN', 'SUPER_ADMIN')
      and not exists (
        select 1 from vs_user_roles vur
        where vur.tenant_id = utr.tenant_id and vur.user_id = utr.user_id and vur.role = 'TENANT_ADMIN'
      );
  `);

  const cronJobs = [
    { name: "reputation_ingest_rss", kind: "TIME", cron: "0 * * * *", moduleId: "vs.reputation.ingest" },
    { name: "reputation_apply_rules", kind: "TIME", cron: "5 * * * *", moduleId: "vs.reputation.rules" },
    { name: "reputation_daily_digest", kind: "TIME", cron: "0 7 * * *", moduleId: "vs.reputation.digest" },
    { name: "reputation_spike_detector", kind: "TIME", cron: "15 * * * *", moduleId: "vs.reputation.spike" },
    { name: "vs_social_health_monitor", kind: "MONITOR", cron: "*/30 * * * *", moduleId: "vs.social.monitor" },
    { name: "vs_content_regeneration", kind: "REGENERATION", cron: "0 */6 * * *", moduleId: "vs.studio.regeneration" },
  ];

  for (const job of cronJobs) {
    // eslint-disable-next-line no-await-in-loop
    await db.execute(sql`
      insert into intelligence_cron_jobs (
        tenant_id, name, cron_kind, trigger_mode, schedule_cron, module_id, policy_tier, workflow_template,
        is_active, failure_count, max_failures, metadata, created_at, updated_at
      )
      select
        ${tenantId}, ${job.name}, ${job.kind}, 'SCHEDULE', ${job.cron}, ${job.moduleId}, 'EXECUTION',
        '{"steps":["brief","script","execute","verify","report"]}'::jsonb,
        true, 0, 10, '{"seededBy":"ensureVsTenantTables"}'::jsonb, now(), now()
      where not exists (
        select 1 from intelligence_cron_jobs where tenant_id = ${tenantId} and name = ${job.name}
      );
    `);
  }
}

export async function ensureVsTenantTables() {
  await ensureCoreTables();

  const tenant = await db.execute(sql`select id from tenants where key = 'vs' limit 1`);
  const tenantId = Number((tenant as any)?.rows?.[0]?.id || 0);
  if (!Number.isInteger(tenantId) || tenantId <= 0) return;
  await seedDefaultsForTenant(tenantId);
}

