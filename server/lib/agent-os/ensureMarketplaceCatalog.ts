import { sql } from "drizzle-orm";
import { db } from "@db";

let ensurePromise: Promise<void> | null = null;

export async function ensureAgentsOsMarketplaceTables() {
  if (ensurePromise) return ensurePromise;

  ensurePromise = (async () => {
    await db.execute(sql`create type agent_market_availability as enum ('available','paused','waitlist');`).catch(() => {});
    await db.execute(sql`create type agent_status_catalog as enum ('draft','active','retired');`).catch(() => {});

    await db.execute(sql`
      alter table ece_agent_templates
      add column if not exists slug text;
    `);
    await db.execute(sql`
      alter table ece_agent_templates
      add column if not exists role_title text;
    `);
    await db.execute(sql`
      alter table ece_agent_templates
      add column if not exists short_pitch text;
    `);
    await db.execute(sql`
      alter table ece_agent_templates
      add column if not exists long_description text;
    `);
    await db.execute(sql`
      alter table ece_agent_templates
      add column if not exists base_model text;
    `);
    await db.execute(sql`
      alter table ece_agent_templates
      add column if not exists personality_profile jsonb not null default '{}'::jsonb;
    `);
    await db.execute(sql`
      alter table ece_agent_templates
      add column if not exists autonomy_level int not null default 2;
    `);
    await db.execute(sql`
      alter table ece_agent_templates
      add column if not exists approval_policy jsonb not null default '{}'::jsonb;
    `);
    await db.execute(sql`
      alter table ece_agent_templates
      add column if not exists knowledge_base_id int;
    `);
    await db.execute(sql`
      alter table ece_agent_templates
      add column if not exists avatar_url text;
    `);
    await db.execute(sql`
      alter table ece_agent_templates
      add column if not exists status agent_status_catalog not null default 'draft';
    `).catch(async () => {
      await db.execute(sql`alter table ece_agent_templates add column if not exists status text not null default 'draft';`).catch(() => {});
    });
    await db.execute(sql`
      alter table ece_agent_templates
      add column if not exists created_by_user_id int references ece_users(id) on delete set null;
    `);
    await db.execute(sql`
      alter table ece_agent_templates
      add column if not exists updated_by_user_id int references ece_users(id) on delete set null;
    `);

    await db.execute(sql`
      update ece_agent_templates
      set
        role_title = coalesce(nullif(role_title, ''), title),
        short_pitch = coalesce(nullif(short_pitch, ''), description),
        slug = coalesce(nullif(slug, ''), lower(regexp_replace(coalesce(code, title), '[^a-zA-Z0-9]+', '-', 'g')))
      where role_title is null
         or short_pitch is null
         or slug is null;
    `);

    await db.execute(sql`
      create unique index if not exists ece_agent_templates_tenant_slug_uniq
      on ece_agent_templates (tenant_id, slug);
    `).catch(() => {});
    await db.execute(sql`
      create index if not exists ece_agent_templates_tenant_status_idx
      on ece_agent_templates (tenant_id, status, updated_at desc);
    `).catch(() => {});
    await db.execute(sql`
      create index if not exists ece_agent_templates_tenant_category_idx
      on ece_agent_templates (tenant_id, category, updated_at desc);
    `).catch(() => {});

    await db.execute(sql`
      create table if not exists agent_marketplace_profiles (
        id serial primary key,
        agent_id int not null references ece_agent_templates(id) on delete cascade,
        tenant_id int not null references tenants(id) on delete cascade,
        is_visible boolean not null default false,
        price_monthly numeric(12, 2) not null default 0,
        currency text not null default 'USD',
        tags jsonb not null default '[]'::jsonb,
        is_featured boolean not null default false,
        sort_rank int not null default 0,
        availability text not null default 'available',
        min_contract_days int not null default 30,
        public_metrics_enabled boolean not null default true,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        unique (agent_id),
        unique (tenant_id, agent_id)
      );
    `);

    await db.execute(sql`
      create index if not exists agent_marketplace_profiles_tenant_visible_idx
      on agent_marketplace_profiles (tenant_id, is_visible, is_featured, sort_rank, updated_at desc);
    `).catch(() => {});

    await db.execute(sql`
      create table if not exists agent_versions (
        id serial primary key,
        agent_id int not null references ece_agent_templates(id) on delete cascade,
        tenant_id int not null references tenants(id) on delete cascade,
        version int not null,
        snapshot jsonb not null default '{}'::jsonb,
        change_note text,
        created_by_user_id int references ece_users(id) on delete set null,
        created_at timestamptz not null default now(),
        unique (agent_id, version)
      );
    `);
    await db.execute(sql`
      create index if not exists agent_versions_tenant_agent_idx
      on agent_versions (tenant_id, agent_id, version desc);
    `).catch(() => {});

    await db.execute(sql`
      create table if not exists agent_clones (
        id serial primary key,
        tenant_id int not null references tenants(id) on delete cascade,
        parent_agent_id int not null references ece_agent_templates(id) on delete cascade,
        child_agent_id int not null references ece_agent_templates(id) on delete cascade,
        clone_reason text,
        created_by_user_id int references ece_users(id) on delete set null,
        created_at timestamptz not null default now()
      );
    `);
    await db.execute(sql`
      create index if not exists agent_clones_tenant_parent_idx
      on agent_clones (tenant_id, parent_agent_id, created_at desc);
    `).catch(() => {});

    await db.execute(sql`
      insert into agent_marketplace_profiles (
        agent_id, tenant_id, is_visible, price_monthly, currency, tags, is_featured, sort_rank, availability, created_at, updated_at
      )
      select
        t.id,
        t.tenant_id,
        case when lower(coalesce(t.visibility, 'private')) = 'public' then true else false end as is_visible,
        coalesce(t.base_salary_monthly, 0),
        'USD',
        '[]'::jsonb,
        false,
        0,
        'available',
        now(),
        now()
      from ece_agent_templates t
      where t.tenant_id is not null
      on conflict (tenant_id, agent_id) do nothing;
    `).catch(() => {});
  })();

  return ensurePromise;
}

