import { db } from "@db";
import { sql } from "drizzle-orm";

export async function ensureAgentEnums() {
  // Ensure new agent keys exist in the DB enum without requiring manual migrations.
  await db.execute(sql`
    do $$
    begin
      if exists (select 1 from pg_type where typname = 'agent_key') then
        begin
          alter type agent_key add value if not exists 'seo_autopilot';
        exception
          when duplicate_object then null;
        end;
      end if;
    end $$;
  `);
}

