import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@db";
import {
  agentEmailIdentities,
  agentMailboxes,
  emailMessages,
  emailThreadInsights,
  emailWorkOrders,
} from "@db/schema";
import { normalizeAgentKey } from "./agentSlugs";

export type AgentEmailContextSnapshot = {
  attached: boolean;
  mailboxEmail: string | null;
  agentKey: string | null;
  openWorkOrders: number;
  recentCount: number;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  summary: string;
  reason: string | null;
};

type ResolveAgentEmailContextInput = {
  tenantId: number | null | undefined;
  agentId?: number | null;
  agentName?: string | null;
  agentRole?: string | null;
  requestedAgentKey?: string | null;
  limitRecent?: number;
  limitInsights?: number;
};

function normalizeDate(value: unknown) {
  if (!(value instanceof Date)) return null;
  if (!Number.isFinite(value.getTime())) return null;
  return value.toISOString();
}

function clipText(value: unknown, max: number) {
  const text = String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "";
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function uniqueStrings(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = String(raw || "").trim();
    if (!value) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function summarizeInsight(summaryJson: unknown) {
  const summaryObj =
    summaryJson && typeof summaryJson === "object" && !Array.isArray(summaryJson)
      ? (summaryJson as Record<string, unknown>)
      : {};
  const bulletsRaw = Array.isArray(summaryObj.summaryBullets) ? summaryObj.summaryBullets : [];
  const bullets = bulletsRaw
    .map((entry) => clipText(entry, 140))
    .filter(Boolean)
    .slice(0, 2);
  return bullets;
}

function summarizeActions(nextActionsJson: unknown) {
  const items = Array.isArray(nextActionsJson) ? nextActionsJson : [];
  const labels = items
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const row = item as Record<string, unknown>;
      const title = clipText(row.title, 90);
      const description = clipText(row.description, 90);
      return title || description;
    })
    .filter(Boolean)
    .slice(0, 2);
  return labels;
}

function buildContextSummary(params: {
  mailboxEmail: string;
  agentKey: string;
  openWorkOrders: number;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  recentLines: string[];
  insightLines: string[];
}) {
  const lines: string[] = [];
  lines.push(`Mailbox: ${params.mailboxEmail} (agentKey=${params.agentKey})`);
  lines.push(`Open email work orders: ${params.openWorkOrders}`);
  lines.push(
    `Last inbound: ${params.lastInboundAt || "none"} | Last outbound: ${params.lastOutboundAt || "none"}`,
  );

  lines.push("Recent email activity:");
  if (params.recentLines.length) lines.push(...params.recentLines);
  else lines.push("- none");

  if (params.insightLines.length) {
    lines.push("Thread insights:");
    lines.push(...params.insightLines);
  }

  return lines.join("\n");
}

function buildNoContextSummary(reason: string) {
  return `Email context unavailable: ${reason}.`;
}

export async function resolveAgentEmailContext(
  input: ResolveAgentEmailContextInput,
): Promise<AgentEmailContextSnapshot> {
  const tenantId = Number(input.tenantId);
  if (!Number.isFinite(tenantId) || tenantId <= 0) {
    return {
      attached: false,
      mailboxEmail: null,
      agentKey: null,
      openWorkOrders: 0,
      recentCount: 0,
      lastInboundAt: null,
      lastOutboundAt: null,
      summary: buildNoContextSummary("tenant_missing"),
      reason: "tenant_missing",
    };
  }

  const agentId =
    typeof input.agentId === "number" && Number.isFinite(input.agentId) && input.agentId > 0
      ? Math.trunc(input.agentId)
      : null;

  const candidateKeys = uniqueStrings([
    normalizeAgentKey(String(input.requestedAgentKey || "")),
    normalizeAgentKey(String(input.agentName || "")),
    normalizeAgentKey(String(input.agentRole || "")),
    normalizeAgentKey(String(process.env.MAIL_DEFAULT_AGENT_KEY || "")),
    "support",
  ]);

  const identity =
    agentId != null
      ? await db.query.agentEmailIdentities.findFirst({
          where: and(
            eq(agentEmailIdentities.tenantId, tenantId),
            eq(agentEmailIdentities.agentId, agentId),
            eq(agentEmailIdentities.isEnabled, true),
          ),
        })
      : null;

  const identityAgentKey = normalizeAgentKey(String(identity?.agentKey || ""));
  if (identityAgentKey) {
    candidateKeys.unshift(identityAgentKey);
  }

  let mailbox =
    identity?.mailboxId != null
      ? await db.query.agentMailboxes.findFirst({
          where: and(
            eq(agentMailboxes.id, identity.mailboxId),
            eq(agentMailboxes.tenantId, tenantId),
            eq(agentMailboxes.isEnabled, true),
          ),
        })
      : null;

  if (!mailbox) {
    const fromEmail = String(identity?.fromEmail || "").trim().toLowerCase();
    if (fromEmail && fromEmail.includes("@")) {
      mailbox = await db.query.agentMailboxes.findFirst({
        where: and(
          eq(agentMailboxes.tenantId, tenantId),
          eq(agentMailboxes.email, fromEmail),
          eq(agentMailboxes.isEnabled, true),
        ),
      });
    }
  }

  if (!mailbox) {
    for (const key of candidateKeys) {
      // eslint-disable-next-line no-await-in-loop
      const row = await db.query.agentMailboxes.findFirst({
        where: and(
          eq(agentMailboxes.tenantId, tenantId),
          eq(agentMailboxes.agentKey, key),
          eq(agentMailboxes.isEnabled, true),
        ),
      });
      if (row) {
        mailbox = row;
        break;
      }
    }
  }

  if (!mailbox) {
    return {
      attached: false,
      mailboxEmail: null,
      agentKey: identityAgentKey || candidateKeys[0] || null,
      openWorkOrders: 0,
      recentCount: 0,
      lastInboundAt: null,
      lastOutboundAt: null,
      summary: buildNoContextSummary("mailbox_not_found"),
      reason: "mailbox_not_found",
    };
  }

  const limitRecent = Math.max(3, Math.min(20, Math.trunc(Number(input.limitRecent || 8))));
  const limitInsights = Math.max(0, Math.min(6, Math.trunc(Number(input.limitInsights || 3))));

  const [recent, openRows, insights] = await Promise.all([
    db.query.emailMessages.findMany({
      where: and(eq(emailMessages.tenantId, tenantId), eq(emailMessages.mailboxId, mailbox.id)),
      orderBy: [desc(emailMessages.createdAt)],
      limit: limitRecent,
    }),
    db
      .select({ count: sql<number>`count(*)` })
      .from(emailWorkOrders)
      .where(
        and(
          eq(emailWorkOrders.tenantId, tenantId),
          eq(emailWorkOrders.mailboxId, mailbox.id),
          sql`${emailWorkOrders.status} <> 'replied'`,
        ),
      ),
    limitInsights > 0
      ? db.query.emailThreadInsights.findMany({
          where: and(eq(emailThreadInsights.tenantId, tenantId), eq(emailThreadInsights.mailboxId, mailbox.id)),
          orderBy: [desc(emailThreadInsights.updatedAt)],
          limit: limitInsights,
        })
      : Promise.resolve([]),
  ]);

  let lastInboundAt: string | null = null;
  let lastOutboundAt: string | null = null;
  const recentLines = recent.map((row) => {
    const direction = String(row.direction || "").toLowerCase() === "outbound" ? "OUT" : "IN";
    const status = String(row.status || "").trim().toLowerCase();
    const at = normalizeDate(row.createdAt) || "unknown_time";
    if (direction === "IN" && !lastInboundAt) lastInboundAt = at;
    if (direction === "OUT" && !lastOutboundAt) lastOutboundAt = at;
    const from = clipText(row.fromEmail, 80) || "(unknown)";
    const toList = Array.isArray(row.toJson)
      ? row.toJson.map((entry) => clipText(entry, 60)).filter(Boolean).slice(0, 2)
      : [];
    const to = toList.length ? toList.join(", ") : "(none)";
    const subject = clipText(row.subject, 100) || "(no subject)";
    const preview = clipText(row.textBody || row.htmlBody || "", 160);
    return `- [${direction}/${status || "unknown"}] ${at} | from=${from} | to=${to} | subject="${subject}"${preview ? ` | preview="${preview}"` : ""}`;
  });

  const insightLines = insights.flatMap((insight) => {
    const bullets = summarizeInsight(insight.summaryJson);
    const nextActions = summarizeActions(insight.nextActionsJson);
    const updatedAt = normalizeDate(insight.updatedAt);
    const parts: string[] = [];
    if (bullets.length) {
      parts.push(`summary=${bullets.join(" ; ")}`);
    }
    if (nextActions.length) {
      parts.push(`next=${nextActions.join(" ; ")}`);
    }
    if (!parts.length) return [];
    return [`- ${updatedAt || "unknown_time"} | ${parts.join(" | ")}`];
  });

  const openWorkOrders = Number(openRows[0]?.count || 0);
  const summary = buildContextSummary({
    mailboxEmail: mailbox.email,
    agentKey: mailbox.agentKey,
    openWorkOrders,
    lastInboundAt,
    lastOutboundAt,
    recentLines,
    insightLines,
  });

  return {
    attached: true,
    mailboxEmail: mailbox.email,
    agentKey: mailbox.agentKey,
    openWorkOrders,
    recentCount: recent.length,
    lastInboundAt,
    lastOutboundAt,
    summary,
    reason: null,
  };
}

