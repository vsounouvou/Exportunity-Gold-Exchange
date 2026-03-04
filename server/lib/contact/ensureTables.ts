import { db } from "@db";
import { sql } from "drizzle-orm";

export async function ensureContactTables() {
  await db.execute(sql`
    create type contact_status as enum ('lead','warm','customer','vip','dnc');
  `).catch(() => {});
  await db.execute(sql`
    create type contact_consent_status as enum ('unknown','opt_in','opt_out');
  `).catch(() => {});
  await db.execute(sql`
    create type contact_identity_kind as enum ('email','phone');
  `).catch(() => {});
  await db.execute(sql`
    create type contact_import_status as enum ('queued','running','completed','failed','rolled_back');
  `).catch(() => {});
  await db.execute(sql`
    create type tenant_contact_scope as enum ('tenant_shared','private_to_user','shared_to_team');
  `).catch(() => {});
  await db.execute(sql`
    create type tenant_contact_status as enum ('active','archived');
  `).catch(() => {});

  await db.execute(sql`
    create table if not exists contact_messages (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      first_name text not null,
      last_name text not null,
      email text not null,
      phone text,
      company text,
      message text not null,
      source text,
      notify_status text not null default 'pending',
      notify_error text,
      notified_at timestamptz,
      user_agent text,
      ip text,
      created_at timestamptz not null default now()
    );
  `);

  await db.execute(sql`
    create index if not exists contact_messages_tenant_created_idx
      on contact_messages (tenant_id, created_at desc);
  `);

  await db.execute(sql`create table if not exists contacts (id serial primary key);`);
  await db.execute(sql`alter table contacts add column if not exists tenant_id int references tenants(id) on delete cascade;`);
  await db.execute(sql`alter table contacts alter column tenant_id drop not null;`).catch(() => {});
  await db.execute(sql`alter table contacts add column if not exists display_name text;`);
  await db.execute(sql`alter table contacts add column if not exists given_name text;`);
  await db.execute(sql`alter table contacts add column if not exists family_name text;`);
  await db.execute(sql`alter table contacts add column if not exists company text;`);
  await db.execute(sql`alter table contacts add column if not exists job_title text;`);
  await db.execute(sql`alter table contacts add column if not exists phones jsonb not null default '[]'::jsonb;`);
  await db.execute(sql`alter table contacts add column if not exists emails jsonb not null default '[]'::jsonb;`);
  await db.execute(sql`alter table contacts add column if not exists primary_phone_e164 text;`);
  await db.execute(sql`alter table contacts add column if not exists primary_email text;`);
  await db.execute(sql`alter table contacts add column if not exists tags jsonb not null default '[]'::jsonb;`);
  await db.execute(sql`alter table contacts add column if not exists status contact_status not null default 'lead';`).catch(() => {});
  await db.execute(sql`alter table contacts add column if not exists consent_status contact_consent_status not null default 'unknown';`).catch(() => {});
  await db.execute(sql`alter table contacts add column if not exists is_dnc boolean not null default false;`);
  await db.execute(sql`alter table contacts add column if not exists source text;`);
  await db.execute(sql`alter table contacts add column if not exists source_system text not null default 'manual';`);
  await db.execute(sql`alter table contacts add column if not exists source_reference_id text;`);
  await db.execute(sql`alter table contacts add column if not exists notes text;`);
  await db.execute(sql`alter table contacts add column if not exists metadata jsonb not null default '{}'::jsonb;`);
  await db.execute(sql`alter table contacts add column if not exists imported_from_wix boolean not null default false;`);
  await db.execute(sql`alter table contacts add column if not exists import_batch_id int;`);
  await db.execute(sql`alter table contacts add column if not exists dedupe_key text;`);
  await db.execute(sql`alter table contacts add column if not exists created_by_user_id int references ece_users(id) on delete set null;`);
  await db.execute(sql`alter table contacts add column if not exists created_at timestamptz not null default now();`);
  await db.execute(sql`alter table contacts add column if not exists updated_at timestamptz not null default now();`);

  // Backward-compatible legacy import columns.
  await db.execute(sql`alter table contacts add column if not exists wix_contact_id text;`);
  await db.execute(sql`alter table contacts add column if not exists first_name text;`);
  await db.execute(sql`alter table contacts add column if not exists last_name text;`);
  await db.execute(sql`alter table contacts add column if not exists email text;`);
  await db.execute(sql`alter table contacts add column if not exists phone text;`);
  await db.execute(sql`alter table contacts add column if not exists phone_normalized text;`);
  await db.execute(sql`alter table contacts add column if not exists is_subscriber boolean not null default false;`);
  await db.execute(sql`alter table contacts add column if not exists is_member boolean not null default false;`);
  await db.execute(sql`alter table contacts add column if not exists member_since timestamptz;`);
  await db.execute(sql`alter table contacts add column if not exists lead_id int;`);

  await db.execute(sql`create index if not exists contacts_tenant_created_idx on contacts (tenant_id, created_at desc);`);
  await db.execute(sql`create index if not exists contacts_tenant_status_idx on contacts (tenant_id, status, created_at desc);`);
  await db.execute(sql`create index if not exists contacts_tenant_primary_email_idx on contacts (tenant_id, primary_email);`);
  await db.execute(sql`create index if not exists contacts_tenant_primary_phone_idx on contacts (tenant_id, primary_phone_e164);`);
  await db.execute(sql`create index if not exists contacts_tenant_email_idx on contacts (tenant_id, email);`);
  await db.execute(sql`create index if not exists contacts_tenant_phone_idx on contacts (tenant_id, phone_normalized);`);
  await db.execute(sql`create index if not exists contacts_imported_from_wix_idx on contacts (imported_from_wix);`);
  await db.execute(sql`create unique index if not exists contacts_dedupe_key_uniq on contacts (dedupe_key);`).catch(() => {});
  await db.execute(sql`create index if not exists contacts_created_by_user_idx on contacts (created_by_user_id);`);

  await db.execute(sql`
    create table if not exists contact_identities (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      contact_id int not null references contacts(id) on delete cascade,
      kind contact_identity_kind not null,
      value text not null,
      value_normalized text not null,
      is_primary boolean not null default false,
      created_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`
    create unique index if not exists contact_identities_tenant_kind_value_uniq
      on contact_identities (tenant_id, kind, value_normalized);
  `);
  await db.execute(sql`
    create index if not exists contact_identities_tenant_contact_idx
      on contact_identities (tenant_id, contact_id);
  `);

  await db.execute(sql`
    create table if not exists contact_tags (
      id serial primary key,
      tenant_id int references tenants(id) on delete cascade,
      contact_id int not null references contacts(id) on delete cascade,
      tag text not null,
      created_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`alter table contact_tags add column if not exists tenant_id int references tenants(id) on delete cascade;`);
  await db.execute(sql`
    create index if not exists contact_tags_tenant_contact_idx
      on contact_tags (tenant_id, contact_id);
  `);
  await db.execute(sql`
    create index if not exists contact_tags_tenant_tag_idx
      on contact_tags (tenant_id, tag);
  `);
  await db.execute(sql`
    create index if not exists contact_tags_tag_ci_idx
      on contact_tags ((lower(tag)));
  `).catch(() => {});

  await db.execute(sql`
    create table if not exists contact_sources (
      id serial primary key,
      tenant_id int references tenants(id) on delete cascade,
      contact_id int not null references contacts(id) on delete cascade,
      source text not null,
      source_system text not null default 'manual',
      source_reference_id text,
      form_name text,
      page_url text,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`alter table contact_sources add column if not exists tenant_id int references tenants(id) on delete cascade;`);
  await db.execute(sql`
    create index if not exists contact_sources_tenant_contact_idx
      on contact_sources (tenant_id, contact_id);
  `);
  await db.execute(sql`
    create index if not exists contact_sources_tenant_source_idx
      on contact_sources (tenant_id, source);
  `);

  await db.execute(sql`
    create table if not exists contact_import_batches (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      source text not null,
      account_label text,
      status contact_import_status not null default 'queued',
      mode text not null default 'dry_run',
      stats jsonb not null default '{}'::jsonb,
      errors jsonb not null default '[]'::jsonb,
      created_by_user_id int,
      started_at timestamptz,
      completed_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`
    create index if not exists contact_import_batches_tenant_created_idx
      on contact_import_batches (tenant_id, created_at desc);
  `);
  await db.execute(sql`
    create index if not exists contact_import_batches_tenant_status_idx
      on contact_import_batches (tenant_id, status, created_at desc);
  `);

  await db.execute(sql`
    create table if not exists contact_import_rows (
      id serial primary key,
      batch_id int not null references contact_import_batches(id) on delete cascade,
      tenant_id int not null references tenants(id) on delete cascade,
      source_reference_id text,
      raw jsonb not null default '{}'::jsonb,
      result text,
      error text,
      contact_id int references contacts(id) on delete set null,
      created_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`create index if not exists contact_import_rows_batch_idx on contact_import_rows (batch_id, id);`);
  await db.execute(sql`create index if not exists contact_import_rows_tenant_idx on contact_import_rows (tenant_id, id);`);

  await db.execute(sql`
    create table if not exists contact_attachments (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      contact_id int references contacts(id) on delete set null,
      type text not null default 'business_card',
      file_url text not null,
      extracted_json jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`
    create index if not exists contact_attachments_tenant_created_idx
      on contact_attachments (tenant_id, created_at desc);
  `);
  await db.execute(sql`
    create index if not exists contact_attachments_tenant_contact_idx
      on contact_attachments (tenant_id, contact_id);
  `);

  await db.execute(sql`
    create table if not exists tenant_contacts (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      contact_id int not null references contacts(id) on delete cascade,
      scope tenant_contact_scope not null default 'tenant_shared',
      owner_user_id int references ece_users(id) on delete set null,
      status tenant_contact_status not null default 'active',
      tags jsonb not null default '[]'::jsonb,
      notes text,
      crm_status contact_status not null default 'lead',
      consent_status contact_consent_status not null default 'unknown',
      is_dnc boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);
  await db.execute(sql`create unique index if not exists tenant_contacts_tenant_contact_uniq on tenant_contacts (tenant_id, contact_id);`);
  await db.execute(sql`create index if not exists tenant_contacts_tenant_status_idx on tenant_contacts (tenant_id, status, updated_at desc);`);
  await db.execute(sql`create index if not exists tenant_contacts_tenant_crm_status_idx on tenant_contacts (tenant_id, crm_status, updated_at desc);`);
  await db.execute(sql`create index if not exists tenant_contacts_tenant_consent_idx on tenant_contacts (tenant_id, consent_status, updated_at desc);`);
  await db.execute(sql`create index if not exists tenant_contacts_contact_idx on tenant_contacts (contact_id);`);

  // If the instance has only one tenant, safely backfill legacy contact rows.
  const tenantRows = await db.execute(sql`select id from tenants order by id asc limit 2`);
  const tenantCount = Array.isArray((tenantRows as any)?.rows) ? (tenantRows as any).rows.length : 0;
  if (tenantCount === 1) {
    const tenantId = Number((tenantRows as any).rows[0]?.id);
    if (Number.isFinite(tenantId) && tenantId > 0) {
      await db.execute(sql`update contacts set tenant_id = ${tenantId} where tenant_id is null`);
      await db.execute(sql`update contact_tags set tenant_id = ${tenantId} where tenant_id is null`);
      await db.execute(sql`update contact_sources set tenant_id = ${tenantId} where tenant_id is null`);
    }
  }

  // Backfill tenant_contacts links from legacy contacts.tenant_id (idempotent).
  await db.execute(sql`
    insert into tenant_contacts (tenant_id, contact_id, scope, status, tags, notes, crm_status, consent_status, is_dnc, created_at, updated_at)
    select
      c.tenant_id,
      c.id,
      'tenant_shared'::tenant_contact_scope,
      'active'::tenant_contact_status,
      coalesce(c.tags, '[]'::jsonb),
      c.notes,
      coalesce(c.status, 'lead'::contact_status),
      coalesce(c.consent_status, 'unknown'::contact_consent_status),
      coalesce(c.is_dnc, false),
      coalesce(c.created_at, now()),
      coalesce(c.updated_at, now())
    from contacts c
    where c.tenant_id is not null
      and not exists (
        select 1 from tenant_contacts tc where tc.tenant_id = c.tenant_id and tc.contact_id = c.id
      );
  `).catch(() => {});
}
