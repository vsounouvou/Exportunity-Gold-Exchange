import crypto from "node:crypto";

import { db } from "@db";
import {
  agentTasks,
  auditLogs,
  communicationsEvents,
  communicationsMessages,
  communicationsThreads,
  communicationsWorkOrders,
  contacts,
  contactSources,
  socialInboxEventAudit,
  socialInboxEvents,
  socialPublicationTargets,
  tenantContacts,
} from "@db/schema";
import { and, desc, eq, sql } from "drizzle-orm";

import {
  classifySocialInboxText,
  initialReplyPolicyStatus,
  isLeadEligibleClassification,
  moderationStatusForClassification,
  normalizeSocialInboxDescriptor,
  sanitizeSocialVerificationEvidence,
  socialInboxDueAt,
  type SocialInboxClassification,
} from "./socialInboxPolicy";

type JsonRecord = Record<string, unknown>;

export class SocialInboxVerificationError extends Error {
  readonly code = "SOCIAL_INBOX_VERIFICATION_REQUIRED";

  constructor(message: string) {
    super(message);
    this.name = "SocialInboxVerificationError";
  }
}

export class SocialInboxConflictError extends Error {
  readonly code = "SOCIAL_INBOX_IDEMPOTENCY_CONFLICT";

  constructor(message: string) {
    super(message);
    this.name = "SocialInboxConflictError";
  }
}

function requiredText(value: unknown, field: string, max = 240) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`${field} is required`);
  if (text.length > max) throw new Error(`${field} exceeds ${max} characters`);
  return text;
}

function optionalText(value: unknown, max = 240) {
  const text = String(value || "").trim();
  return text ? text.slice(0, max) : null;
}

function optionalHttpUrl(value: unknown) {
  const text = optionalText(value, 2048);
  if (!text) return null;
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    throw new Error("parentContentUrl must be a valid URL");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("parentContentUrl must use http or https");
  }
  return parsed.toString();
}

function parseReceivedAt(value: unknown, now = new Date()) {
  const receivedAt = new Date(String(value || ""));
  if (!Number.isFinite(receivedAt.getTime())) throw new Error("receivedAt is required");
  if (receivedAt.getTime() > now.getTime() + 5 * 60_000) {
    throw new Error("receivedAt cannot be in the future");
  }
  return receivedAt;
}

function contactDedupeKey(input: { tenantId: number; platform: string; externalActorId: string }) {
  const digest = crypto
    .createHash("sha256")
    .update(`${input.tenantId}:${input.platform}:${input.externalActorId}`)
    .digest("hex");
  return `social:${input.tenantId}:${input.platform}:${digest}`;
}

function taskKey(input: { provider: string; platform: string; providerEventId: string }) {
  return crypto
    .createHash("sha256")
    .update(`${input.provider}:${input.platform}:${input.providerEventId}`)
    .digest("hex")
    .slice(0, 32);
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

async function ensureSocialLeadContact(
  tx: any,
  input: {
    tenantId: number;
    actorUserId: number | null;
    provider: string;
    platform: string;
    providerEventId: string;
    externalActorId: string;
    externalActorLabel: string | null;
    classification: SocialInboxClassification;
    parentContentUrl: string | null;
  },
) {
  if (!isLeadEligibleClassification(input.classification)) {
    return { contactId: null as number | null, leadStatus: "not_applicable" as const };
  }

  const dedupeKey = contactDedupeKey(input);
  const now = new Date();
  const contactMetadata = {
    socialIdentity: {
      provider: input.provider,
      platform: input.platform,
      externalActorId: input.externalActorId,
      externalActorLabel: input.externalActorLabel,
    },
    lastSocialClassification: input.classification,
    lastSocialProviderEventId: input.providerEventId,
  };

  const inserted = await tx
    .insert(contacts)
    .values({
      tenantId: input.tenantId,
      displayName: input.externalActorLabel || `${input.platform} contact`,
      tags: [`social:${input.platform}`, `intent:${input.classification}`],
      status: "lead",
      consentStatus: "unknown",
      isDnc: false,
      source: `${input.platform}_social_inbox`,
      sourceSystem: input.provider,
      sourceReferenceId: input.externalActorId,
      dedupeKey,
      createdByUserId: input.actorUserId,
      metadata: contactMetadata,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: contacts.dedupeKey })
    .returning();

  const existing =
    inserted[0] ||
    (await tx.query.contacts.findFirst({
      where: and(eq(contacts.tenantId, input.tenantId), eq(contacts.dedupeKey, dedupeKey)),
    }));
  if (!existing) throw new Error("Failed to create or match the social CRM lead");

  const existingMetadata = asRecord(existing.metadata);
  const existingTags = Array.isArray(existing.tags) ? existing.tags.map(String) : [];
  const nextTags = Array.from(
    new Set([...existingTags, `social:${input.platform}`, `intent:${input.classification}`]),
  );
  await tx
    .update(contacts)
    .set({
      displayName: existing.displayName || input.externalActorLabel || `${input.platform} contact`,
      tags: nextTags,
      sourceReferenceId: existing.sourceReferenceId || input.externalActorId,
      metadata: { ...existingMetadata, ...contactMetadata },
      updatedAt: now,
    })
    .where(and(eq(contacts.tenantId, input.tenantId), eq(contacts.id, existing.id)));

  await tx
    .insert(tenantContacts)
    .values({
      tenantId: input.tenantId,
      contactId: existing.id,
      scope: "tenant_shared",
      ownerUserId: input.actorUserId,
      status: "active",
      tags: nextTags,
      crmStatus: "lead",
      consentStatus: "unknown",
      isDnc: false,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [tenantContacts.tenantId, tenantContacts.contactId],
      set: { status: "active", tags: nextTags, updatedAt: now },
    });

  await tx.insert(contactSources).values({
    tenantId: input.tenantId,
    contactId: existing.id,
    source: `${input.platform}_social_inbox`,
    sourceSystem: input.provider,
    sourceReferenceId: input.providerEventId,
    pageUrl: input.parentContentUrl,
    metadata: {
      externalActorId: input.externalActorId,
      classification: input.classification,
    },
    createdAt: now,
  });

  return {
    contactId: existing.id,
    leadStatus: inserted.length ? ("created" as const) : ("matched" as const),
  };
}

async function assertCompatibleReplay(
  tx: any,
  input: {
    tenantId: number;
    provider: string;
    platform: string;
    providerEventId: string;
    externalAccountId: string;
    externalActorId: string;
  },
) {
  const existing = await tx.query.socialInboxEvents.findFirst({
    where: and(
      eq(socialInboxEvents.tenantId, input.tenantId),
      eq(socialInboxEvents.provider, input.provider),
      eq(socialInboxEvents.providerEventId, input.providerEventId),
    ),
  });
  if (!existing) return null;
  if (
    existing.platform !== input.platform ||
    existing.externalAccountId !== input.externalAccountId ||
    existing.externalActorId !== input.externalActorId
  ) {
    throw new SocialInboxConflictError("providerEventId is already bound to a different social event");
  }
  return existing;
}

export async function ingestVerifiedSocialInboxEvent(input: {
  tenantId: number;
  actorUserId: number | null;
  targetId: number;
  provider: unknown;
  platform: unknown;
  channel: unknown;
  eventType: unknown;
  providerEventId: unknown;
  externalAccountId: unknown;
  externalActorId: unknown;
  externalActorLabel?: unknown;
  externalThreadId?: unknown;
  parentContentId?: unknown;
  parentContentUrl?: unknown;
  body: unknown;
  receivedAt: unknown;
  verificationEvidence: unknown;
}) {
  const tenantId = Number(input.tenantId);
  const targetId = Number(input.targetId);
  if (!Number.isFinite(tenantId) || tenantId <= 0) throw new Error("tenantId is required");
  if (!Number.isFinite(targetId) || targetId <= 0) throw new Error("targetId is required");

  const descriptor = normalizeSocialInboxDescriptor(input);
  let verificationEvidence: ReturnType<typeof sanitizeSocialVerificationEvidence>;
  try {
    verificationEvidence = sanitizeSocialVerificationEvidence(input.verificationEvidence);
  } catch (error: any) {
    throw new SocialInboxVerificationError(String(error?.message || "verified provider evidence is required"));
  }
  if (descriptor.provider === "manual" && verificationEvidence.method !== "manual_export_review") {
    throw new SocialInboxVerificationError("manual provider events require manual_export_review evidence");
  }
  if (descriptor.provider !== "manual" && verificationEvidence.method === "manual_export_review") {
    throw new SocialInboxVerificationError("manual export evidence must use provider manual");
  }

  const providerEventId = requiredText(input.providerEventId, "providerEventId");
  const externalAccountId = requiredText(input.externalAccountId, "externalAccountId");
  const externalActorId = requiredText(input.externalActorId, "externalActorId");
  const externalActorLabel = optionalText(input.externalActorLabel, 200);
  const externalThreadId = optionalText(input.externalThreadId);
  const parentContentId = optionalText(input.parentContentId);
  const parentContentUrl = optionalHttpUrl(input.parentContentUrl);
  const body = requiredText(input.body, "body", 10_000);
  const receivedAt = parseReceivedAt(input.receivedAt);
  const classification = classifySocialInboxText(body);
  const moderationStatus = moderationStatusForClassification(classification.classification);
  const replyPolicyStatus = initialReplyPolicyStatus(classification.classification);
  const peerAddress = `${descriptor.platform}:${externalActorId}`;
  const providerMessageId = `${descriptor.platform}:${providerEventId}`;
  const agentKey = "media";
  const dueAt = socialInboxDueAt(classification.classification, receivedAt);

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`social-inbox:${tenantId}:${descriptor.provider}:${providerEventId}`}))`,
    );

    const replay = await assertCompatibleReplay(tx, {
      tenantId,
      provider: descriptor.provider,
      platform: descriptor.platform,
      providerEventId,
      externalAccountId,
      externalActorId,
    });
    if (replay) {
      return { idempotentReplay: true, event: replay, externalReplyPerformed: false };
    }

    const target = await tx.query.socialPublicationTargets.findFirst({
      where: and(
        eq(socialPublicationTargets.id, targetId),
        eq(socialPublicationTargets.tenantId, tenantId),
        eq(socialPublicationTargets.platform, descriptor.platform),
      ),
    });
    if (!target) throw new SocialInboxVerificationError("verified tenant social target was not found");
    if (descriptor.provider !== "manual" && target.provider !== descriptor.provider) {
      throw new SocialInboxVerificationError("social target provider does not match the verified event provider");
    }
    if (!target.externalAccountId || target.externalAccountId !== externalAccountId) {
      throw new SocialInboxVerificationError("social event account does not match the verified tenant target");
    }
    if (!["authorized", "connected", "active", "verified"].includes(String(target.authorizationStatus).toLowerCase())) {
      throw new SocialInboxVerificationError("social target authorization is not active");
    }
    if (["restricted", "suspended", "disabled", "unhealthy"].includes(String(target.healthStatus).toLowerCase())) {
      throw new SocialInboxVerificationError("social target health blocks inbox ingestion");
    }
    if (!target.lastVerifiedAt) throw new SocialInboxVerificationError("social target requires provider verification");

    const now = new Date();
    const baseMetadata = {
      source: "social_inbox",
      provider: descriptor.provider,
      platform: descriptor.platform,
      eventType: descriptor.eventType,
      externalAccountId,
      externalActorId,
      externalActorLabel,
      externalThreadId,
      classification: classification.classification,
      classificationConfidenceBps: classification.confidenceBps,
      moderationStatus,
      replyPolicyStatus,
      providerEventId,
      parentContentId,
      parentContentUrl,
      outboundSocialReplyAvailable: false,
    };

    const [thread] = await tx
      .insert(communicationsThreads)
      .values({
        tenantId,
        agentKey,
        channel: descriptor.channel,
        peerAddress,
        lastMessageAt: receivedAt,
        metadata: baseMetadata,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          communicationsThreads.tenantId,
          communicationsThreads.agentKey,
          communicationsThreads.channel,
          communicationsThreads.peerAddress,
        ],
        set: { lastMessageAt: receivedAt, metadata: baseMetadata, updatedAt: now },
      })
      .returning();

    const insertedMessages = await tx
      .insert(communicationsMessages)
      .values({
        tenantId,
        agentKey,
        threadId: thread.id,
        direction: "inbound",
        status: "received",
        provider: descriptor.provider,
        channel: descriptor.channel,
        fromAddress: peerAddress,
        toAddress: `${descriptor.platform}:${externalAccountId}`,
        body,
        providerMessageId,
        metadata: baseMetadata,
        createdAt: receivedAt,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning();
    const message =
      insertedMessages[0] ||
      (await tx.query.communicationsMessages.findFirst({
        where: and(
          eq(communicationsMessages.tenantId, tenantId),
          eq(communicationsMessages.provider, descriptor.provider),
          eq(communicationsMessages.providerMessageId, providerMessageId),
        ),
      }));
    if (!message) throw new Error("Failed to record the social inbox message");

    const [workOrder] = await tx
      .insert(communicationsWorkOrders)
      .values({
        tenantId,
        agentKey,
        channel: descriptor.channel,
        threadId: thread.id,
        status: "open",
        peerAddress,
        lastInboundMessageId: message.id,
        lastInboundAt: receivedAt,
        dueAt,
        metadata: baseMetadata,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [communicationsWorkOrders.threadId],
        set: {
          status: "open",
          lastInboundMessageId: message.id,
          lastInboundAt: receivedAt,
          dueAt,
          metadata: baseMetadata,
          updatedAt: now,
        },
      })
      .returning();
    if (!workOrder) throw new Error("Failed to create the social inbox work order");

    const lead = await ensureSocialLeadContact(tx, {
      tenantId,
      actorUserId: input.actorUserId,
      provider: descriptor.provider,
      platform: descriptor.platform,
      providerEventId,
      externalActorId,
      externalActorLabel,
      classification: classification.classification,
      parentContentUrl,
    });

    const [task] = await tx
      .insert(agentTasks)
      .values({
        tenantId,
        agent: "media",
        taskType: `social_inbox:${taskKey({ ...descriptor, providerEventId })}`,
        taskSource: "event",
        scriptGenerated: false,
        executionStatus: "queued",
        goal: `Review ${classification.classification.replace(/_/g, " ")} from ${descriptor.platform} and prepare an approved response or escalation.`,
        budgetUsdCap: "0.00",
        budgetMaxCalls: 0,
        budgetMaxTokens: 0,
        budgetUsedUsd: "0.0000",
        callsUsed: 0,
        tokensUsed: 0,
        status: "paused",
        constraints: {
          source: "social_inbox",
          provider: descriptor.provider,
          platform: descriptor.platform,
          channel: descriptor.channel,
          providerEventId,
          threadId: String(thread.id),
          messageId: String(message.id),
          workOrderId: String(workOrder.id),
          contactId: lead.contactId ? String(lead.contactId) : null,
          classification: classification.classification,
          humanApprovalRequired: true,
          approvedProductFactsRequired: true,
          approvedPriceFactsRequiredForPriceClaims: true,
          approvedPolicyAndToneRequired: true,
          officialReplyAdapterRequired: true,
          externalActionsForbidden: true,
        },
        createdByUserId: input.actorUserId,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const [event] = await tx
      .insert(socialInboxEvents)
      .values({
        tenantId,
        targetId,
        provider: descriptor.provider,
        platform: descriptor.platform,
        channel: descriptor.channel,
        eventType: descriptor.eventType,
        providerEventId,
        externalAccountId,
        externalActorId,
        externalActorLabel,
        externalThreadId,
        parentContentId,
        parentContentUrl,
        threadId: thread.id,
        messageId: message.id,
        workOrderId: workOrder.id,
        contactId: lead.contactId,
        agentTaskId: task.id,
        classification: classification.classification,
        classificationConfidenceBps: classification.confidenceBps,
        classificationEvidence: classification.evidence,
        moderationStatus,
        leadStatus: lead.leadStatus,
        replyPolicyStatus,
        verificationEvidence,
        receivedAt,
        createdAt: now,
      })
      .returning();

    const linkedMetadata = {
      ...baseMetadata,
      socialInboxEventId: event.id,
      contactId: lead.contactId,
      leadStatus: lead.leadStatus,
      agentTaskId: task.id,
      workOrderId: workOrder.id,
    };
    await tx
      .update(communicationsMessages)
      .set({ metadata: linkedMetadata, updatedAt: now })
      .where(and(eq(communicationsMessages.tenantId, tenantId), eq(communicationsMessages.id, message.id)));
    await tx
      .update(communicationsThreads)
      .set({ metadata: linkedMetadata, updatedAt: now })
      .where(and(eq(communicationsThreads.tenantId, tenantId), eq(communicationsThreads.id, thread.id)));
    await tx
      .update(communicationsWorkOrders)
      .set({ metadata: linkedMetadata, updatedAt: now })
      .where(and(eq(communicationsWorkOrders.tenantId, tenantId), eq(communicationsWorkOrders.id, workOrder.id)));

    await tx.insert(socialInboxEventAudit).values({
      tenantId,
      socialInboxEventId: event.id,
      eventType: "verified_event_ingested",
      actorUserId: input.actorUserId,
      payload: {
        threadId: thread.id,
        messageId: message.id,
        workOrderId: workOrder.id,
        contactId: lead.contactId,
        agentTaskId: task.id,
        classification: classification.classification,
        externalReplyPerformed: false,
      },
      createdAt: now,
    });
    await tx.insert(communicationsEvents).values({
      tenantId,
      provider: descriptor.provider,
      eventType: "social.message.inbound",
      eventAt: receivedAt,
      data: {
        socialInboxEventId: event.id,
        providerEventId,
        platform: descriptor.platform,
        channel: descriptor.channel,
        threadId: thread.id,
        messageId: message.id,
        workOrderId: workOrder.id,
        classification: classification.classification,
        moderationStatus,
      },
      createdAt: now,
    });
    await tx.insert(auditLogs).values({
      tenantId,
      userId: input.actorUserId,
      userRole: "admin",
      action: "social_inbox.verified_event_ingested",
      entityType: "social_inbox_event",
      entityId: null,
      metadata: {
        socialInboxEventId: event.id,
        provider: descriptor.provider,
        platform: descriptor.platform,
        providerEventId,
        threadId: thread.id,
        workOrderId: workOrder.id,
        contactId: lead.contactId,
        agentTaskId: task.id,
        classification: classification.classification,
        replyPolicyStatus,
        externalReplyPerformed: false,
      },
      createdAt: now,
    });

    return {
      idempotentReplay: false,
      event,
      thread,
      message,
      workOrder,
      contactId: lead.contactId,
      leadStatus: lead.leadStatus,
      agentTaskId: task.id,
      externalReplyPerformed: false,
    };
  });
}

export async function listSocialInboxEvents(input: {
  tenantId: number;
  limit?: number;
  classification?: string | null;
}) {
  const limit = Math.max(1, Math.min(200, Number(input.limit || 100)));
  const conditions = [eq(socialInboxEvents.tenantId, input.tenantId)];
  if (input.classification) conditions.push(eq(socialInboxEvents.classification, input.classification));
  return db
    .select()
    .from(socialInboxEvents)
    .where(conditions.length === 1 ? conditions[0] : and(...conditions))
    .orderBy(desc(socialInboxEvents.receivedAt))
    .limit(limit);
}
