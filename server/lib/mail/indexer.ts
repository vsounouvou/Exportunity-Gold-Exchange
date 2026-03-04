import fs from "fs";
import path from "path";
import { simpleParser } from "mailparser";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@db";
import {
  agentMailboxes,
  emailAttachmentsMeta,
  emailMessages,
  emailSendLogs,
  emailThreads,
  emailWorkOrders,
  actionRequests,
  actionResults,
  messages,
} from "@db/schema";
import { normalizeAgentKey } from "./agentSlugs";
import { normalizeEmailSubject } from "./threading";
import { MAIL_DELIVERY_STATUSES } from "./deliveryStatus";

type IndexerMailboxResult = {
  mailboxId: number;
  agentKey: string;
  email: string;
  maildir: string | null;
  maildirExists: boolean;
  indexed: number;
  skipped: number;
  errors: string[];
};

export type MailIndexerRunResult = {
  ok: true;
  tenantId: number;
  startedAt: string;
  finishedAt: string;
  indexed: number;
  skipped: number;
  mailboxes: IndexerMailboxResult[];
};

type IndexerOpts = {
  tenantId: number;
  agentKey?: string | null;
  limitPerMailbox?: number;
};

function uniqStrings(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const v = String(raw || "").trim();
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function parseEmailParts(email: string): { localPart: string; domain: string } | null {
  const raw = String(email || "").trim();
  const at = raw.lastIndexOf("@");
  if (at <= 0) return null;
  const localPart = raw.slice(0, at).trim().toLowerCase();
  const domain = raw.slice(at + 1).trim().toLowerCase();
  if (!localPart || !domain) return null;
  return { localPart, domain };
}

function parseCsvEnv(value: unknown): string[] {
  const raw = String(value ?? "").trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function parseIntEnv(value: unknown, fallback: number): number {
  const n = Number(String(value ?? "").trim());
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : fallback;
}

function classifySender(fromEmail: string): "ceo" | "internal" | "external" {
  const email = String(fromEmail || "").trim().toLowerCase();
  if (!email) return "external";

  const ceoList = new Set(parseCsvEnv(process.env.CEO_EMAILS).map((v) => v.toLowerCase()).filter(Boolean));
  ceoList.add("vs@exportunity.net");
  ceoList.add("chairman@boursedelor.com");
  ceoList.add("vital@boursedelor.com");

  if (ceoList.has(email)) return "ceo";

  const domain = email.split("@")[1] || "";
  if (domain === "boursedelor.com" || domain === "exportunity.net") return "internal";
  return "external";
}

function computeDueAt(params: { createdAt: Date; fromEmail: string }) {
  const senderClass = classifySender(params.fromEmail);
  const ceoMinutes = parseIntEnv(process.env.MAIL_SLA_CEO_MINUTES, 15);
  const internalMinutes = parseIntEnv(process.env.MAIL_SLA_INTERNAL_MINUTES, 60);
  const externalMinutes = parseIntEnv(process.env.MAIL_SLA_EXTERNAL_MINUTES, 24 * 60);

  const minutes = senderClass === "ceo" ? ceoMinutes : senderClass === "internal" ? internalMinutes : externalMinutes;
  return {
    senderClass,
    dueAt: new Date(params.createdAt.getTime() + minutes * 60 * 1000),
  };
}

function safeListFilesWithMtime(dir: string, errors: string[]) {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isFile())
      .map((d) => {
        const filePath = path.join(dir, d.name);
        const stat = fs.statSync(filePath);
        return { filePath, mtimeMs: stat.mtimeMs };
      })
      .filter((x) => Number.isFinite(x.mtimeMs));
  } catch (err: any) {
    const code = typeof err?.code === "string" ? err.code : "read_failed";
    errors.push(`maildir_read_failed:${code}:${dir}`);
    return [] as Array<{ filePath: string; mtimeMs: number }>;
  }
}

function detectMaildirFolders(maildirRoot: string) {
  const inbox = [path.join(maildirRoot, "new"), path.join(maildirRoot, "cur")];

  const sentCandidates = [
    path.join(maildirRoot, ".Sent"),
    path.join(maildirRoot, ".sent"),
    path.join(maildirRoot, ".Sent Messages"),
    path.join(maildirRoot, ".Sent Items"),
    path.join(maildirRoot, ".envoye"),
    path.join(maildirRoot, ".Envoyes"),
    path.join(maildirRoot, ".Envoy\u00e9s"),
  ];

  const sent = sentCandidates
    .flatMap((base) => [path.join(base, "new"), path.join(base, "cur")])
    .filter((p) => fs.existsSync(p));

  return { inbox, sent };
}

function getMaildirBases() {
  const base = String(process.env.MAILDIR_BASE || "").trim();
  const bases = uniqStrings([base, ...parseCsvEnv(process.env.MAILDIR_BASES)]);

  // Common defaults (docker-mailserver uses /var/mail; Postfix virtual uses /var/vmail).
  for (const fallback of ["/var/mail", "/var/vmail", "/home/vital/infra/mailserver/maildata"]) {
    if (!bases.includes(fallback)) bases.push(fallback);
  }

  return bases.filter(Boolean);
}

function hasMaildirFolders(root: string) {
  try {
    return fs.existsSync(path.join(root, "new")) || fs.existsSync(path.join(root, "cur"));
  } catch {
    return false;
  }
}

function resolveMaildirPath(candidates: string[]) {
  const attempted: string[] = [];

  const pushAttempt = (p: string) => {
    const normalized = String(p || "").trim().replace(/\\/g, "/").replace(/\/+$/g, "");
    if (!normalized) return;
    if (attempted.includes(normalized)) return;
    attempted.push(normalized);
  };

  for (const cand of candidates) {
    const normalized = String(cand || "").trim().replace(/\\/g, "/").replace(/\/+$/g, "");
    if (!normalized) continue;

    const direct = normalized;
    const withMaildir = normalized.endsWith("/Maildir") ? normalized : path.join(normalized, "Maildir");
    const withoutMaildir = normalized.endsWith("/Maildir") ? normalized.replace(/\/Maildir$/g, "") : null;

    for (const p of uniqStrings([direct, withMaildir, withoutMaildir ?? ""])) {
      if (!p) continue;
      pushAttempt(p);
      if (!fs.existsSync(p)) continue;
      if (!hasMaildirFolders(p)) continue;
      return { resolved: p, attempted };
    }
  }

  return { resolved: null as string | null, attempted };
}

function normalizeMessageId(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const trimmed = raw.startsWith("<") && raw.endsWith(">") ? raw : raw;
  return trimmed || null;
}

function looksLikeDeliveryBounce(params: { fromEmail: string; subject: string; textBody: string | null }) {
  const from = String(params.fromEmail || "").toLowerCase();
  const subject = String(params.subject || "").toLowerCase();
  const text = String(params.textBody || "").toLowerCase();

  const fromLikely = from.includes("mailer-daemon") || from.includes("postmaster");
  const subjectLikely =
    subject.includes("undeliver") ||
    subject.includes("delivery status notification") ||
    subject.includes("returned to sender") ||
    subject.includes("failure notice");
  const bodyLikely = text.includes("diagnostic-code") || text.includes("status: 5.") || text.includes("delivery failed");

  return (fromLikely && (subjectLikely || bodyLikely)) || (subjectLikely && bodyLikely);
}

function compactErrorText(value: string | null | undefined) {
  const text = String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!text) return null;
  return text.slice(0, 900);
}

function extractMessageIdsFromBounceText(textBody: string | null | undefined) {
  const text = String(textBody || "");
  if (!text.trim()) return [] as string[];

  const found: string[] = [];
  const patterns = [
    /(?:message-id|original-message-id|x-original-message-id)\s*:\s*(<[^>\s]+>)/gi,
    /\bmessage id\b\s*[:=]\s*(<[^>\s]+>)/gi,
  ];

  for (const re of patterns) {
    let match: RegExpExecArray | null = null;
    // eslint-disable-next-line no-cond-assign
    while ((match = re.exec(text))) {
      const value = normalizeMessageId(match[1] || "");
      if (value) found.push(value);
      if (found.length > 25) break;
    }
    if (found.length > 25) break;
  }

  return uniqStrings(found);
}

async function reconcileOutboundBounce(opts: {
  tenantId: number;
  mailboxId: number;
  bounceMessage: {
    id: number;
    fromEmail: string;
    subject: string;
    createdAt: Date;
    inReplyTo: string | null;
    references: string[];
    textBody: string | null;
  };
}) {
  const ids = uniqStrings(
    [
      normalizeMessageId(opts.bounceMessage.inReplyTo) || "",
      ...opts.bounceMessage.references.map((r) => normalizeMessageId(r) || ""),
      ...extractMessageIdsFromBounceText(opts.bounceMessage.textBody),
    ].filter(Boolean),
  );
  if (!ids.length) return;

  const original = await db.query.emailMessages.findFirst({
    where: and(
      eq(emailMessages.tenantId, opts.tenantId),
      eq(emailMessages.mailboxId, opts.mailboxId),
      eq(emailMessages.direction, "outbound"),
      inArray(emailMessages.messageId, ids),
    ),
  });
  if (!original) return;

  const bounceError =
    compactErrorText(opts.bounceMessage.textBody) ||
    `Delivery failed (${String(opts.bounceMessage.subject || "").trim() || "bounce"})`;

  try {
    const originalMeta = (original.metadata && typeof original.metadata === "object") ? (original.metadata as any) : {};
    await db
      .update(emailMessages)
      .set({
        status: MAIL_DELIVERY_STATUSES.BOUNCED,
        metadata: {
          ...originalMeta,
          delivery: {
            ...(originalMeta.delivery || {}),
            bouncedAt: opts.bounceMessage.createdAt.toISOString(),
            bounceSubject: String(opts.bounceMessage.subject || "").trim() || null,
            bounceFrom: String(opts.bounceMessage.fromEmail || "").trim().toLowerCase() || null,
            bounceMessageId: opts.bounceMessage.id,
            bounceError,
          },
        },
      })
      .where(eq(emailMessages.id, original.id));
  } catch {
    // ignore (non-fatal)
  }

  const actionRequestId = (original as any).actionRequestId ? Number((original as any).actionRequestId) : null;
  if (actionRequestId && Number.isFinite(actionRequestId)) {
    try {
      await db
        .update(emailSendLogs)
        .set({
          status: MAIL_DELIVERY_STATUSES.BOUNCED,
          error: bounceError,
          updatedAt: new Date(),
        })
        .where(and(eq(emailSendLogs.tenantId, opts.tenantId), eq(emailSendLogs.actionRequestId, actionRequestId)));
    } catch {
      // ignore
    }

    const action = await db.query.actionRequests.findFirst({
      where: and(eq(actionRequests.id, actionRequestId), eq(actionRequests.tenantId, opts.tenantId)),
    });

    if (action && action.status !== "FAILED") {
      const finishedAt = new Date();
      await db
        .update(actionRequests)
        .set({ status: "FAILED", finishedAt, updatedAt: finishedAt })
        .where(and(eq(actionRequests.id, actionRequestId), eq(actionRequests.tenantId, opts.tenantId)));

      await db.insert(actionResults).values({
        tenantId: opts.tenantId,
        actionRequestId,
        result: { actionType: "SEND_EMAIL", bounced: true, originalMessageId: original.messageId ?? null },
        error: { message: bounceError },
        createdAt: finishedAt,
      });

      const conversationId = String((action as any).relatedConversationId || "").trim();
      if (conversationId) {
        await db.insert(messages).values({
          content: `Email delivery failed (bounce). ${bounceError}`,
          fromAgentId: null,
          toAgentId: null,
          type: "system",
          status: "sent",
          deliveredAt: finishedAt,
          conversationId,
          metadata: {
            kind: "email_bounce",
            actionRequestId,
            mailboxId: opts.mailboxId,
            emailMessageId: original.id,
          },
        });
      }
    }
  }
}

async function getOrCreateThread(opts: {
  mailboxId: number;
  tenantId: number;
  agentKey: string;
  subject: string;
  when: Date;
}) {
  const subjectNorm = normalizeEmailSubject(opts.subject);
  const existing = await db.query.emailThreads.findFirst({
    where: and(eq(emailThreads.mailboxId, opts.mailboxId), eq(emailThreads.subjectNorm, subjectNorm)),
  });
  if (existing) {
    await db.update(emailThreads).set({ lastMessageAt: opts.when }).where(eq(emailThreads.id, existing.id));
    return existing;
  }

  const [created] = await db
    .insert(emailThreads)
    .values({
      tenantId: opts.tenantId,
      agentKey: opts.agentKey,
      mailboxId: opts.mailboxId,
      subjectNorm,
      subject: opts.subject,
      lastMessageAt: opts.when,
      createdAt: opts.when,
    })
    .returning();

  return created;
}

async function indexMessageFile(opts: {
  tenantId: number;
  agentKey: string;
  mailboxId: number;
  direction: "inbound" | "outbound";
  filePath: string;
}) {
  const existingByPath = await db.query.emailMessages.findFirst({
    where: and(eq(emailMessages.mailboxId, opts.mailboxId), eq(emailMessages.maildirPath, opts.filePath)),
    columns: { id: true },
  });
  if (existingByPath) {
    // If a bounce was indexed before correlation logic improved, try to reconcile it now.
    const reconcileSkipped = String(process.env.MAIL_INDEXER_RECONCILE_SKIPPED_BOUNCES || "true").trim() !== "false";
    if (reconcileSkipped) {
      try {
        const existing = await db.query.emailMessages.findFirst({
          where: eq(emailMessages.id, existingByPath.id),
          columns: {
            id: true,
            tenantId: true,
            mailboxId: true,
            direction: true,
            fromEmail: true,
            subject: true,
            textBody: true,
            inReplyTo: true,
            referencesJson: true,
            createdAt: true,
            metadata: true,
          },
        });

        if (existing && existing.direction === "inbound") {
          const meta = (existing.metadata && typeof existing.metadata === "object") ? (existing.metadata as any) : {};
          const already = typeof meta?.bounceReconciledAt === "string" && meta.bounceReconciledAt.trim().length > 5;
          const isBounce = looksLikeDeliveryBounce({
            fromEmail: String(existing.fromEmail || ""),
            subject: String(existing.subject || ""),
            textBody: typeof existing.textBody === "string" ? existing.textBody : null,
          });

          if (isBounce && !already) {
            await reconcileOutboundBounce({
              tenantId: Number(existing.tenantId),
              mailboxId: Number(existing.mailboxId),
              bounceMessage: {
                id: Number(existing.id),
                fromEmail: String(existing.fromEmail || ""),
                subject: String(existing.subject || ""),
                createdAt: existing.createdAt ? new Date(existing.createdAt as any) : new Date(),
                inReplyTo: typeof existing.inReplyTo === "string" ? existing.inReplyTo : null,
                references: Array.isArray(existing.referencesJson)
                  ? (existing.referencesJson as any).map((v: any) => String(v || "")).filter(Boolean)
                  : [],
                textBody: typeof existing.textBody === "string" ? existing.textBody : null,
              },
            });

            await db
              .update(emailMessages)
              .set({ metadata: { ...meta, bounceReconciledAt: new Date().toISOString() } })
              .where(eq(emailMessages.id, existing.id));
          }
        }
      } catch {
        // ignore
      }
    }

    return { skipped: true as const, reason: "path" as const };
  }

  const stat = fs.statSync(opts.filePath);
  const raw = fs.readFileSync(opts.filePath);
  const parsed = await simpleParser(raw);

  const fromEmail = parsed.from?.value?.[0]?.address || "";
  const to = (parsed.to?.value || []).map((v: any) => v?.address).filter(Boolean);
  const cc = (parsed.cc?.value || []).map((v: any) => v?.address).filter(Boolean);
  const subject = parsed.subject || "";
  const messageId = parsed.messageId || null;
  const inReplyTo = typeof parsed.inReplyTo === "string" ? parsed.inReplyTo : null;
  const references = Array.isArray(parsed.references)
    ? parsed.references.map((r: any) => String(r || "")).filter(Boolean)
    : typeof parsed.references === "string"
      ? parsed.references.split(/\s+/).filter(Boolean)
      : [];

  if (messageId) {
    const existingByMessageId = await db.query.emailMessages.findFirst({
      where: and(eq(emailMessages.mailboxId, opts.mailboxId), eq(emailMessages.messageId, messageId)),
      columns: { id: true },
    });
    if (existingByMessageId) return { skipped: true as const, reason: "messageId" as const };
  }

  const createdAt = parsed.date instanceof Date && Number.isFinite(parsed.date.getTime()) ? parsed.date : stat.mtime;
  const thread = await getOrCreateThread({
    mailboxId: opts.mailboxId,
    tenantId: opts.tenantId,
    agentKey: opts.agentKey,
    subject,
    when: createdAt,
  });

  const [row] = await db
    .insert(emailMessages)
    .values({
      tenantId: opts.tenantId,
      agentKey: opts.agentKey,
      mailboxId: opts.mailboxId,
      threadId: thread.id,
      direction: opts.direction,
      status: opts.direction === "inbound" ? "received" : MAIL_DELIVERY_STATUSES.ACCEPTED_BY_MTA,
      fromEmail: fromEmail || "",
      toJson: to,
      ccJson: cc,
      subject,
      textBody: parsed.text || null,
      htmlBody: typeof parsed.html === "string" ? parsed.html : null,
      messageId,
      inReplyTo,
      referencesJson: references,
      maildirPath: opts.filePath,
      metadata: {
        indexedAt: new Date().toISOString(),
        sizeBytes: stat.size,
      },
      createdAt,
    })
    .returning();

  const workOrderNow = new Date();
  if (opts.direction === "inbound") {
    const isBounce = looksLikeDeliveryBounce({ fromEmail: fromEmail || "", subject, textBody: parsed.text || null });
    if (isBounce) {
      await reconcileOutboundBounce({
        tenantId: opts.tenantId,
        mailboxId: opts.mailboxId,
        bounceMessage: {
          id: row.id,
          fromEmail: fromEmail || "",
          subject,
          createdAt,
          inReplyTo,
          references,
          textBody: parsed.text || null,
        },
      });
      return { skipped: false as const };
    }

    const senderEmail = String(fromEmail || "").trim().toLowerCase();
    const { senderClass, dueAt } = computeDueAt({ createdAt, fromEmail: senderEmail });

    await db
      .insert(emailWorkOrders)
      .values({
        tenantId: opts.tenantId,
        agentKey: opts.agentKey,
        mailboxId: opts.mailboxId,
        threadId: thread.id,
        status: "open",
        senderEmail: senderEmail || "(unknown)",
        lastInboundMessageId: row.id,
        lastInboundAt: createdAt,
        ackSentAt: null,
        repliedAt: null,
        dueAt,
        lastEscalatedAt: null,
        metadata: { senderClass },
        createdAt: workOrderNow,
        updatedAt: workOrderNow,
      })
      .onConflictDoUpdate({
        target: [emailWorkOrders.threadId],
        set: {
          status: "open",
          senderEmail: senderEmail || "(unknown)",
          lastInboundMessageId: row.id,
          lastInboundAt: createdAt,
          repliedAt: null,
          dueAt,
          updatedAt: workOrderNow,
          metadata: { senderClass },
        },
      });
  } else {
    await db
      .update(emailWorkOrders)
      .set({ status: "replied", repliedAt: createdAt, updatedAt: workOrderNow })
      .where(and(eq(emailWorkOrders.threadId, thread.id), eq(emailWorkOrders.tenantId, opts.tenantId)));
  }

  for (const att of parsed.attachments || []) {
    // eslint-disable-next-line no-await-in-loop
    await db.insert(emailAttachmentsMeta).values({
      tenantId: opts.tenantId,
      messageId: row.id,
      filename: att.filename || "attachment",
      mimeType: att.contentType || "application/octet-stream",
      sizeBytes: att.size || 0,
      maildirPath: opts.filePath,
      createdAt: new Date(),
    });
  }

  return { skipped: false as const };
}

export async function runMailIndexer(opts: IndexerOpts): Promise<MailIndexerRunResult> {
  const startedAt = new Date();
  const tenantId = Number(opts.tenantId);
  const agentKeyFilter = opts.agentKey ? normalizeAgentKey(String(opts.agentKey)) : null;
  const limitPerMailbox = Number.isFinite(opts.limitPerMailbox as any) ? Number(opts.limitPerMailbox) : 250;
  const limitSafe = Math.max(20, Math.min(2000, Math.trunc(limitPerMailbox)));

  const mailboxes = await db.query.agentMailboxes.findMany({
    where: and(eq(agentMailboxes.tenantId, tenantId), ...(agentKeyFilter ? [eq(agentMailboxes.agentKey, agentKeyFilter)] : [])),
    orderBy: [desc(agentMailboxes.updatedAt)],
    limit: 250,
  });

  let indexedTotal = 0;
  let skippedTotal = 0;
  const results: IndexerMailboxResult[] = [];

  for (const mailbox of mailboxes) {
    const errors: string[] = [];
    let indexed = 0;
    let skipped = 0;

    const meta = mailbox.metadata as any;
    const metaMaildir = meta?.maildir ? String(meta.maildir).replace(/\\/g, "/") : null;
    const metaLocalPart = typeof meta?.localPart === "string" ? String(meta.localPart).trim() : null;
    const metaDomain = typeof meta?.domain === "string" ? String(meta.domain).trim().toLowerCase() : null;
    const emailParts = parseEmailParts(mailbox.email);

    const localPart = metaLocalPart || emailParts?.localPart || null;
    const domain = metaDomain || emailParts?.domain || null;

    const maildirCandidates: string[] = [];
    if (metaMaildir) maildirCandidates.push(metaMaildir);
    if (localPart && domain) {
      for (const base of getMaildirBases()) {
        maildirCandidates.push(`${base}/${domain}/${localPart}`);
        maildirCandidates.push(`${base}/${domain}/${localPart}/Maildir`);
      }
    }

    const { resolved: maildirPath, attempted } = resolveMaildirPath(maildirCandidates);
    const exists = !!maildirPath;

    if (!maildirPath || !exists) {
      const reason = metaMaildir ? "maildir_not_found" : "maildir_missing_in_metadata";
      const extra = attempted.length ? `maildir_candidates:${attempted.length}` : null;
      results.push({
        mailboxId: mailbox.id,
        agentKey: mailbox.agentKey,
        email: mailbox.email,
        maildir: maildirPath,
        maildirExists: false,
        indexed: 0,
        skipped: 0,
        errors: uniqStrings([reason, extra ?? ""]),
      });
      continue;
    }

    const { inbox, sent } = detectMaildirFolders(maildirPath);
    const inboxFiles = inbox.flatMap((dir) => safeListFilesWithMtime(dir, errors));
    const sentFiles = sent.flatMap((dir) => safeListFilesWithMtime(dir, errors));

    const all = [
      ...inboxFiles.map((x) => ({ ...x, direction: "inbound" as const })),
      ...sentFiles.map((x) => ({ ...x, direction: "outbound" as const })),
    ]
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .slice(0, limitSafe);

    for (const item of all) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const result = await indexMessageFile({
          tenantId: mailbox.tenantId,
          agentKey: mailbox.agentKey,
          mailboxId: mailbox.id,
          direction: item.direction,
          filePath: item.filePath,
        });
        if (result.skipped) skipped += 1;
        else indexed += 1;
      } catch (err: any) {
        errors.push(err?.message || "index_failed");
      }
    }

    indexedTotal += indexed;
    skippedTotal += skipped;
    results.push({
      mailboxId: mailbox.id,
      agentKey: mailbox.agentKey,
      email: mailbox.email,
      maildir: maildirPath,
      maildirExists: true,
      indexed,
      skipped,
      errors,
    });
  }

  const finishedAt = new Date();
  return {
    ok: true,
    tenantId,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    indexed: indexedTotal,
    skipped: skippedTotal,
    mailboxes: results,
  };
}
