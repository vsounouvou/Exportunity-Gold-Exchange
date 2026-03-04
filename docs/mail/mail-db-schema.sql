-- "Mail DB" schema (separate PostgreSQL database used by Postfix/Dovecot)
-- This DB is NOT the app DB; the platform app connects for mailbox provisioning only.
--
-- Required tables:
-- - virtual_domains
-- - virtual_users
-- - virtual_aliases
--
-- Naming convention:
-- - Domain: boursedelor.com
-- - Maildir base: /var/vmail
-- - Maildir per mailbox: /var/vmail/boursedelor.com/<localpart>/Maildir

create table if not exists virtual_domains (
  id serial primary key,
  name text not null unique
);

create table if not exists virtual_users (
  id serial primary key,
  domain_id int not null references virtual_domains(id) on delete cascade,
  email text not null unique,
  password_hash text not null,
  quota_mb int not null default 2048,
  is_enabled boolean not null default true,
  maildir text not null,
  created_at timestamptz not null default now()
);

create table if not exists virtual_aliases (
  id serial primary key,
  domain_id int not null references virtual_domains(id) on delete cascade,
  source text not null,
  destination text not null,
  unique(domain_id, source)
);

-- Insert domain once.
insert into virtual_domains(name)
values ('boursedelor.com')
on conflict (name) do nothing;

