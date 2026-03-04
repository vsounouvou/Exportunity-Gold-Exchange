import "../env";
import { db } from "../db";
import { sql } from "drizzle-orm";

type RowShape = { [key: string]: unknown };

async function queryRows(statement: string) {
  const result = await db.execute(sql.raw(statement));
  const rows = (result as any)?.rows;
  return Array.isArray(rows) ? (rows as RowShape[]) : [];
}

async function main() {
  const tenantKey = String(process.argv[2] || "bdo").trim().toLowerCase();
  const agentKey = String(process.argv[3] || "awa_bamba").trim().toLowerCase();

  const tenantRows = await queryRows(
    `select id, key, name from tenants where lower(key)='${tenantKey.replace(/'/g, "''")}' limit 1`,
  );
  const tenant = tenantRows[0];
  if (!tenant?.id) {
    console.error(`[mail-debug] tenant not found: ${tenantKey}`);
    process.exit(1);
  }
  const tenantId = Number(tenant.id);

  const mailboxRows = await queryRows(
    `select tenant_id, agent_key, email, is_enabled, metadata->'provision' as provision, updated_at
     from agent_mailboxes
     where tenant_id=${tenantId}
     order by updated_at desc
     limit 30`,
  );

  const inboundCounts = await queryRows(
    `select agent_key, count(*)::int as inbound_count, max(created_at) as last_inbound_at
     from email_messages
     where tenant_id=${tenantId} and direction='inbound'
     group by agent_key
     order by last_inbound_at desc nulls last
     limit 30`,
  );

  const agentMessages = await queryRows(
    `select direction, status, from_email, to_json, subject, created_at
     from email_messages
     where tenant_id=${tenantId} and agent_key='${agentKey.replace(/'/g, "''")}'
     order by created_at desc
     limit 20`,
  );

  const maildirRows = await queryRows(
    `select tenant_id, agent_key, direction, status, from_email, to_json, subject, maildir_path, created_at
     from email_messages
     where maildir_path ilike '%/${agentKey.replace(/_/g, ".").replace(/'/g, "''")}.bdo/%'
     order by created_at desc
     limit 20`,
  );

  const sendLogs = await queryRows(
    `select status, error, resolved_from_email, resolved_reply_to_email, smtp_username_used, metadata, created_at
     from email_send_logs
     where tenant_id=${tenantId} and actor_agent_key='${agentKey.replace(/'/g, "''")}'
     order by created_at desc
     limit 20`,
  );

  console.log(
    JSON.stringify(
      {
        tenant: { id: tenantId, key: tenant.key, name: tenant.name },
        mailboxRows,
        inboundCounts,
        agentMessages,
        maildirRows,
        sendLogs,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("[mail-debug] failed:", error);
  process.exit(1);
});
