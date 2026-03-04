import { db } from "@db";
import { sql } from "drizzle-orm";

export async function ensureEngineeringKernelTables() {
  await db.execute(sql`
    create table if not exists engineering_requests (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      project_id text,
      inferred_intent text not null,
      input jsonb not null default '{}'::jsonb,
      status text not null default 'pending',
      last_error text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);

  await db.execute(sql`
    create index if not exists engineering_requests_tenant_created_idx
      on engineering_requests (tenant_id, created_at desc);
  `);

  await db.execute(sql`
    create index if not exists engineering_requests_tenant_status_idx
      on engineering_requests (tenant_id, status, updated_at desc);
  `);

  await db.execute(sql`
    create table if not exists machines (
      id serial primary key,
      tenant_id int not null references tenants(id) on delete cascade,
      engineering_request_id int references engineering_requests(id) on delete set null,
      project_id text,
      machine_family text not null,
      compiler_version text not null,
      status text not null default 'compiled',
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);

  await db.execute(sql`
    create index if not exists machines_tenant_created_idx
      on machines (tenant_id, created_at desc);
  `);

  await db.execute(sql`
    create index if not exists machines_tenant_status_idx
      on machines (tenant_id, status, updated_at desc);
  `);

  await db.execute(sql`
    create index if not exists machines_request_idx
      on machines (engineering_request_id);
  `);

  await db.execute(sql`
    create table if not exists machine_revisions (
      id serial primary key,
      machine_id int not null references machines(id) on delete cascade,
      revision int not null,
      parameters_hash text not null,
      generator_version text not null,
      recipe jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
  `);

  await db.execute(sql`
    create unique index if not exists machine_revisions_machine_revision_idx
      on machine_revisions (machine_id, revision);
  `);

  await db.execute(sql`
    create index if not exists machine_revisions_machine_created_idx
      on machine_revisions (machine_id, created_at desc);
  `);

  await db.execute(sql`
    create table if not exists fabrication_jobs (
      id serial primary key,
      revision_id int not null references machine_revisions(id) on delete cascade,
      node_id text not null,
      status text not null default 'queued',
      logs text,
      artifacts_location text,
      metadata jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);

  await db.execute(sql`
    create index if not exists fabrication_jobs_node_created_idx
      on fabrication_jobs (node_id, created_at desc);
  `);

  await db.execute(sql`
    create index if not exists fabrication_jobs_status_updated_idx
      on fabrication_jobs (status, updated_at desc);
  `);

  await db.execute(sql`
    create index if not exists fabrication_jobs_revision_idx
      on fabrication_jobs (revision_id, created_at desc);
  `);

  await db.execute(sql`
    create table if not exists machine_edit_actions (
      id serial primary key,
      revision_id int not null references machine_revisions(id) on delete cascade,
      action_json jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
  `);

  await db.execute(sql`
    create index if not exists machine_edit_actions_revision_created_idx
      on machine_edit_actions (revision_id, created_at desc);
  `);

  await db.execute(sql`
    create table if not exists preview_artifacts (
      id serial primary key,
      revision_id int not null references machine_revisions(id) on delete cascade,
      kind text not null,
      path text not null,
      sha256 text,
      created_at timestamptz not null default now()
    );
  `);

  await db.execute(sql`
    create unique index if not exists preview_artifacts_revision_kind_idx
      on preview_artifacts (revision_id, kind);
  `);

  await db.execute(sql`
    create index if not exists preview_artifacts_revision_created_idx
      on preview_artifacts (revision_id, created_at desc);
  `);
}
