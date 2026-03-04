import { db } from "@db";
import { sql } from "drizzle-orm";

export async function ensureEmailAdminTables() {
  await db.execute(sql`
    create table if not exists email_domains (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      domain text not null,
      type text not null default 'primary',
      is_verified boolean not null default false,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);

  await db.execute(sql`
    create unique index if not exists email_domains_tenant_domain_idx
      on email_domains (tenant_id, domain);
  `);

  await db.execute(sql`
    create index if not exists email_domains_tenant_created_idx
      on email_domains (tenant_id, created_at desc);
  `);

  await db.execute(sql`
    create table if not exists email_accounts (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      company_id int,
      owner_user_id int,
      address text not null,
      local_part text not null,
      domain_id int not null references email_domains(id) on delete restrict,
      status text not null default 'active',
      quota_mb int,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);

  await db.execute(sql`
    create unique index if not exists email_accounts_tenant_address_idx
      on email_accounts (tenant_id, address);
  `);

  await db.execute(sql`
    create index if not exists email_accounts_tenant_company_created_idx
      on email_accounts (tenant_id, company_id, created_at desc);
  `);

  await db.execute(sql`
    create index if not exists email_accounts_tenant_owner_created_idx
      on email_accounts (tenant_id, owner_user_id, created_at desc);
  `);

  await db.execute(sql`
    create table if not exists email_aliases (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      source_account_id int references email_accounts(id) on delete set null,
      source_address text not null,
      destination text not null,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
  `);

  await db.execute(sql`
    create index if not exists email_aliases_tenant_source_idx
      on email_aliases (tenant_id, source_address);
  `);

  await db.execute(sql`
    create index if not exists email_aliases_tenant_created_idx
      on email_aliases (tenant_id, created_at desc);
  `);
}

