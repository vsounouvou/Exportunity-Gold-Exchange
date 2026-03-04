-- Tenant-scoped contact visibility (canonical contacts + tenant_contacts join)
--
-- This migration introduces `tenant_contacts` as the *only* scoping mechanism
-- for tenant visibility. Legacy `contacts.tenant_id` remains for backward-compat,
-- but list queries should use tenant_contacts -> contacts joins.
--
-- Rollback (manual):
--   - drop table tenant_contacts;
--   - drop index contacts_created_by_user_idx;
--   - drop index contacts_dedupe_key_uniq;
--   - alter table contacts drop column created_by_user_id;
--   - alter table contacts drop column dedupe_key;
--   - drop type tenant_contact_status;
--   - drop type tenant_contact_scope;

do $$
begin
  create type tenant_contact_scope as enum ('tenant_shared','private_to_user','shared_to_team');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type tenant_contact_status as enum ('active','archived');
exception
  when duplicate_object then null;
end $$;

alter table contacts add column if not exists dedupe_key text;
alter table contacts add column if not exists created_by_user_id int references ece_users(id) on delete set null;

create unique index if not exists contacts_dedupe_key_uniq on contacts (dedupe_key);
create index if not exists contacts_created_by_user_idx on contacts (created_by_user_id);

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

create unique index if not exists tenant_contacts_tenant_contact_uniq on tenant_contacts (tenant_id, contact_id);
create index if not exists tenant_contacts_tenant_status_idx on tenant_contacts (tenant_id, status, updated_at desc);
create index if not exists tenant_contacts_tenant_crm_status_idx on tenant_contacts (tenant_id, crm_status, updated_at desc);
create index if not exists tenant_contacts_tenant_consent_idx on tenant_contacts (tenant_id, consent_status, updated_at desc);
create index if not exists tenant_contacts_contact_idx on tenant_contacts (contact_id);

-- Backfill tenant_contacts links from legacy contacts.tenant_id (idempotent).
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

