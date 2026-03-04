import { db } from "@db";
import { sql } from "drizzle-orm";
import { resolveAgentRuntimeEnv } from "./visibility";

export async function ensureAgentVisibilityColumns() {
  const runtimeEnv = resolveAgentRuntimeEnv();

  await db.execute(sql`alter table agents add column if not exists env text not null default 'prod';`);
  await db.execute(sql`alter table agents add column if not exists is_test boolean not null default false;`);
  await db.execute(sql`alter table agents add column if not exists is_visible boolean not null default true;`);

  await db.execute(sql`create index if not exists agents_env_idx on agents(env);`);
  await db.execute(sql`create index if not exists agents_visibility_idx on agents(status, is_test, is_visible);`);

  await db.execute(sql`update agents set env = ${runtimeEnv} where env is null or btrim(env) = '';`);
  await db.execute(sql`
    update agents
    set
      is_test = true,
      is_visible = false,
      status = 'archived',
      updated_at = now()
    where
      (
        lower(coalesce(name, '')) like '%test%'
        or lower(coalesce(role, '')) like '%test%'
        or lower(coalesce(metadata::jsonb->>'test', 'false')) in ('1', 'true', 'yes', 'on')
        or lower(coalesce(metadata::jsonb->>'isTest', 'false')) in ('1', 'true', 'yes', 'on')
      )
      and (
        is_test is distinct from true
        or is_visible is distinct from false
        or status is distinct from 'archived'
      );
  `);
}
