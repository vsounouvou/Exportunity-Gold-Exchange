import { db } from "@db";
import { sql } from "drizzle-orm";

let ensured = false;

export async function ensureCadastreTables() {
  if (ensured) return;

  await db.execute(sql`
    do $$
    begin
      if not exists (select 1 from pg_type where typname = 'cadastre_site_type') then
        create type cadastre_site_type as enum ('ARTISANAL','SEMI_INDUSTRIAL','INDUSTRIAL','UNKNOWN');
      end if;
    end
    $$;
  `);
  await db.execute(sql`
    do $$
    begin
      if not exists (select 1 from pg_type where typname = 'cadastre_status') then
        create type cadastre_status as enum ('VERIFIED','PENDING','INACTIVE');
      end if;
    end
    $$;
  `);
  await db.execute(sql`
    do $$
    begin
      if not exists (select 1 from pg_type where typname = 'cadastre_risk_level') then
        create type cadastre_risk_level as enum ('LOW','MEDIUM','HIGH');
      end if;
    end
    $$;
  `);
  await db.execute(sql`
    do $$
    begin
      if not exists (select 1 from pg_type where typname = 'cadastre_source') then
        create type cadastre_source as enum ('OFFICIAL_CADASTRE','MANUAL','IMPORT');
      end if;
    end
    $$;
  `);
  await db.execute(sql`
    do $$
    begin
      if not exists (select 1 from pg_type where typname = 'cadastre_sync_status') then
        create type cadastre_sync_status as enum ('SUCCESS','PARTIAL','FAILED');
      end if;
    end
    $$;
  `);

  await db.execute(sql`
    create table if not exists mining_sites (
      id uuid primary key default gen_random_uuid(),
      tenant_id integer not null references tenants(id) on delete cascade,
      country text not null default 'CI',
      cadastre_name text not null,
      permit_number text,
      region text,
      department text,
      commune text,
      holder_name text,
      site_type cadastre_site_type not null default 'UNKNOWN',
      status cadastre_status not null default 'PENDING',
      risk_level cadastre_risk_level not null default 'MEDIUM',
      lat double precision not null,
      lng double precision not null,
      geometry_json jsonb,
      source cadastre_source not null default 'IMPORT',
      source_ref text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);

  await db.execute(sql`
    create unique index if not exists mining_sites_tenant_permit_unique
      on mining_sites(tenant_id, country, permit_number);
  `);
  await db.execute(sql`create index if not exists mining_sites_tenant_country_idx on mining_sites(tenant_id, country);`);
  await db.execute(sql`create index if not exists mining_sites_tenant_cadastre_name_idx on mining_sites(tenant_id, cadastre_name);`);
  await db.execute(sql`create index if not exists mining_sites_tenant_region_idx on mining_sites(tenant_id, region);`);
  await db.execute(sql`create index if not exists mining_sites_tenant_status_idx on mining_sites(tenant_id, status);`);

  await db.execute(sql`
    create table if not exists mining_site_reports (
      id uuid primary key default gen_random_uuid(),
      tenant_id integer not null references tenants(id) on delete cascade,
      mining_site_id uuid not null references mining_sites(id) on delete cascade,
      report_date timestamp not null,
      production_g numeric(20,3),
      declared_by_user_id integer references ece_users(id) on delete set null,
      created_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`
    create index if not exists mining_site_reports_tenant_site_date_idx
      on mining_site_reports(tenant_id, mining_site_id, report_date);
  `);

  await db.execute(sql`
    create table if not exists cadastre_sync_runs (
      id uuid primary key default gen_random_uuid(),
      tenant_id integer not null references tenants(id) on delete cascade,
      status cadastre_sync_status not null default 'FAILED',
      source_mode text not null default 'scrape',
      records_fetched integer not null default 0,
      records_upserted integer not null default 0,
      error_message text,
      started_at timestamptz not null default now(),
      finished_at timestamptz,
      created_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`
    create index if not exists cadastre_sync_runs_tenant_started_idx on cadastre_sync_runs(tenant_id, started_at);
  `);

  await db.execute(sql`
    create table if not exists demo_links (
      id uuid primary key default gen_random_uuid(),
      tenant_id integer not null references tenants(id) on delete cascade,
      token_hash text not null,
      label text not null,
      scopes text[] not null default array['cadastre:read','opportunities:read']::text[],
      expires_at timestamptz not null,
      created_by_user_id integer references ece_users(id) on delete set null,
      created_at timestamptz not null default now(),
      revoked_at timestamptz
    );
  `);
  await db.execute(sql`create unique index if not exists demo_links_token_hash_unique on demo_links(token_hash);`);
  await db.execute(sql`create index if not exists demo_links_tenant_expiry_idx on demo_links(tenant_id, expires_at);`);

  ensured = true;
}
