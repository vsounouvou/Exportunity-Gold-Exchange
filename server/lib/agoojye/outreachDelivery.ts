import { and, eq, inArray } from "drizzle-orm";

import { db } from "@db";
import {
  agoojyeAuditLogs,
  agoojyeCrmActivities,
  agoojyeCrmContacts,
  agoojyeEmailIdentities,
  agoojyeOutreachApprovals,
  agoojyeSuppressionEntries,
} from "@db/schema";

import { sendEmailAsAgent } from "../mail/sender";
import { syncAgoojiyeUnifiedInbox } from "./mailBridge";
import {
  AGOOJIYE_HUMAN_MAILBOX_PROFILES,
  agoojiyeMailboxAddress,
} from "./mailBridgePolicy";
import { advanceAgoojiyeSequenceAfterSend } from "./sequenceService";

function text(value: unknown) {
  return String(value ?? "").trim();
}

export type DeliverApprovedAgoojiyeOutreachInput = {
  tenantId: number;
  approvalId: number;
  actor: string;
  actorUserId?: number | null;
};

export async function deliverApprovedAgoojiyeOutreach(input: DeliverApprovedAgoojiyeOutreachInput) {
  const tenantId = Number(input.tenantId);
  const approvalId = Number(input.approvalId);
  if (!Number.isFinite(tenantId) || tenantId <= 0) throw new Error("Tenant AGOOJIYE invalide.");
  if (!Number.isFinite(approvalId) || approvalId <= 0) throw new Error("ID d'approbation invalide.");

  const now = new Date();
  let mailServerAccepted = false;
  let acceptedDelivery: { status: string; queueId: string | null; messageId: string | null } | null = null;
  let sentItem: typeof agoojyeOutreachApprovals.$inferSelect | undefined;
  const [approval] = await db
    .update(agoojyeOutreachApprovals)
    .set({ status: "sending", updatedAt: now })
    .where(
      and(
        eq(agoojyeOutreachApprovals.tenantId, tenantId),
        eq(agoojyeOutreachApprovals.id, approvalId),
        inArray(agoojyeOutreachApprovals.status, ["approved", "scheduled", "failed"]),
      ),
    )
    .returning();
  if (!approval) {
    throw new Error("Ce message doit etre approuve et ne peut pas avoir deja ete envoye.");
  }

  try {
    if (!approval.approvedAt) throw new Error("L'approbation humaine horodatee est manquante.");
    if (!approval.contactId) throw new Error("Aucun contact destinataire n'est associe a cette approbation.");
    if (!approval.senderIdentityId) throw new Error("Aucune identite expediteur n'est associee a cette approbation.");

    const [contact] = await db
      .select()
      .from(agoojyeCrmContacts)
      .where(and(eq(agoojyeCrmContacts.tenantId, tenantId), eq(agoojyeCrmContacts.id, Number(approval.contactId))))
      .limit(1);
    if (!contact?.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) {
      throw new Error("Le contact ne possede pas d'adresse email verifiee.");
    }
    if (contact.doNotContact) throw new Error("Ce contact est marque ne pas contacter.");

    const recipient = contact.email.toLowerCase();
    const [suppression] = await db
      .select({ id: agoojyeSuppressionEntries.id })
      .from(agoojyeSuppressionEntries)
      .where(
        and(
          eq(agoojyeSuppressionEntries.tenantId, tenantId),
          eq(agoojyeSuppressionEntries.email, recipient),
          eq(agoojyeSuppressionEntries.status, "active"),
        ),
      )
      .limit(1);
    if (suppression) throw new Error("Ce destinataire figure dans la liste de suppression AGOOJIYE.");

    const [identity] = await db
      .select()
      .from(agoojyeEmailIdentities)
      .where(
        and(
          eq(agoojyeEmailIdentities.tenantId, tenantId),
          eq(agoojyeEmailIdentities.id, Number(approval.senderIdentityId)),
        ),
      )
      .limit(1);
    if (!identity || identity.status !== "active" || !identity.canSend) {
      throw new Error("L'identite expediteur n'est pas active pour l'envoi.");
    }

    const profile = AGOOJIYE_HUMAN_MAILBOX_PROFILES.find(
      (candidate) => agoojiyeMailboxAddress(candidate.localPart) === text(identity.emailAddress).toLowerCase(),
    );
    if (!profile) throw new Error("L'identite expediteur n'est pas l'une des cinq boites humaines autorisees.");

    const sent = await sendEmailAsAgent({
      tenantId,
      agentKey: profile.localPart,
      actorType: "human",
      to: [recipient],
      subject: approval.subject,
      textBody: approval.body,
      htmlBody: null,
      requestedByUserId: input.actorUserId ?? null,
      correlationId: `agoojye-approval-${approval.id}`,
      bypassApproval: true,
    });
    mailServerAccepted = true;
    acceptedDelivery = {
      status: sent.message.status,
      queueId: sent.message.queueId || null,
      messageId: sent.message.messageId || null,
    };

    const sentAt = new Date();
    const [item] = await db
      .update(agoojyeOutreachApprovals)
      .set({ status: "sent", sentAt, updatedAt: sentAt })
      .where(and(eq(agoojyeOutreachApprovals.tenantId, tenantId), eq(agoojyeOutreachApprovals.id, approvalId)))
      .returning();
    sentItem = item;

    let bookkeepingWarning: string | null = null;
    try {
      await db.insert(agoojyeCrmActivities).values({
        tenantId,
        contactId: approval.contactId,
        opportunityId: approval.opportunityId,
        actorUserId: input.actorUserId ?? null,
        activityType: "email_sent",
        channel: "smtp",
        subject: approval.subject,
        outcome: "accepted_by_mail_server",
        completedAt: sentAt,
        metadata: {
          approvalId,
          deliveryStatus: sent.message.status,
          messageId: sent.message.messageId || null,
        },
        createdAt: sentAt,
        updatedAt: sentAt,
      });
      await syncAgoojiyeUnifiedInbox(tenantId);
      await db.insert(agoojyeAuditLogs).values({
        tenantId,
        actor: text(input.actor) || "system",
        action: "approved_outreach_sent",
        entityType: "outreach_approval",
        entityId: approvalId,
        metadata: {
          contactId: approval.contactId,
          senderIdentityId: approval.senderIdentityId,
          deliveryStatus: sent.message.status,
        },
        createdAt: sentAt,
        updatedAt: sentAt,
      });
    } catch (bookkeepingError: any) {
      bookkeepingWarning = text(bookkeepingError?.message || bookkeepingError || "Post-traitement CRM incomplet").slice(0, 1_000);
      try {
        await db.insert(agoojyeAuditLogs).values({
          tenantId,
          actor: text(input.actor) || "system",
          action: "approved_outreach_post_send_warning",
          entityType: "outreach_approval",
          entityId: approvalId,
          metadata: { warning: bookkeepingWarning },
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      } catch {
        // Delivery is already accepted; audit failure must never trigger a duplicate SMTP send.
      }
    }

    let sequence: Record<string, unknown> | null = null;
    try {
      sequence = await advanceAgoojiyeSequenceAfterSend({ tenantId, approval: item, sentAt });
    } catch (sequenceError: any) {
      const warning = text(sequenceError?.message || sequenceError || "Programmation de sequence impossible").slice(0, 1_000);
      bookkeepingWarning = [bookkeepingWarning, warning].filter(Boolean).join(" ");
      try {
        await db.insert(agoojyeAuditLogs).values({
          tenantId,
          actor: text(input.actor) || "system",
          action: "outreach_sequence_advance_failed",
          entityType: "outreach_approval",
          entityId: approvalId,
          metadata: { warning },
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      } catch {
        // Delivery is already accepted; audit failure must never trigger a duplicate SMTP send.
      }
    }

    return {
      item,
      delivery: acceptedDelivery,
      sequence,
      warning: bookkeepingWarning,
    };
  } catch (error: any) {
    const message = text(error?.message || error || "Envoi impossible").slice(0, 1_000);
    const failedAt = new Date();
    if (mailServerAccepted) {
      try {
        const [item] = await db
          .update(agoojyeOutreachApprovals)
          .set({ status: "sent", sentAt: approval.sentAt || failedAt, decisionNotes: message, updatedAt: failedAt })
          .where(and(eq(agoojyeOutreachApprovals.tenantId, tenantId), eq(agoojyeOutreachApprovals.id, approvalId)))
          .returning();
        sentItem = item || sentItem;
        await db.insert(agoojyeAuditLogs).values({
          tenantId,
          actor: text(input.actor) || "system",
          action: "approved_outreach_accepted_with_warning",
          entityType: "outreach_approval",
          entityId: approvalId,
          metadata: { warning: message },
          createdAt: failedAt,
          updatedAt: failedAt,
        });
      } catch {
        // The row remains in a non-sendable `sending` state if persistence is unavailable.
      }
      return { item: sentItem || approval, delivery: acceptedDelivery, sequence: null, warning: message };
    }
    await db
      .update(agoojyeOutreachApprovals)
      .set({ status: "failed", decisionNotes: message, updatedAt: failedAt })
      .where(and(eq(agoojyeOutreachApprovals.tenantId, tenantId), eq(agoojyeOutreachApprovals.id, approvalId)));
    await db.insert(agoojyeAuditLogs).values({
      tenantId,
      actor: text(input.actor) || "system",
      action: "approved_outreach_failed",
      entityType: "outreach_approval",
      entityId: approvalId,
      metadata: { error: message },
      createdAt: failedAt,
      updatedAt: failedAt,
    });
    throw new Error(message);
  }
}
