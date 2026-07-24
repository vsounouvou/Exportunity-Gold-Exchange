import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@db";
import {
  agentEmailIdentities,
  agentMailboxes,
  agoojyeCrmActivities,
  agoojyeCrmContacts,
  agoojyeEmailIdentities,
  agoojyeMailMessages,
  agoojyeMailThreads,
  agoojyeOutreachApprovals,
  agoojyePipelineStages,
  agoojyeSponsorOpportunities,
  agoojyeSuppressionEntries,
  emailAccounts,
  emailMessages,
  emailThreads,
  emailUnsubscribes,
} from "@db/schema";
import {
  AGOOJIYE_HUMAN_MAILBOX_PROFILES,
  AGOOJIYE_MAIL_DOMAIN,
  agoojiyeConversationKey,
  agoojiyeMailboxAddress,
  agoojiyeMaildirPath,
  extractHardBounceRecipient,
  isExplicitOptOutMessage,
} from "./mailBridgePolicy";

const AGOOJIYE_WEBSITE = "https://agoojiye.com";

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value.map((item) => String(item || "").trim()).filter(Boolean);
}

function isExternalAddress(value: unknown) {
  const email = String(value || "").trim().toLowerCase();
  return email.includes("@") && !email.endsWith(`@${AGOOJIYE_MAIL_DOMAIN}`);
}

function messageProviderId(message: typeof emailMessages.$inferSelect) {
  const messageId = String(message.messageId || "").trim().toLowerCase();
  return messageId ? `rfc:${messageId}` : `mail-engine:${message.id}`;
}

export async function ensureAgoojiyeHumanMailProfiles(tenantId: number) {
  if (!Number.isFinite(tenantId) || tenantId <= 0) return { configured: 0, discoveredAccounts: 0 };

  const addresses = AGOOJIYE_HUMAN_MAILBOX_PROFILES.map((profile) => agoojiyeMailboxAddress(profile.localPart));
  const accounts = await db.query.emailAccounts.findMany({
    where: and(eq(emailAccounts.tenantId, tenantId), inArray(emailAccounts.address, addresses)),
  });
  const accountByAddress = new Map(accounts.map((account) => [String(account.address).toLowerCase(), account]));
  const now = new Date();
  let configured = 0;

  for (const profile of AGOOJIYE_HUMAN_MAILBOX_PROFILES) {
    const address = agoojiyeMailboxAddress(profile.localPart);
    const account = accountByAddress.get(address);
    if (!account || account.status !== "active") continue;

    const [mailbox] = await db
      .insert(agentMailboxes)
      .values({
        tenantId,
        agentKey: profile.localPart,
        email: address,
        quotaMb: account.quotaMb || 2048,
        dailyOutboundLimit: 50,
        approvalRequired: true,
        isEnabled: true,
        metadata: {
          kind: "human_team_mailbox",
          displayName: profile.displayName,
          localPart: profile.localPart,
          domain: AGOOJIYE_MAIL_DOMAIN,
          maildir: agoojiyeMaildirPath(profile.localPart),
          senderAddressMode: "mailbox_exact",
          source: "agoojye_human_mail_bridge",
        },
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [agentMailboxes.tenantId, agentMailboxes.agentKey],
        set: {
          email: address,
          quotaMb: account.quotaMb || 2048,
          dailyOutboundLimit: 50,
          approvalRequired: true,
          isEnabled: true,
          metadata: sql`${agentMailboxes.metadata} || excluded.metadata`,
          updatedAt: now,
        },
      })
      .returning();

    if (!mailbox) continue;

    await db
      .insert(agentEmailIdentities)
      .values({
        tenantId,
        agentKey: profile.localPart,
        mailboxId: mailbox.id,
        emailAccountId: account.id,
        fromEmail: address,
        replyToEmail: address,
        displayName: profile.displayName,
        smtpHost: process.env.AGOOJIYE_SMTP_HOST || "mail.exportunity.net",
        smtpPort: 587,
        smtpSecure: false,
        smtpUsername: address,
        smtpPasswordRef: profile.passwordEnv,
        isEnabled: true,
        metadata: {
          senderAddressMode: "mailbox_exact",
          role: "Membre de l'equipe AGOOJIYE",
          companyName: "AGOOJIYE Electric Mobility",
          website: AGOOJIYE_WEBSITE,
          humanOwned: true,
        },
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [agentEmailIdentities.tenantId, agentEmailIdentities.agentKey],
        set: {
          mailboxId: mailbox.id,
          emailAccountId: account.id,
          fromEmail: address,
          replyToEmail: address,
          displayName: profile.displayName,
          smtpHost: process.env.AGOOJIYE_SMTP_HOST || "mail.exportunity.net",
          smtpPort: 587,
          smtpSecure: false,
          smtpUsername: address,
          smtpPasswordRef: profile.passwordEnv,
          isEnabled: true,
          metadata: sql`${agentEmailIdentities.metadata} || excluded.metadata`,
          updatedAt: now,
        },
      });

    configured += 1;
  }

  return { configured, discoveredAccounts: accounts.length };
}

async function resolveCrmContact(tenantId: number, email: string, repliedAt: Date) {
  const normalized = email.trim().toLowerCase();
  if (!isExternalAddress(normalized)) return null;

  const [contact] = await db
    .insert(agoojyeCrmContacts)
    .values({
      tenantId,
      email: normalized,
      verificationStatus: "email_received",
      preferredLanguage: "fr",
      confidenceScore: 100,
      lastRepliedAt: repliedAt,
      notes: "Contact cree automatiquement depuis la boite unifiee AGOOJIYE.",
      createdAt: repliedAt,
      updatedAt: repliedAt,
    })
    .onConflictDoUpdate({
      target: [agoojyeCrmContacts.tenantId, agoojyeCrmContacts.email],
      set: {
        verificationStatus: "email_received",
        confidenceScore: 100,
        lastRepliedAt: repliedAt,
        updatedAt: repliedAt,
      },
    })
    .returning();

  return contact || null;
}

async function stopPendingOutreachForReply(tenantId: number, contactId: number, sourceMessageId: string, when: Date) {
  await db
    .update(agoojyeOutreachApprovals)
    .set({ status: "cancelled_reply_received", decisionNotes: "Arret automatique: reponse recue.", updatedAt: when })
    .where(
      and(
        eq(agoojyeOutreachApprovals.tenantId, tenantId),
        eq(agoojyeOutreachApprovals.contactId, contactId),
        inArray(agoojyeOutreachApprovals.status, ["awaiting_approval", "approved", "scheduled"]),
      ),
    );

  const [replyStage] = await db
    .select({ id: agoojyePipelineStages.id })
    .from(agoojyePipelineStages)
    .where(and(eq(agoojyePipelineStages.tenantId, tenantId), eq(agoojyePipelineStages.slug, "reply-received")))
    .limit(1);

  const opportunities = await db
    .select({ id: agoojyeSponsorOpportunities.id, organizationId: agoojyeSponsorOpportunities.organizationId })
    .from(agoojyeSponsorOpportunities)
    .where(and(eq(agoojyeSponsorOpportunities.tenantId, tenantId), eq(agoojyeSponsorOpportunities.contactId, contactId)));

  for (const opportunity of opportunities) {
    await db
      .update(agoojyeSponsorOpportunities)
      .set({ stageId: replyStage?.id || null, lastActivityAt: when, updatedAt: when })
      .where(and(eq(agoojyeSponsorOpportunities.tenantId, tenantId), eq(agoojyeSponsorOpportunities.id, opportunity.id)));
    await db.insert(agoojyeCrmActivities).values({
      tenantId,
      organizationId: opportunity.organizationId,
      contactId,
      opportunityId: opportunity.id,
      activityType: "reply_received",
      channel: "email",
      subject: "Reponse email recue",
      outcome: "Automated follow-ups stopped",
      metadata: { sourceMessageId },
      completedAt: when,
      createdAt: when,
      updatedAt: when,
    });
  }
}

async function addSuppression(tenantId: number, email: string, reason: string, source: string, when: Date) {
  if (!isExternalAddress(email)) return;
  const normalized = email.trim().toLowerCase();
  const contact = await db.query.agoojyeCrmContacts.findFirst({
    where: and(eq(agoojyeCrmContacts.tenantId, tenantId), eq(agoojyeCrmContacts.email, normalized)),
    columns: { id: true },
  });
  await db
    .insert(agoojyeSuppressionEntries)
    .values({
      tenantId,
      email: normalized,
      contactId: contact?.id || null,
      reason,
      source,
      status: "active",
      createdBy: "mail_bridge",
      createdAt: when,
      updatedAt: when,
    })
    .onConflictDoUpdate({
      target: [agoojyeSuppressionEntries.tenantId, agoojyeSuppressionEntries.email],
      set: { reason, source, status: "active", updatedAt: when },
    });

  await db
    .insert(emailUnsubscribes)
    .values({
      tenantId,
      email: normalized,
      scope: "marketing",
      metadata: { reason, source, recordedAt: when.toISOString() },
      createdAt: when,
    })
    .onConflictDoNothing();

  if (contact?.id) {
    await db
      .update(agoojyeCrmContacts)
      .set({ doNotContact: true, updatedAt: when })
      .where(and(eq(agoojyeCrmContacts.tenantId, tenantId), eq(agoojyeCrmContacts.id, contact.id)));
    await db
      .update(agoojyeSponsorOpportunities)
      .set({ doNotContact: true, updatedAt: when })
      .where(and(eq(agoojyeSponsorOpportunities.tenantId, tenantId), eq(agoojyeSponsorOpportunities.contactId, contact.id)));
  }
}

export async function syncAgoojiyeUnifiedInbox(tenantId: number) {
  const addresses = AGOOJIYE_HUMAN_MAILBOX_PROFILES.map((profile) => agoojiyeMailboxAddress(profile.localPart));
  const mailboxes = await db.query.agentMailboxes.findMany({
    where: and(eq(agentMailboxes.tenantId, tenantId), inArray(agentMailboxes.email, addresses), eq(agentMailboxes.isEnabled, true)),
  });
  if (!mailboxes.length) return { threads: 0, messages: 0, newMessages: 0 };

  const identities = await db.query.agoojyeEmailIdentities.findMany({
    where: and(eq(agoojyeEmailIdentities.tenantId, tenantId), inArray(agoojyeEmailIdentities.emailAddress, addresses)),
  });
  const identityByAddress = new Map(identities.map((identity) => [identity.emailAddress.toLowerCase(), identity.id]));
  const mailboxById = new Map(mailboxes.map((mailbox) => [mailbox.id, mailbox]));
  const threadRows = await db.query.emailThreads.findMany({
    where: and(eq(emailThreads.tenantId, tenantId), inArray(emailThreads.mailboxId, mailboxes.map((mailbox) => mailbox.id))),
    orderBy: [asc(emailThreads.createdAt)],
  });

  let messageCount = 0;
  let newMessageCount = 0;

  for (const sourceThread of threadRows) {
    const sourceMessages = await db.query.emailMessages.findMany({
      where: and(eq(emailMessages.tenantId, tenantId), eq(emailMessages.threadId, sourceThread.id)),
      orderBy: [asc(emailMessages.createdAt)],
    });
    if (!sourceMessages.length) continue;

    const externalInbound = sourceMessages
      .filter((message) => message.direction === "inbound" && isExternalAddress(message.fromEmail))
      .at(-1);
    const contact = externalInbound
      ? await resolveCrmContact(tenantId, externalInbound.fromEmail, new Date(externalInbound.createdAt))
      : null;
    const mailbox = mailboxById.get(sourceThread.mailboxId);
    const providerThreadId = agoojiyeConversationKey(
      sourceMessages.find((message) => message.messageId)?.messageId,
      sourceThread.mailboxId,
      sourceThread.id,
    );
    const [targetThread] = await db
      .insert(agoojyeMailThreads)
      .values({
        tenantId,
        providerThreadId,
        mailboxIdentityId: mailbox ? identityByAddress.get(mailbox.email.toLowerCase()) || null : null,
        contactId: contact?.id || null,
        direction: externalInbound ? "inbound" : sourceMessages[sourceMessages.length - 1]?.direction || "inbound",
        subject: sourceThread.subject || "(Sans sujet)",
        status: "open",
        source: "maildir",
        lastMessageAt: sourceThread.lastMessageAt,
        tags: ["email", "roundcube"],
        createdAt: sourceThread.createdAt,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [agoojyeMailThreads.tenantId, agoojyeMailThreads.providerThreadId],
        set: {
          mailboxIdentityId: mailbox ? identityByAddress.get(mailbox.email.toLowerCase()) || null : null,
          contactId: contact?.id || null,
          subject: sourceThread.subject || "(Sans sujet)",
          lastMessageAt: sourceThread.lastMessageAt,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (!targetThread) continue;

    for (const sourceMessage of sourceMessages) {
      const providerMessageId = messageProviderId(sourceMessage);
      const createdAt = new Date(sourceMessage.createdAt);
      const [inserted] = await db
        .insert(agoojyeMailMessages)
        .values({
          tenantId,
          threadId: targetThread.id,
          providerMessageId,
          messageIdHeader: sourceMessage.messageId,
          inReplyTo: sourceMessage.inReplyTo,
          referencesHeader: asStringArray(sourceMessage.referencesJson).join(" ") || null,
          fromEmail: sourceMessage.fromEmail,
          toEmails: asStringArray(sourceMessage.toJson),
          ccEmails: asStringArray(sourceMessage.ccJson),
          subject: sourceMessage.subject || "(Sans sujet)",
          bodyText: sourceMessage.textBody,
          bodyPreview: String(sourceMessage.textBody || "").replace(/\s+/g, " ").trim().slice(0, 280) || null,
          direction: sourceMessage.direction,
          deliveryStatus: sourceMessage.status,
          receivedAt: sourceMessage.direction === "inbound" ? createdAt : null,
          sentAt: sourceMessage.direction === "outbound" ? createdAt : null,
          attachmentMetadata: {},
          createdAt,
          updatedAt: new Date(),
        })
        .onConflictDoNothing()
        .returning({ id: agoojyeMailMessages.id });

      messageCount += 1;
      if (!inserted) continue;
      newMessageCount += 1;

      const fromEmail = String(sourceMessage.fromEmail || "").trim().toLowerCase();
      if (sourceMessage.direction === "inbound" && contact?.id && fromEmail === contact.email?.toLowerCase()) {
        await stopPendingOutreachForReply(tenantId, contact.id, providerMessageId, createdAt);
        if (isExplicitOptOutMessage(sourceMessage.textBody)) {
          await addSuppression(tenantId, fromEmail, "explicit_opt_out", "inbound_email", createdAt);
        }
      }

      const bouncedRecipient = extractHardBounceRecipient(sourceMessage.textBody);
      if (bouncedRecipient) {
        await addSuppression(tenantId, bouncedRecipient, "hard_bounce", "delivery_status_notification", createdAt);
      }
    }
  }

  return { threads: threadRows.length, messages: messageCount, newMessages: newMessageCount };
}
