import { eq } from "drizzle-orm";

import { db } from "@db";
import { messages } from "@db/schema";
import { getTenantContentQuarantineReason } from "../server/lib/tenant-content-guard";
import { ensureTenants, getTenantByKey } from "../server/lib/tenants";

const apply = process.argv.includes("--apply");

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function main() {
  await ensureTenants();
  const tenant = await getTenantByKey("exportunity");
  if (!tenant?.id) throw new Error("Exportunity tenant was not found");

  const rows = await db.query.messages.findMany({
    where: eq(messages.tenantId, tenant.id),
    columns: {
      id: true,
      content: true,
      metadata: true,
      createdAt: true,
    },
  });

  const candidates = rows
    .map((row) => ({
      row,
      reason: getTenantContentQuarantineReason({
        tenantKey: tenant.key,
        content: row.content,
        metadata: row.metadata,
      }),
    }))
    .filter((candidate) => candidate.reason === "legacy_bdo_context");

  if (apply) {
    const quarantinedAt = new Date().toISOString();
    for (const candidate of candidates) {
      await db
        .update(messages)
        .set({
          metadata: {
            ...asRecord(candidate.row.metadata),
            tenantContextStatus: "quarantined",
            tenantContextReason: candidate.reason,
            tenantContextQuarantinedAt: quarantinedAt,
            tenantContextQuarantinedBy: "quarantine-exportunity-cross-tenant-messages",
          },
        })
        .where(eq(messages.id, candidate.row.id));
    }
  }

  // Do not print historical content: the identifiers are sufficient for audit.
  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: apply ? "applied" : "dry-run",
        tenant: tenant.key,
        matched: candidates.length,
        messages: candidates.map(({ row, reason }) => ({
          id: row.id,
          createdAt: row.createdAt,
          reason,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("[quarantine-exportunity-cross-tenant-messages] failed", error);
  process.exit(1);
});
