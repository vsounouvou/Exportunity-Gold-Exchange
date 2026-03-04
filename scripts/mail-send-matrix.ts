import "../env";
import fs from "fs/promises";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { agentMailboxes, tenants } from "../db/schema";
import { sendEmailAsAgent } from "../server/lib/mail/sender";
import { normalizeAndValidateRecipients } from "../server/lib/mail/outboundPolicy";

type RolePreset = {
  label: string;
  candidates: string[];
  subject: string;
  body: string;
};

type CliOptions = {
  tenantKey: string;
  recipients: string[];
  agentKeys: string[];
};

const ROLE_PRESETS: RolePreset[] = [
  {
    label: "Platform Lead",
    candidates: ["diego_alvarez", "marketing", "platform_lead"],
    subject: "Introduction to Bourse de l'Or Platform",
    body: [
      "Thank you for your continued interest in our platform.",
      "I would like to share a concise overview of how our operations platform supports verified trade workflows.",
      "If helpful, I can schedule a short walkthrough focused on your priorities.",
    ].join("\n\n"),
  },
  {
    label: "Operations Coordinator",
    candidates: ["samuel_mensah", "ops", "coordinator", "support"],
    subject: "Following Up on Our Discussion",
    body: [
      "I am following up regarding your current operational priorities.",
      "Our team can align execution, approvals, and reporting with your required timeline.",
      "Please confirm your preferred next step and we will proceed immediately.",
    ].join("\n\n"),
  },
  {
    label: "Treasury / Payments",
    candidates: ["awa_bamba", "wallet", "accounting", "treasury"],
    subject: "Treasury and Payments Coordination",
    body: [
      "I am reaching out to align on treasury and payment execution.",
      "We can support controlled disbursement, reconciliation, and payment visibility from a single workflow.",
      "Please share the payment scope and we will send a structured execution plan.",
    ].join("\n\n"),
  },
  {
    label: "Marketplace Lead",
    candidates: ["jean_baptiste_ouattara", "client_hunter", "sales", "procurement"],
    subject: "Presentation of Our Gold Trading Platform",
    body: [
      "I am sharing a concise introduction to our marketplace capabilities.",
      "Our platform supports supplier coordination, structured execution, and auditable transaction records.",
      "If you agree, we can move directly to a live operational demonstration.",
    ].join("\n\n"),
  },
];

function parseArgs(argv: string[]): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = String(argv[i] || "").trim();
    if (!key.startsWith("--")) continue;
    const value = String(argv[i + 1] || "").trim();
    if (!value || value.startsWith("--")) continue;
    parsed[key.slice(2)] = value;
    i += 1;
  }
  return parsed;
}

async function parseRecipients(rawCsv: string, filePath: string) {
  const csvRecipients = String(rawCsv || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const fileRecipients = filePath
    ? (await fs.readFile(filePath, "utf8"))
        .split(/\r?\n/g)
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];
  return [...csvRecipients, ...fileRecipients];
}

async function resolveOptions(argv: string[]): Promise<CliOptions> {
  const args = parseArgs(argv);
  const tenantKey = String(args.tenant || "bdo").trim().toLowerCase();
  const recipientsRaw = await parseRecipients(String(args.to || ""), String(args.toFile || args.to_file || ""));
  const validated = normalizeAndValidateRecipients(recipientsRaw);
  if (!validated.recipients.length) {
    throw new Error("Provide at least one valid recipient via --to or --to-file.");
  }
  if (validated.invalid.length) {
    throw new Error(`Invalid recipient email(s): ${validated.invalid.join(", ")}`);
  }
  const agentKeys = String(args.agents || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return {
    tenantKey,
    recipients: validated.recipients,
    agentKeys,
  };
}

async function resolveTenant(tenantKey: string) {
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.key, tenantKey as any),
  });
  if (!tenant) throw new Error(`Tenant not found: ${tenantKey}`);
  return tenant;
}

async function findAvailableMailboxKeys(tenantId: number) {
  const rows = await db
    .select({ agentKey: agentMailboxes.agentKey })
    .from(agentMailboxes)
    .where(and(eq(agentMailboxes.tenantId, tenantId), eq(agentMailboxes.isEnabled, true)));
  return new Set(rows.map((row) => String(row.agentKey || "").trim().toLowerCase()).filter(Boolean));
}

function pickRoleAgents(available: Set<string>) {
  return ROLE_PRESETS.map((preset) => {
    const selected = preset.candidates.find((candidate) => available.has(candidate)) || preset.candidates[0];
    return { ...preset, selectedAgentKey: selected };
  });
}

async function sendMatrix(options: CliOptions) {
  const tenant = await resolveTenant(options.tenantKey);
  const availableMailboxKeys = await findAvailableMailboxKeys(tenant.id);
  const roleAgents =
    options.agentKeys.length > 0
      ? options.agentKeys.map((agentKey) => ({
          label: agentKey,
          selectedAgentKey: agentKey,
          subject: "Introduction to Bourse de l'Or Platform",
          body: [
            "Thank you for your time.",
            "I am reaching out to introduce our operational capabilities and align on next steps.",
            "Please let us know your preferred timeline and we will coordinate immediately.",
          ].join("\n\n"),
        }))
      : pickRoleAgents(availableMailboxKeys);

  const startedAt = new Date().toISOString();
  const results: Array<Record<string, unknown>> = [];

  for (const roleAgent of roleAgents) {
    for (const recipient of options.recipients) {
      const entryBase = {
        role: roleAgent.label,
        agentKey: roleAgent.selectedAgentKey,
        recipient,
      };
      try {
        const sendResult = await sendEmailAsAgent({
          tenantId: tenant.id,
          agentKey: roleAgent.selectedAgentKey,
          actorType: "agent",
          actorAgentId: null,
          to: [recipient],
          subject: roleAgent.subject,
          textBody: roleAgent.body,
          htmlBody: null,
          bypassApproval: true,
          requestedByUserId: null,
          actionRequestId: null,
          correlationId: `matrix:${tenant.key}:${roleAgent.selectedAgentKey}:${Date.now()}`,
        });
        results.push({
          ...entryBase,
          ok: true,
          status: sendResult.message.status,
          messageId: sendResult.message.messageId,
          from: sendResult.message.from,
          replyTo: sendResult.message.replyTo,
        });
      } catch (error: any) {
        results.push({
          ...entryBase,
          ok: false,
          error: String(error?.message || error || "unknown_error"),
        });
      }
    }
  }

  const failed = results.filter((item) => item.ok === false);
  const payload = {
    ok: failed.length === 0,
    startedAt,
    finishedAt: new Date().toISOString(),
    tenant: { id: tenant.id, key: tenant.key, name: tenant.name },
    recipients: options.recipients,
    results,
    totals: {
      total: results.length,
      failed: failed.length,
      succeeded: results.length - failed.length,
    },
  };

  console.log(JSON.stringify(payload, null, 2));
  if (failed.length > 0) {
    throw new Error(`Delivery matrix failed for ${failed.length} message(s).`);
  }
}

async function main() {
  const options = await resolveOptions(process.argv.slice(2));
  await sendMatrix(options);
}

main().catch((error) => {
  console.error("[mail-send-matrix] failed:", error?.message || error);
  process.exit(1);
});
