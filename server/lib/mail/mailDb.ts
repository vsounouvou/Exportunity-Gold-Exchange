import pgPkg from "pg";
import "../../../env";

type PgPool = InstanceType<(typeof pgPkg)["Pool"]>;

let pool: PgPool | null = null;
let schemaEnsured: Promise<void> | null = null;

function requireMailDatabaseUrl() {
  const url = String(process.env.MAIL_DATABASE_URL || "").trim();
  if (!url) {
    throw new Error("MAIL_DATABASE_URL must be set to provision mailboxes.");
  }
  return url;
}

export function getMailDbPool() {
  if (pool) return pool;
  const { Pool } = pgPkg;
  pool = new Pool({ connectionString: requireMailDatabaseUrl() }) as PgPool;
  return pool;
}

async function ensureMailDbSchema() {
  if (schemaEnsured) return schemaEnsured;
  schemaEnsured = (async () => {
    const p = getMailDbPool();

    await p.query(`
      create table if not exists virtual_domains (
        id serial primary key,
        name text not null unique
      );
    `);

    await p.query(`
      create table if not exists virtual_users (
        id serial primary key,
        domain_id int not null references virtual_domains(id) on delete cascade,
        email text not null unique,
        password_hash text not null,
        quota_mb int default 2048,
        is_enabled boolean default true,
        maildir text not null,
        created_at timestamptz default now()
      );
    `);

    await p.query(`
      create table if not exists virtual_aliases (
        id serial primary key,
        domain_id int not null references virtual_domains(id) on delete cascade,
        source text not null,
        destination text not null,
        unique(domain_id, source)
      );
    `);

    await p.query(`create index if not exists virtual_users_domain_idx on virtual_users(domain_id);`);
    await p.query(`create index if not exists virtual_users_enabled_idx on virtual_users(is_enabled);`);
    await p.query(`create index if not exists virtual_aliases_domain_idx on virtual_aliases(domain_id);`);
  })();

  return schemaEnsured;
}

export async function ensureVirtualDomain(domain: string) {
  const name = String(domain || "").trim().toLowerCase();
  if (!name) throw new Error("domain required");
  await ensureMailDbSchema();
  const p = getMailDbPool();
  const result = await p.query<{ id: number }>(
    `insert into virtual_domains(name)
     values ($1)
     on conflict (name) do update set name = excluded.name
     returning id`,
    [name],
  );
  return result.rows[0]!;
}

export async function getVirtualUserByEmail(email: string) {
  const e = String(email || "").trim().toLowerCase();
  if (!e) throw new Error("email required");
  await ensureMailDbSchema();
  const p = getMailDbPool();
  const result = await p.query<{
    id: number;
    email: string;
    is_enabled: boolean;
    quota_mb: number;
    maildir: string;
  }>(
    `select id, email, is_enabled, quota_mb, maildir
     from virtual_users
     where lower(email) = lower($1)
     limit 1`,
    [e],
  );
  return result.rows[0] ?? null;
}

export async function createVirtualUser(opts: {
  domainId: number;
  email: string;
  passwordHash: string;
  quotaMb: number;
  isEnabled: boolean;
  maildir: string;
}) {
  await ensureMailDbSchema();
  const p = getMailDbPool();
  const result = await p.query<{ id: number }>(
    `insert into virtual_users(domain_id, email, password_hash, quota_mb, is_enabled, maildir)
     values ($1, $2, $3, $4, $5, $6)
     returning id`,
    [
      opts.domainId,
      String(opts.email || "").trim().toLowerCase(),
      String(opts.passwordHash || ""),
      Number(opts.quotaMb || 0),
      !!opts.isEnabled,
      String(opts.maildir || ""),
    ],
  );
  return result.rows[0]!;
}

export async function ensureVirtualAlias(opts: {
  domain: string;
  source: string;
  destination: string;
}) {
  const domain = String(opts.domain || "").trim().toLowerCase();
  const source = String(opts.source || "").trim().toLowerCase();
  const destination = String(opts.destination || "").trim().toLowerCase();
  if (!domain) throw new Error("domain required");
  if (!source || !source.includes("@")) throw new Error("source email required");
  if (!destination || !destination.includes("@")) throw new Error("destination email required");

  await ensureMailDbSchema();
  const p = getMailDbPool();
  const domainRow = await ensureVirtualDomain(domain);
  await p.query(
    `insert into virtual_aliases(domain_id, source, destination)
     values ($1, $2, $3)
     on conflict (domain_id, source) do update set destination = excluded.destination`,
    [domainRow.id, source, destination],
  );
  return { ok: true as const };
}

export async function setVirtualUserEnabled(id: number, enabled: boolean) {
  await ensureMailDbSchema();
  const p = getMailDbPool();
  await p.query(`update virtual_users set is_enabled=$2 where id=$1`, [id, !!enabled]);
}
