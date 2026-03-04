import "../env";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { tenants } from "../db/schema";
import { runMailIndexer } from "../server/lib/mail/indexer.ts";

type IndexerOpts = {
  tenantKey?: string;
  agentKey?: string;
  limitPerMailbox?: number;
};

function parseArgs(argv: string[]): IndexerOpts {
  const opts: IndexerOpts = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--tenant" && next) opts.tenantKey = String(next);
    if (arg === "--agent" && next) opts.agentKey = String(next);
    if (arg === "--limit" && next) opts.limitPerMailbox = Number(next);
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const tenantKey = String(opts.tenantKey || "bdo").trim();

  const tenant = await db.query.tenants.findFirst({ where: eq(tenants.key, tenantKey as any) });
  if (!tenant) {
    console.error(`[mail:index] Tenant not found: ${tenantKey}`);
    process.exit(1);
  }

  const result = await runMailIndexer({
    tenantId: tenant.id,
    agentKey: opts.agentKey ?? null,
    limitPerMailbox: opts.limitPerMailbox ?? 250,
  });

  const indexed = result.indexed ?? 0;
  const skipped = result.skipped ?? 0;
  const mailboxes = Array.isArray(result.mailboxes) ? result.mailboxes : [];
  const warnings = mailboxes.filter((m) => Array.isArray(m.errors) && m.errors.length > 0);

  console.log(
    JSON.stringify(
      {
        ok: result.ok,
        tenantId: result.tenantId,
        indexed,
        skipped,
        mailboxes: mailboxes.map((m) => ({
          agentKey: m.agentKey,
          email: m.email,
          indexed: m.indexed,
          skipped: m.skipped,
          maildirExists: m.maildirExists,
          errors: m.errors,
        })),
      },
      null,
      2,
    ),
  );

  if (warnings.length) {
    console.error(
      `[mail:index] Completed with warnings (${warnings.length}). First: ${warnings[0]!.agentKey}: ${warnings[0]!.errors[0]}`,
    );
    process.exitCode = 2;
  }
}

main().catch((err) => {
  console.error("[mail:index] Failed:", err);
  process.exit(1);
});
