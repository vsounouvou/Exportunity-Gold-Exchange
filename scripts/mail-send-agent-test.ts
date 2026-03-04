import "../env";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { tenants } from "../db/schema";
import { sendEmailAsAgent } from "../server/lib/mail/sender";

type CliArgs = {
  tenantKey: string;
  fromAgentKey: string;
  to: string[];
  subject: string;
  body: string;
};

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {
    tenantKey: "bdo",
    fromAgentKey: "diego_alvarez",
    to: [],
    subject: "",
    body: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (!next) continue;
    if (arg === "--tenant") out.tenantKey = String(next).trim();
    if (arg === "--from") out.fromAgentKey = String(next).trim();
    if (arg === "--to") out.to = String(next).split(",").map((value) => value.trim()).filter(Boolean);
    if (arg === "--subject") out.subject = String(next);
    if (arg === "--body") out.body = String(next);
  }

  const timestamp = new Date().toISOString();
  if (!out.subject) out.subject = `[Diag] agent mail send ${timestamp}`;
  if (!out.body) out.body = `Diagnostic test message generated at ${timestamp}.`;
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.to.length) {
    throw new Error("Missing --to recipient list");
  }

  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.key, args.tenantKey as any),
    columns: { id: true, key: true, name: true },
  });
  if (!tenant) throw new Error(`Tenant not found: ${args.tenantKey}`);

  const result = await sendEmailAsAgent({
    tenantId: tenant.id,
    agentKey: args.fromAgentKey,
    actorType: "agent",
    actorAgentId: null,
    to: args.to,
    subject: args.subject,
    textBody: args.body,
    htmlBody: null,
    bypassApproval: true,
    requestedByUserId: null,
    actionRequestId: null,
    correlationId: `diag:mail-send:${Date.now()}`,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        tenant: { id: tenant.id, key: tenant.key, name: tenant.name },
        fromAgentKey: args.fromAgentKey,
        fromAgentName: null,
        to: args.to,
        subject: args.subject,
        result,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("[mail-send-agent-test] failed:", error);
  process.exit(1);
});
