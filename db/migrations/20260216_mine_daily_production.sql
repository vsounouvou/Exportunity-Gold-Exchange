-- Mine daily production (Pro UX: "Production Today")

create table if not exists mine_daily_production (
  id uuid primary key default gen_random_uuid(),
  tenant_id integer not null references tenants(id) on delete cascade,
  company_id integer not null,
  user_id integer not null references ece_users(id) on delete cascade,
  site_id text,
  date text not null,
  grams_total numeric(20,3) not null,
  purity_percent numeric(5,2),
  shift text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists mine_daily_production_unique
  on mine_daily_production(tenant_id, company_id, site_id, date);

create index if not exists mine_daily_production_tenant_company_date_idx
  on mine_daily_production(tenant_id, company_id, date);

create index if not exists mine_daily_production_tenant_user_date_idx
  on mine_daily_production(tenant_id, user_id, date);

