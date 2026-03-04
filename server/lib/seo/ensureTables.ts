import { db } from "@db";
import { sql } from "drizzle-orm";

export async function ensureSeoAutopilotTables() {
  await db.execute(sql`
    create table if not exists seo_page_snapshots (
      id serial primary key,
      tenant_id integer not null references tenants(id) on delete cascade,
      site_id integer references tenant_sites(id) on delete set null,
      env text not null default 'prod',
      url text not null,
      path text not null,
      status_code int not null,
      redirect_chain jsonb not null default '[]'::jsonb,
      title text,
      meta_description text,
      canonical text,
      robots text,
      open_graph jsonb not null default '{}'::jsonb,
      twitter jsonb not null default '{}'::jsonb,
      json_ld_present boolean not null default false,
      breadcrumbs_present boolean not null default false,
      internal_links_count int not null default 0,
      performance_summary jsonb not null default '{}'::jsonb,
      collected_at timestamptz not null default now()
    );
  `);

  await db.execute(sql`
    create index if not exists seo_page_snapshots_tenant_collected_idx
      on seo_page_snapshots(tenant_id, collected_at desc);
  `);

  await db.execute(sql`
    create index if not exists seo_page_snapshots_tenant_path_idx
      on seo_page_snapshots(tenant_id, path);
  `);

  await db.execute(sql`
    create table if not exists seo_issues (
      id serial primary key,
      tenant_id integer not null references tenants(id) on delete cascade,
      site_id integer references tenant_sites(id) on delete set null,
      env text not null default 'prod',
      path text not null,
      issue_type text not null,
      severity int not null default 2,
      status text not null default 'open',
      message text not null,
      evidence jsonb not null default '{}'::jsonb,
      first_seen_at timestamptz not null default now(),
      last_seen_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);

  await db.execute(sql`
    create unique index if not exists seo_issues_tenant_env_path_type_idx
      on seo_issues(tenant_id, env, path, issue_type);
  `);

  await db.execute(sql`
    create index if not exists seo_issues_tenant_status_idx
      on seo_issues(tenant_id, status, last_seen_at desc);
  `);

  await db.execute(sql`
    create table if not exists seo_recommendations (
      id serial primary key,
      tenant_id integer not null references tenants(id) on delete cascade,
      site_id integer references tenant_sites(id) on delete set null,
      env text not null default 'prod',
      action_type text not null,
      target_path text not null,
      proposed_change jsonb not null default '{}'::jsonb,
      expected_impact jsonb not null default '{}'::jsonb,
      severity int not null default 2,
      confidence int not null default 50,
      status text not null default 'proposed',
      evidence jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);

  await db.execute(sql`
    create index if not exists seo_recommendations_tenant_status_idx
      on seo_recommendations(tenant_id, status, updated_at desc);
  `);

  await db.execute(sql`
    create table if not exists seo_patches (
      id serial primary key,
      tenant_id integer not null references tenants(id) on delete cascade,
      site_id integer references tenant_sites(id) on delete set null,
      env text not null default 'prod',
      patch_type text not null,
      target_path text not null,
      feature_flag text not null,
      requires_approval boolean not null default false,
      status text not null default 'proposed',
      patch jsonb not null default '{}'::jsonb,
      guardrails jsonb not null default '{}'::jsonb,
      evidence jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      applied_at timestamptz,
      rolled_back_at timestamptz
    );
  `);

  await db.execute(sql`
    create index if not exists seo_patches_tenant_status_idx
      on seo_patches(tenant_id, status, updated_at desc);
  `);
}

