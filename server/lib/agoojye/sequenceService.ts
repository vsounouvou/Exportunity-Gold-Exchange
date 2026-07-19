import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "@db";
import {
  agoojyeBackgroundJobs,
  agoojyeCrmContacts,
  agoojyeCrmOrganizations,
  agoojyeEmailIdentities,
  agoojyeEmailTemplates,
  agoojyeOutreachApprovals,
  agoojyeOutreachSequences,
  agoojyeSequenceEnrollments,
  agoojyeSponsorOpportunities,
  agoojyeSuppressionEntries,
} from "@db/schema";

import { AGOOJIYE_HUMAN_MAILBOX_PROFILES, agoojiyeMailboxAddress } from "./mailBridgePolicy";
import {
  agoojiyeBeninDayStart,
  nextAgoojiyeSequenceRun,
  renderAgoojiyeSequenceTemplate,
  validateAgoojiyeSequencePolicy,
} from "./sequencePolicy";

export class AgoojiyeSequenceError extends Error {
  constructor(message: string, readonly statusCode = 409) {
    super(message);
  }
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function numericId(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function templateIds(value: unknown) {
  return Array.from(
    new Set((Array.isArray(value) ? value : []).map(Number).filter((id) => Number.isInteger(id) && id > 0)),
  );
}

function sequenceVariables(input: {
  contact: typeof agoojyeCrmContacts.$inferSelect;
  organization: typeof agoojyeCrmOrganizations.$inferSelect;
  opportunity: typeof agoojyeSponsorOpportunities.$inferSelect;
}) {
  return {
    contact_first_name: input.contact.firstName,
    contact_last_name: input.contact.lastName,
    contact_title: input.contact.jobTitle,
    organization_name: input.organization.name,
    organization_country: input.organization.country,
    sponsor_category: input.organization.sponsorCategory,
    opportunity_title: input.opportunity.title,
  };
}

function renderedMessage(
  template: typeof agoojyeEmailTemplates.$inferSelect,
  variables: Record<string, unknown>,
) {
  const signature = text(template.signature);
  const body = renderAgoojiyeSequenceTemplate(template.body, variables);
  return {
    subject: renderAgoojiyeSequenceTemplate(template.subject, variables),
    body: signature ? `${body}\n\n${renderAgoojiyeSequenceTemplate(signature, variables)}` : body,
  };
}

async function loadSequenceContext(input: {
  tenantId: number;
  sequenceId: number;
  opportunityId: number;
  contactId: number;
  senderIdentityId: number;
}) {
  const [sequence] = await db
    .select()
    .from(agoojyeOutreachSequences)
    .where(and(eq(agoojyeOutreachSequences.tenantId, input.tenantId), eq(agoojyeOutreachSequences.id, input.sequenceId)))
    .limit(1);
  if (!sequence) throw new AgoojiyeSequenceError("Sequence introuvable pour ce tenant.", 404);
  if (sequence.status !== "active") throw new AgoojiyeSequenceError("La sequence doit etre approuvee et active avant toute inscription.");

  const policy = validateAgoojiyeSequencePolicy({
    templateIds: templateIds(sequence.templateIds),
    maxSteps: sequence.maxSteps,
    minDelayHours: sequence.minDelayHours,
    dailyLimit: sequence.dailyLimit,
  });
  if (!policy.valid) throw new AgoojiyeSequenceError(policy.errors.join(" "));

  const [contact] = await db
    .select()
    .from(agoojyeCrmContacts)
    .where(and(eq(agoojyeCrmContacts.tenantId, input.tenantId), eq(agoojyeCrmContacts.id, input.contactId)))
    .limit(1);
  if (!contact) throw new AgoojiyeSequenceError("Contact introuvable pour ce tenant.", 404);
  if (!contact.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) {
    throw new AgoojiyeSequenceError("Le contact doit posseder une adresse email valide.");
  }
  if (!["verified", "approved"].includes(text(contact.verificationStatus).toLowerCase())) {
    throw new AgoojiyeSequenceError("Le contact doit etre verifie avant son inscription.");
  }
  if (contact.doNotContact) throw new AgoojiyeSequenceError("Ce contact est marque ne pas contacter.");

  const [opportunity] = await db
    .select()
    .from(agoojyeSponsorOpportunities)
    .where(
      and(
        eq(agoojyeSponsorOpportunities.tenantId, input.tenantId),
        eq(agoojyeSponsorOpportunities.id, input.opportunityId),
      ),
    )
    .limit(1);
  if (!opportunity) throw new AgoojiyeSequenceError("Opportunite introuvable pour ce tenant.", 404);
  if (opportunity.contactId && opportunity.contactId !== contact.id) {
    throw new AgoojiyeSequenceError("Le contact ne correspond pas a celui de l'opportunite.");
  }
  if (contact.organizationId !== opportunity.organizationId) {
    throw new AgoojiyeSequenceError("Le contact et l'opportunite n'appartiennent pas a la meme organisation.");
  }
  if (opportunity.doNotContact || ["paused", "won", "lost", "cancelled"].includes(text(opportunity.status).toLowerCase())) {
    throw new AgoojiyeSequenceError("Cette opportunite n'autorise pas de nouvelle sequence.");
  }

  const [organization] = await db
    .select()
    .from(agoojyeCrmOrganizations)
    .where(
      and(
        eq(agoojyeCrmOrganizations.tenantId, input.tenantId),
        eq(agoojyeCrmOrganizations.id, opportunity.organizationId),
      ),
    )
    .limit(1);
  if (!organization) throw new AgoojiyeSequenceError("Organisation CRM introuvable.", 404);
  if (organization.doNotContact) throw new AgoojiyeSequenceError("Cette organisation est marquee ne pas contacter.");

  const recipient = contact.email.toLowerCase();
  const [suppression] = await db
    .select({ id: agoojyeSuppressionEntries.id })
    .from(agoojyeSuppressionEntries)
    .where(
      and(
        eq(agoojyeSuppressionEntries.tenantId, input.tenantId),
        eq(agoojyeSuppressionEntries.email, recipient),
        eq(agoojyeSuppressionEntries.status, "active"),
      ),
    )
    .limit(1);
  if (suppression) throw new AgoojiyeSequenceError("Ce destinataire figure dans la liste de suppression AGOOJIYE.");

  const [sender] = await db
    .select()
    .from(agoojyeEmailIdentities)
    .where(
      and(
        eq(agoojyeEmailIdentities.tenantId, input.tenantId),
        eq(agoojyeEmailIdentities.id, input.senderIdentityId),
      ),
    )
    .limit(1);
  const humanProfile = sender
    ? AGOOJIYE_HUMAN_MAILBOX_PROFILES.find(
        (profile) => agoojiyeMailboxAddress(profile.localPart) === text(sender.emailAddress).toLowerCase(),
      )
    : null;
  if (!sender || sender.status !== "active" || !sender.canSend || !humanProfile) {
    throw new AgoojiyeSequenceError("Choisissez l'une des cinq identites humaines AGOOJIYE autorisees.");
  }

  const firstTemplateId = policy.templateIds[0];
  const [firstTemplate] = await db
    .select()
    .from(agoojyeEmailTemplates)
    .where(
      and(
        eq(agoojyeEmailTemplates.tenantId, input.tenantId),
        eq(agoojyeEmailTemplates.id, firstTemplateId),
        eq(agoojyeEmailTemplates.status, "approved"),
      ),
    )
    .limit(1);
  if (!firstTemplate) throw new AgoojiyeSequenceError("Le premier modele n'existe pas ou n'est pas approuve.");

  return { sequence, policy, contact, opportunity, organization, sender, firstTemplate };
}

export async function activateAgoojiyeSequence(input: { tenantId: number; sequenceId: number }) {
  const [sequence] = await db
    .select()
    .from(agoojyeOutreachSequences)
    .where(and(eq(agoojyeOutreachSequences.tenantId, input.tenantId), eq(agoojyeOutreachSequences.id, input.sequenceId)))
    .limit(1);
  if (!sequence) throw new AgoojiyeSequenceError("Sequence introuvable pour ce tenant.", 404);
  if (!["approved", "paused"].includes(sequence.status)) {
    throw new AgoojiyeSequenceError("La sequence doit etre approuvee avant son activation.");
  }

  const policy = validateAgoojiyeSequencePolicy({
    templateIds: templateIds(sequence.templateIds),
    maxSteps: sequence.maxSteps,
    minDelayHours: sequence.minDelayHours,
    dailyLimit: sequence.dailyLimit,
  });
  if (!policy.valid) throw new AgoojiyeSequenceError(policy.errors.join(" "));

  const approvedTemplates = await db
    .select({ id: agoojyeEmailTemplates.id })
    .from(agoojyeEmailTemplates)
    .where(
      and(
        eq(agoojyeEmailTemplates.tenantId, input.tenantId),
        inArray(agoojyeEmailTemplates.id, policy.templateIds),
        eq(agoojyeEmailTemplates.status, "approved"),
      ),
    );
  if (approvedTemplates.length !== policy.templateIds.length) {
    throw new AgoojiyeSequenceError("Tous les modeles de la sequence doivent etre approuves.");
  }

  const now = new Date();
  const [item] = await db
    .update(agoojyeOutreachSequences)
    .set({
      status: "active",
      templateIds: policy.templateIds,
      maxSteps: policy.maxSteps,
      minDelayHours: policy.minDelayHours,
      dailyLimit: policy.dailyLimit,
      updatedAt: now,
    })
    .where(and(eq(agoojyeOutreachSequences.tenantId, input.tenantId), eq(agoojyeOutreachSequences.id, input.sequenceId)))
    .returning();
  return item;
}

export async function enrollAgoojiyeSequence(input: {
  tenantId: number;
  sequenceId: number;
  opportunityId: number;
  contactId: number;
  senderIdentityId: number;
  actor: string;
  requesterUserId?: number | null;
}) {
  const context = await loadSequenceContext(input);
  const message = renderedMessage(
    context.firstTemplate,
    sequenceVariables({ contact: context.contact, organization: context.organization, opportunity: context.opportunity }),
  );
  const now = new Date();

  try {
    return await db.transaction(async (tx) => {
      const [enrollment] = await tx
        .insert(agoojyeSequenceEnrollments)
        .values({
          tenantId: input.tenantId,
          sequenceId: input.sequenceId,
          opportunityId: input.opportunityId,
          contactId: input.contactId,
          senderIdentityId: input.senderIdentityId,
          currentApprovalId: null,
          status: "awaiting_initial_approval",
          currentStep: 0,
          nextRunAt: null,
          lastSentAt: null,
          activatedBy: text(input.actor) || "admin",
          activatedAt: now,
          stopReason: null,
          completedAt: null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      const [approval] = await tx
        .insert(agoojyeOutreachApprovals)
        .values({
          tenantId: input.tenantId,
          opportunityId: input.opportunityId,
          contactId: input.contactId,
          templateId: context.firstTemplate.id,
          requesterUserId: input.requesterUserId ?? null,
          reviewerUserId: null,
          senderIdentityId: input.senderIdentityId,
          subject: message.subject,
          body: message.body,
          status: "awaiting_approval",
          scheduledAt: null,
          approvedAt: null,
          rejectedAt: null,
          sentAt: null,
          decisionNotes: "Premier message de sequence: verification et approbation humaine obligatoires.",
          agentResearchJson: {
            sequenceId: input.sequenceId,
            sequenceEnrollmentId: enrollment.id,
            stepIndex: 0,
            automatedFollowUp: false,
            humanApprovalRequired: true,
          },
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      const [item] = await tx
        .update(agoojyeSequenceEnrollments)
        .set({ currentApprovalId: approval.id, updatedAt: now })
        .where(eq(agoojyeSequenceEnrollments.id, enrollment.id))
        .returning();
      return { enrollment: item, approval };
    });
  } catch (error: any) {
    if (String(error?.code || "") === "23505" || /unique/i.test(text(error?.message))) {
      throw new AgoojiyeSequenceError("Ce contact est deja inscrit a cette sequence.");
    }
    throw error;
  }
}

export async function stopAgoojiyeSequenceEnrollment(input: {
  tenantId: number;
  enrollmentId: number;
  reason: string;
}) {
  const now = new Date();
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(agoojyeSequenceEnrollments)
      .where(
        and(
          eq(agoojyeSequenceEnrollments.tenantId, input.tenantId),
          eq(agoojyeSequenceEnrollments.id, input.enrollmentId),
        ),
      )
      .limit(1);
    if (!current) return null;
    if (["stopped", "completed", "cancelled"].includes(current.status)) return current;

    const [item] = await tx
      .update(agoojyeSequenceEnrollments)
      .set({ status: "stopped", stopReason: text(input.reason).slice(0, 500) || "manual_stop", nextRunAt: null, updatedAt: now })
      .where(and(eq(agoojyeSequenceEnrollments.tenantId, input.tenantId), eq(agoojyeSequenceEnrollments.id, input.enrollmentId)))
      .returning();

    if (current.currentApprovalId) {
      await tx
        .update(agoojyeOutreachApprovals)
        .set({ status: "cancelled", decisionNotes: `Sequence arretee: ${text(input.reason).slice(0, 400)}`, updatedAt: now })
        .where(
          and(
            eq(agoojyeOutreachApprovals.tenantId, input.tenantId),
            eq(agoojyeOutreachApprovals.id, current.currentApprovalId),
            inArray(agoojyeOutreachApprovals.status, ["awaiting_approval", "approved", "scheduled", "failed"]),
          ),
        );
      await tx
        .update(agoojyeBackgroundJobs)
        .set({ status: "cancelled", completedAt: now, error: `Sequence arretee: ${text(input.reason).slice(0, 400)}`, updatedAt: now })
        .where(
          and(
            eq(agoojyeBackgroundJobs.tenantId, input.tenantId),
            eq(agoojyeBackgroundJobs.relatedEntityType, "outreach_approval"),
            eq(agoojyeBackgroundJobs.relatedEntityId, current.currentApprovalId),
            eq(agoojyeBackgroundJobs.status, "queued"),
          ),
        );
    }
    return item;
  });
}

export async function stopAgoojiyeSequencesForContact(input: { tenantId: number; contactId: number; reason: string }) {
  const enrollments = await db
    .select({ id: agoojyeSequenceEnrollments.id })
    .from(agoojyeSequenceEnrollments)
    .where(
      and(
        eq(agoojyeSequenceEnrollments.tenantId, input.tenantId),
        eq(agoojyeSequenceEnrollments.contactId, input.contactId),
        inArray(agoojyeSequenceEnrollments.status, ["awaiting_initial_approval", "active"]),
      ),
    );
  for (const enrollment of enrollments) {
    // Sequential cancellation keeps each enrollment and its queued approval consistent.
    // eslint-disable-next-line no-await-in-loop
    await stopAgoojiyeSequenceEnrollment({ tenantId: input.tenantId, enrollmentId: enrollment.id, reason: input.reason });
  }
  return enrollments.length;
}

export async function advanceAgoojiyeSequenceAfterSend(input: {
  tenantId: number;
  approval: typeof agoojyeOutreachApprovals.$inferSelect;
  sentAt: Date;
}) {
  const metadata = record(input.approval.agentResearchJson);
  const enrollmentId = numericId(metadata.sequenceEnrollmentId);
  const sequenceId = numericId(metadata.sequenceId);
  const stepIndex = Number(metadata.stepIndex);
  if (!enrollmentId || !sequenceId || !Number.isInteger(stepIndex) || stepIndex < 0) return { advanced: false };

  const [enrollment] = await db
    .select()
    .from(agoojyeSequenceEnrollments)
    .where(
      and(
        eq(agoojyeSequenceEnrollments.tenantId, input.tenantId),
        eq(agoojyeSequenceEnrollments.id, enrollmentId),
        eq(agoojyeSequenceEnrollments.sequenceId, sequenceId),
      ),
    )
    .limit(1);
  if (!enrollment || enrollment.currentApprovalId !== input.approval.id || enrollment.currentStep !== stepIndex) {
    return { advanced: false };
  }

  const [sequence] = await db
    .select()
    .from(agoojyeOutreachSequences)
    .where(and(eq(agoojyeOutreachSequences.tenantId, input.tenantId), eq(agoojyeOutreachSequences.id, sequenceId)))
    .limit(1);
  if (!sequence || sequence.status !== "active") {
    await stopAgoojiyeSequenceEnrollment({ tenantId: input.tenantId, enrollmentId, reason: "sequence_inactive" });
    return { advanced: false, stopped: true };
  }

  const ids = templateIds(sequence.templateIds).slice(0, Math.max(1, sequence.maxSteps));
  const nextStep = stepIndex + 1;
  if (nextStep >= ids.length) {
    const [completed] = await db
      .update(agoojyeSequenceEnrollments)
      .set({
        status: "completed",
        currentStep: nextStep,
        currentApprovalId: null,
        nextRunAt: null,
        lastSentAt: input.sentAt,
        completedAt: input.sentAt,
        updatedAt: input.sentAt,
      })
      .where(
        and(
          eq(agoojyeSequenceEnrollments.tenantId, input.tenantId),
          eq(agoojyeSequenceEnrollments.id, enrollmentId),
          eq(agoojyeSequenceEnrollments.currentApprovalId, input.approval.id),
          eq(agoojyeSequenceEnrollments.currentStep, stepIndex),
        ),
      )
      .returning();
    return { advanced: Boolean(completed), completed: Boolean(completed) };
  }

  const [template, contact, opportunity] = await Promise.all([
    db
      .select()
      .from(agoojyeEmailTemplates)
      .where(
        and(
          eq(agoojyeEmailTemplates.tenantId, input.tenantId),
          eq(agoojyeEmailTemplates.id, ids[nextStep]),
          eq(agoojyeEmailTemplates.status, "approved"),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select()
      .from(agoojyeCrmContacts)
      .where(and(eq(agoojyeCrmContacts.tenantId, input.tenantId), eq(agoojyeCrmContacts.id, enrollment.contactId)))
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select()
      .from(agoojyeSponsorOpportunities)
      .where(
        and(
          eq(agoojyeSponsorOpportunities.tenantId, input.tenantId),
          eq(agoojyeSponsorOpportunities.id, enrollment.opportunityId),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]),
  ]);
  if (!template || !contact || !opportunity) {
    await stopAgoojiyeSequenceEnrollment({ tenantId: input.tenantId, enrollmentId, reason: "sequence_context_missing" });
    return { advanced: false, stopped: true };
  }
  const [organization] = await db
    .select()
    .from(agoojyeCrmOrganizations)
    .where(
      and(
        eq(agoojyeCrmOrganizations.tenantId, input.tenantId),
        eq(agoojyeCrmOrganizations.id, opportunity.organizationId),
      ),
    )
    .limit(1);
  if (!organization) {
    await stopAgoojiyeSequenceEnrollment({ tenantId: input.tenantId, enrollmentId, reason: "organization_missing" });
    return { advanced: false, stopped: true };
  }

  const message = renderedMessage(template, sequenceVariables({ contact, organization, opportunity }));
  const scheduledAt = nextAgoojiyeSequenceRun({
    from: input.sentAt,
    minDelayHours: sequence.minDelayHours,
    businessHours: sequence.businessHours,
  });
  const now = new Date();

  return db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(agoojyeSequenceEnrollments)
      .set({
        status: "active",
        currentStep: nextStep,
        currentApprovalId: null,
        nextRunAt: scheduledAt,
        lastSentAt: input.sentAt,
        updatedAt: now,
      })
      .where(
        and(
          eq(agoojyeSequenceEnrollments.tenantId, input.tenantId),
          eq(agoojyeSequenceEnrollments.id, enrollmentId),
          eq(agoojyeSequenceEnrollments.currentApprovalId, input.approval.id),
          eq(agoojyeSequenceEnrollments.currentStep, stepIndex),
          inArray(agoojyeSequenceEnrollments.status, ["awaiting_initial_approval", "active"]),
        ),
      )
      .returning();
    if (!claimed) return { advanced: false };

    const [approval] = await tx
      .insert(agoojyeOutreachApprovals)
      .values({
        tenantId: input.tenantId,
        opportunityId: enrollment.opportunityId,
        contactId: enrollment.contactId,
        templateId: template.id,
        requesterUserId: null,
        reviewerUserId: null,
        senderIdentityId: enrollment.senderIdentityId,
        subject: message.subject,
        body: message.body,
        status: "scheduled",
        scheduledAt,
        approvedAt: enrollment.activatedAt || input.sentAt,
        rejectedAt: null,
        sentAt: null,
        decisionNotes: `Suivi ${nextStep + 1}/${ids.length} autorise par l'activation humaine de la sequence.`,
        agentResearchJson: {
          sequenceId,
          sequenceEnrollmentId: enrollmentId,
          stepIndex: nextStep,
          automatedFollowUp: true,
          sequenceActivatedBy: enrollment.activatedBy,
          sequenceActivatedAt: enrollment.activatedAt?.toISOString() || null,
        },
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    await tx.insert(agoojyeBackgroundJobs).values({
      tenantId: input.tenantId,
      jobType: "follow_up",
      status: "queued",
      attemptCount: 0,
      scheduledAt,
      startedAt: null,
      completedAt: null,
      error: null,
      relatedEntityType: "outreach_approval",
      relatedEntityId: approval.id,
      createdBy: enrollment.activatedBy || "agoojye-sequence",
      payloadJson: { approvalId: approval.id, sequenceEnrollmentId: enrollmentId, maxAttempts: 3 },
      resultJson: {},
      createdAt: now,
      updatedAt: now,
    });
    await tx
      .update(agoojyeSequenceEnrollments)
      .set({ currentApprovalId: approval.id, updatedAt: now })
      .where(eq(agoojyeSequenceEnrollments.id, enrollmentId));
    await tx
      .update(agoojyeSponsorOpportunities)
      .set({ nextAction: `Suivi sequence ${nextStep + 1}/${ids.length}`, nextActionDate: scheduledAt, updatedAt: now })
      .where(and(eq(agoojyeSponsorOpportunities.tenantId, input.tenantId), eq(agoojyeSponsorOpportunities.id, enrollment.opportunityId)));
    return { advanced: true, approvalId: approval.id, stepIndex: nextStep, scheduledAt };
  });
}

export async function evaluateAgoojiyeSequenceFollowUp(input: {
  tenantId: number;
  approval: typeof agoojyeOutreachApprovals.$inferSelect;
  now?: Date;
}) {
  const metadata = record(input.approval.agentResearchJson);
  const enrollmentId = numericId(metadata.sequenceEnrollmentId);
  const sequenceId = numericId(metadata.sequenceId);
  if (!enrollmentId || !sequenceId) return { enrollmentId: null, stopReason: null, deferUntil: null };

  const [enrollment, sequence] = await Promise.all([
    db
      .select()
      .from(agoojyeSequenceEnrollments)
      .where(
        and(
          eq(agoojyeSequenceEnrollments.tenantId, input.tenantId),
          eq(agoojyeSequenceEnrollments.id, enrollmentId),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select()
      .from(agoojyeOutreachSequences)
      .where(and(eq(agoojyeOutreachSequences.tenantId, input.tenantId), eq(agoojyeOutreachSequences.id, sequenceId)))
      .limit(1)
      .then((rows) => rows[0]),
  ]);
  if (!enrollment || !["active"].includes(enrollment.status) || enrollment.currentApprovalId !== input.approval.id) {
    return { enrollmentId, stopReason: "sequence_enrollment_inactive", deferUntil: null };
  }
  if (!sequence || sequence.status !== "active") {
    return { enrollmentId, stopReason: "sequence_inactive", deferUntil: null };
  }

  const now = input.now || new Date();
  const [sentToday] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(agoojyeOutreachApprovals)
    .where(
      and(
        eq(agoojyeOutreachApprovals.tenantId, input.tenantId),
        eq(agoojyeOutreachApprovals.status, "sent"),
        sql`${agoojyeOutreachApprovals.sentAt} >= ${agoojiyeBeninDayStart(now)}`,
        sql`${agoojyeOutreachApprovals.agentResearchJson} ->> 'sequenceId' = ${String(sequenceId)}`,
      ),
    );
  if (Number(sentToday?.value || 0) >= sequence.dailyLimit) {
    return {
      enrollmentId,
      stopReason: null,
      deferUntil: nextAgoojiyeSequenceRun({ from: now, minDelayHours: 24, businessHours: sequence.businessHours }),
    };
  }
  return { enrollmentId, stopReason: null, deferUntil: null };
}
