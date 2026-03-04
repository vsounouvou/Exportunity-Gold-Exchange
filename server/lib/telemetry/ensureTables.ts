import { db } from "@db";
import { sql } from "drizzle-orm";

function normalizeDomain(domain: string) {
  return domain.trim().toLowerCase();
}

function defaultCanonicalHost(domain: string) {
  const d = normalizeDomain(domain);
  if (d.startsWith("www.")) return d.slice("www.".length);
  return d;
}

export async function ensureTelemetryTables() {
  await db.execute(sql`
    create table if not exists tenant_sites (
      id serial primary key,
      tenant_id integer not null references tenants(id) on delete cascade,
      env text not null default 'prod',
      domain text not null,
      canonical_host text not null,
      default_locale text not null default 'en',
      default_country text,
      url_patterns jsonb not null default '{}'::jsonb,
      created_at timestamp default current_timestamp,
      updated_at timestamp default current_timestamp
    );
  `);

  await db.execute(sql`
    create unique index if not exists tenant_sites_tenant_env_domain_idx
      on tenant_sites(tenant_id, env, domain);
  `);

  await db.execute(sql`
    create index if not exists tenant_sites_tenant_idx
      on tenant_sites(tenant_id);
  `);

  // Seed production site rows for known tenant domains.
  const rows = await db.query.tenants.findMany({ columns: { id: true, key: true, domains: true } });
  for (const tenant of rows) {
    const domains = (tenant.domains ?? []).map((d) => String(d || "").trim()).filter(Boolean);
    for (const domain of domains) {
      const normalized = normalizeDomain(domain);
      if (!normalized) continue;
      if (normalized === "localhost" || normalized === "127.0.0.1") continue;
      if (/^\d+\.\d+\.\d+\.\d+$/.test(normalized)) continue;

      const canonical = defaultCanonicalHost(normalized);
      await db.execute(sql`
        insert into tenant_sites (tenant_id, env, domain, canonical_host, default_locale, updated_at)
        values (${tenant.id}, 'prod', ${normalized}, ${canonical}, 'en', now())
        on conflict (tenant_id, env, domain)
        do update set canonical_host = excluded.canonical_host, updated_at = now();
      `);
    }
  }

  await db.execute(sql`
    create table if not exists telemetry_sessions (
      id serial primary key,
      tenant_id integer not null references tenants(id) on delete cascade,
      site_id integer references tenant_sites(id) on delete set null,
      env text not null default 'prod',
      session_id text not null,
      anon_id_hash text not null,
      user_id_hash text,
      started_at timestamptz not null,
      last_seen_at timestamptz not null,
      entry_path text,
      exit_path text,
      referrer text,
      device_class text,
      locale text,
      bot_score int not null default 0,
      is_bot boolean not null default false,
      event_count int not null default 0,
      page_views int not null default 0,
      errors int not null default 0,
      scroll_max int not null default 0,
      updated_at timestamptz not null default now()
    );
  `);

  await db.execute(sql`
    create unique index if not exists telemetry_sessions_tenant_session_idx
      on telemetry_sessions(tenant_id, session_id);
  `);

  await db.execute(sql`
    create index if not exists telemetry_sessions_tenant_last_seen_idx
      on telemetry_sessions(tenant_id, last_seen_at desc);
  `);

  await db.execute(sql`
    create index if not exists telemetry_sessions_tenant_user_idx
      on telemetry_sessions(tenant_id, user_id_hash);
  `);

  await db.execute(sql`
    create table if not exists telemetry_events (
      id serial primary key,
      tenant_id integer not null references tenants(id) on delete cascade,
      site_id integer references tenant_sites(id) on delete set null,
      env text not null default 'prod',
      territory_id integer references geo_territories(id) on delete set null,
      event_type text not null,
      occurred_at timestamptz not null,
      received_at timestamptz not null default now(),
      path text not null,
      canonical_url text,
      referrer text,
      last_route text,
      session_id text not null,
      anon_id_hash text not null,
      user_id_hash text,
      device_class text,
      locale text,
      bot_score int not null default 0,
      is_bot boolean not null default false,
      payload jsonb not null default '{}'::jsonb
    );
  `);

  await db.execute(sql`
    create index if not exists telemetry_events_tenant_time_idx
      on telemetry_events(tenant_id, occurred_at desc);
  `);

  await db.execute(sql`
    create index if not exists telemetry_events_tenant_type_time_idx
      on telemetry_events(tenant_id, event_type, occurred_at desc);
  `);

  await db.execute(sql`
    create index if not exists telemetry_events_tenant_session_idx
      on telemetry_events(tenant_id, session_id);
  `);

  await db.execute(sql`
    create index if not exists telemetry_events_tenant_path_time_idx
      on telemetry_events(tenant_id, path, occurred_at desc);
  `);

  await db.execute(sql`
    create table if not exists telemetry_route_daily (
      id serial primary key,
      tenant_id integer not null references tenants(id) on delete cascade,
      site_id integer references tenant_sites(id) on delete set null,
      env text not null default 'prod',
      day text not null,
      path text not null,
      page_views int not null default 0,
      unique_sessions int not null default 0,
      unique_users int not null default 0,
      metrics jsonb not null default '{}'::jsonb,
      updated_at timestamptz not null default now()
    );
  `);

  await db.execute(sql`
    create unique index if not exists telemetry_route_daily_tenant_day_path_idx
      on telemetry_route_daily(tenant_id, env, day, path);
  `);

  await db.execute(sql`
    create index if not exists telemetry_route_daily_tenant_day_idx
      on telemetry_route_daily(tenant_id, day);
  `);
}
