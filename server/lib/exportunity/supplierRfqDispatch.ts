import { and, desc, eq } from "drizzle-orm";

import { db } from "@db";
import {
  emailUnsubscribes,
  industrialAuditLogs,
  industrialSupplierContactControls,
  industrialSupplierContactSuppressions,
  industrialSupplierProfiles,
  industrialSupplierPromotions,
  industrialSupplierRfqDecisions,
  industrialSupplierRfqDispatches,
} from "@db/schema";
import { ensureIndustrialTables } from "../industrial/ensureTables";
import { ensureMailEngineTables } from "../mail/ensureTables";
import { sendEmailAsAgent } from "../mail/sender";
import { sendWaText } from "../whatsapp/waGateway";
import { loadGovernedSupplierRfqDispatchContext } from "./supplierRfq";
import {
  assertSupplierRfqWhatsAppLength,
  channelForVerifiedPromotionContact,
  computeSupplierRfqDispatchIdempotencyKey,
  hashSupplierRfqDispatchContact,
  normalizeSupplierRfqDispatchContact,
  parseSupplierRfqContactControlInput,
  parseSupplierRfqDispatchInput,
  redactSupplierRfqProviderError,
} from "./supplierRfqDispatchPolicy";
import { EXPORTUNITY_SUPPLIER_VERIFICATION_SCOPE } from "./supplierVerificationPolicy";

const EXPORTUNITY_RFQ_SENDER_AGENT_KEY = "sourcing";

export class SupplierRfqDispatchServiceError extends Error {
  code: string;
  statusCode: number;

  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.name = "SupplierRfqDispatchServiceError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function assertExportunityTenant(tenantKey: string) {
  if (String(tenantKey || "").trim().toLowerCase() !== "exportunity") {
    throw new SupplierRfqDispatchServiceError(
      "SUPPLIER_RFQ_DISPATCH_TENANT_INVALID",
      404,
      "Supplier RFQ dispatch is available only inside Exportunity.",
    );
  }
}

function actorId(value: number | null | undefined) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new SupplierRfqDispatchServiceError(
      "SUPPLIER_RFQ_DISPATCH_ACTOR_REQUIRED",
      403,
      "An authenticated Exportunity administrator is required.",
    );
  }
  return parsed;
}

function iso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function contactControlResponse(
  control: typeof industrialSupplierContactControls.$inferSelect,
) {
  return {
    id: control.id,
    supplierProfileId: control.supplierProfileId,
    sourcePromotionId: control.sourcePromotionId,
    channel: control.channel,
    contactHash: control.contactHash,
    contactMasked: control.contactMasked,
    state: control.state,
    authorizationBasis: control.authorizationBasis,
    evidenceReference: control.evidenceReference,
    notes: control.notes,
    authorizedAt: iso(control.authorizedAt),
    authorizationExpiresAt: iso(control.authorizationExpiresAt),
    suppressedAt: iso(control.suppressedAt),
    suppressionReason: control.suppressionReason,
    createdAt: control.createdAt.toISOString(),
    updatedAt: control.updatedAt.toISOString(),
  };
}

function contactSuppressionResponse(
  suppression: typeof industrialSupplierContactSuppressions.$inferSelect,
) {
  return {
    id: suppression.id,
    channel: suppression.channel,
    contactHash: suppression.contactHash,
    contactMasked: suppression.contactMasked,
    reason: suppression.reason,
    sourceKind: suppression.sourceKind,
    sourceEmailMessageId: suppression.sourceEmailMessageId,
    sourceCommunicationsMessageId: suppression.sourceCommunicationsMessageId,
    createdAt: suppression.createdAt.toISOString(),
    updatedAt: suppression.updatedAt.toISOString(),
  };
}

function dispatchResponse(dispatch: typeof industrialSupplierRfqDispatches.$inferSelect) {
  return {
    id: dispatch.id,
    rfqDraftId: dispatch.rfqDraftId,
    decisionId: dispatch.decisionId,
    contactControlId: dispatch.contactControlId,
    contactAuthorizationBasis: dispatch.contactAuthorizationBasis,
    contactEvidenceReference: dispatch.contactEvidenceReference,
    contactAuthorizedAt: dispatch.contactAuthorizedAt.toISOString(),
    contactAuthorizationExpiresAt:
      dispatch.contactAuthorizationExpiresAt.toISOString(),
    supplierProfileId: dispatch.supplierProfileId,
    channel: dispatch.channel,
    contentHash: dispatch.contentHash,
    recipientHash: dispatch.recipientHash,
    recipientMasked: dispatch.recipientMasked,
    senderAgentKey: dispatch.senderAgentKey,
    idempotencyKey: dispatch.idempotencyKey,
    checklist: dispatch.checklist,
    dispatchNotes: dispatch.dispatchNotes,
    status: dispatch.status,
    attemptCount: dispatch.attemptCount,
    reservedAt: dispatch.reservedAt.toISOString(),
    attemptedAt: iso(dispatch.attemptedAt),
    completedAt: iso(dispatch.completedAt),
    providerMessageId: dispatch.providerMessageId,
    providerStatus: dispatch.providerStatus,
    providerResponse: dispatch.providerResponse,
    errorCode: dispatch.errorCode,
    errorMessage: dispatch.errorMessage,
    createdAt: dispatch.createdAt.toISOString(),
    updatedAt: dispatch.updatedAt.toISOString(),
  };
}

export async function listSupplierRfqDispatchGovernance(input: {
  tenantId: number;
  tenantKey: string;
  limit?: number;
}) {
  assertExportunityTenant(input.tenantKey);
  await ensureIndustrialTables();
  const limit = Math.max(1, Math.min(250, Math.trunc(Number(input.limit) || 100)));
  const [controls, contactSuppressions, dispatches] = await Promise.all([
    db
      .select()
      .from(industrialSupplierContactControls)
      .where(eq(industrialSupplierContactControls.tenantId, input.tenantId))
      .orderBy(desc(industrialSupplierContactControls.updatedAt))
      .limit(limit),
    db
      .select()
      .from(industrialSupplierContactSuppressions)
      .where(eq(industrialSupplierContactSuppressions.tenantId, input.tenantId))
      .orderBy(desc(industrialSupplierContactSuppressions.updatedAt))
      .limit(limit),
    db
      .select()
      .from(industrialSupplierRfqDispatches)
      .where(eq(industrialSupplierRfqDispatches.tenantId, input.tenantId))
      .orderBy(desc(industrialSupplierRfqDispatches.updatedAt))
      .limit(limit),
  ]);

  return {
    contactControls: controls.map(contactControlResponse),
    contactSuppressions: contactSuppressions.map(contactSuppressionResponse),
    dispatches: dispatches.map(dispatchResponse),
    governance: {
      verifiedContactIsNotPermission: true as const,
      explicitControlRequired: true as const,
      suppressionWins: true as const,
      oneDecisionOneDispatch: true as const,
      maximumProviderAttempts: 1 as const,
      automaticRetry: false as const,
      acceptedIsNotDelivered: true as const,
      supportedChannels: ["email", "whatsapp"] as const,
    },
  };
}

export async function setSupplierRfqContactControl(input: {
  tenantId: number;
  tenantKey: string;
  actorUserId: number | null;
  payload: unknown;
}) {
  assertExportunityTenant(input.tenantKey);
  await ensureIndustrialTables();
  const userId = actorId(input.actorUserId);
  const now = new Date();
  const parsed = parseSupplierRfqContactControlInput(input.payload, { now });

  return db.transaction(async (tx) => {
    const [profile] = await tx
      .select({
        id: industrialSupplierProfiles.id,
        email: industrialSupplierProfiles.email,
        phone: industrialSupplierProfiles.phone,
        supplierStatus: industrialSupplierProfiles.supplierStatus,
        verificationStatus: industrialSupplierProfiles.verificationStatus,
        visibility: industrialSupplierProfiles.visibility,
      })
      .from(industrialSupplierProfiles)
      .where(
        and(
          eq(industrialSupplierProfiles.id, parsed.supplierProfileId),
          eq(industrialSupplierProfiles.tenantId, input.tenantId),
        ),
      )
      .limit(1);
    if (!profile) {
      throw new SupplierRfqDispatchServiceError(
        "SUPPLIER_RFQ_CONTACT_SUPPLIER_NOT_FOUND",
        404,
        "The private Exportunity supplier profile was not found.",
      );
    }
    if (
      profile.supplierStatus !== "active" ||
      profile.verificationStatus !== "verified" ||
      profile.visibility !== "exportunity_internal"
    ) {
      throw new SupplierRfqDispatchServiceError(
        "SUPPLIER_RFQ_CONTACT_SUPPLIER_INELIGIBLE",
        409,
        "The supplier is no longer active, verified, and private to Exportunity.",
      );
    }

    const profileContact = parsed.channel === "email" ? profile.email : profile.phone;
    let normalizedProfileContact: string;
    try {
      normalizedProfileContact = normalizeSupplierRfqDispatchContact(
        parsed.channel,
        profileContact,
      );
    } catch {
      throw new SupplierRfqDispatchServiceError(
        "SUPPLIER_RFQ_CONTACT_PROFILE_CHANGED",
        409,
        "The supplier profile no longer contains the reviewed channel contact.",
      );
    }
    if (normalizedProfileContact !== parsed.contactValue) {
      throw new SupplierRfqDispatchServiceError(
        "SUPPLIER_RFQ_CONTACT_PROFILE_CHANGED",
        409,
        "The submitted contact no longer matches the private supplier profile.",
      );
    }

    if (parsed.state === "authorized") {
      const [globalSuppression] = await tx
        .select({ id: industrialSupplierContactSuppressions.id })
        .from(industrialSupplierContactSuppressions)
        .where(
          and(
            eq(industrialSupplierContactSuppressions.tenantId, input.tenantId),
            eq(industrialSupplierContactSuppressions.channel, parsed.channel),
            eq(
              industrialSupplierContactSuppressions.contactHash,
              parsed.contactHash,
            ),
          ),
        )
        .limit(1);
      if (globalSuppression) {
        throw new SupplierRfqDispatchServiceError(
          "SUPPLIER_RFQ_CONTACT_GLOBALLY_SUPPRESSED",
          409,
          "This recipient opted out of Exportunity supplier RFQs and cannot be reauthorized under another supplier profile.",
        );
      }
    }

    if (parsed.state === "authorized") {
      const [promotion] = await tx
        .select({
          id: industrialSupplierPromotions.id,
          supplierProfileId: industrialSupplierPromotions.supplierProfileId,
          verificationScope: industrialSupplierPromotions.verificationScope,
          contactType: industrialSupplierPromotions.contactType,
          contactValue: industrialSupplierPromotions.contactValue,
          outreachAllowed: industrialSupplierPromotions.outreachAllowed,
        })
        .from(industrialSupplierPromotions)
        .where(
          and(
            eq(industrialSupplierPromotions.id, parsed.sourcePromotionId!),
            eq(industrialSupplierPromotions.tenantId, input.tenantId),
            eq(industrialSupplierPromotions.supplierProfileId, parsed.supplierProfileId),
          ),
        )
        .limit(1);
      let normalizedPromotionContact: string | null = null;
      if (promotion) {
        try {
          normalizedPromotionContact = normalizeSupplierRfqDispatchContact(
            parsed.channel,
            promotion.contactValue,
          );
        } catch {
          normalizedPromotionContact = null;
        }
      }
      if (
        !promotion ||
        promotion.verificationScope !== EXPORTUNITY_SUPPLIER_VERIFICATION_SCOPE ||
        promotion.outreachAllowed !== false ||
        channelForVerifiedPromotionContact(promotion.contactType) !== parsed.channel ||
        normalizedPromotionContact !== parsed.contactValue
      ) {
        throw new SupplierRfqDispatchServiceError(
          "SUPPLIER_RFQ_CONTACT_PROMOTION_INVALID",
          409,
          "Authorization requires the same human-verified promotion contact; verification itself still grants no outreach.",
        );
      }
    }

    const [previous] = await tx
      .select()
      .from(industrialSupplierContactControls)
      .where(
        and(
          eq(industrialSupplierContactControls.tenantId, input.tenantId),
          eq(
            industrialSupplierContactControls.supplierProfileId,
            parsed.supplierProfileId,
          ),
          eq(industrialSupplierContactControls.channel, parsed.channel),
          eq(industrialSupplierContactControls.contactHash, parsed.contactHash),
        ),
      )
      .limit(1);

    const controlValues = {
      sourcePromotionId: parsed.sourcePromotionId,
      contactMasked: parsed.contactMasked,
      state: parsed.state,
      authorizationBasis: parsed.authorizationBasis,
      evidenceReference: parsed.evidenceReference,
      notes: parsed.notes,
      authorizedByUserId: parsed.state === "authorized" ? userId : null,
      authorizedAt: parsed.state === "authorized" ? now : null,
      authorizationExpiresAt: parsed.authorizationExpiresAt,
      suppressedByUserId: parsed.state === "suppressed" ? userId : null,
      suppressedAt: parsed.state === "suppressed" ? now : null,
      suppressionReason: parsed.suppressionReason,
      updatedAt: now,
    };

    const [saved] = await tx
      .insert(industrialSupplierContactControls)
      .values({
        tenantId: input.tenantId,
        supplierProfileId: parsed.supplierProfileId,
        channel: parsed.channel,
        contactHash: parsed.contactHash,
        createdAt: now,
        ...controlValues,
      })
      .onConflictDoUpdate({
        target: [
          industrialSupplierContactControls.tenantId,
          industrialSupplierContactControls.supplierProfileId,
          industrialSupplierContactControls.channel,
          industrialSupplierContactControls.contactHash,
        ],
        set: controlValues,
      })
      .returning();

    await tx.insert(industrialAuditLogs).values({
      tenantId: input.tenantId,
      actorUserId: userId,
      action: `industrial_supplier_contact.${parsed.state}`,
      entityType: "industrial_supplier_contact_control",
      entityId: saved.id,
      reason: parsed.state === "suppressed" ? parsed.suppressionReason : parsed.notes,
      previousValue: previous
        ? contactControlResponse(previous)
        : { state: null, contactHash: parsed.contactHash },
      nextValue: contactControlResponse(saved),
      metadata: {
        supplierProfileId: parsed.supplierProfileId,
        sourcePromotionId: parsed.sourcePromotionId,
        channel: parsed.channel,
        contactHash: parsed.contactHash,
        contactMasked: parsed.contactMasked,
        rawContactStored: false,
        externalSideEffect: false,
      },
      createdAt: now,
    });

    return {
      contactControl: contactControlResponse(saved),
      updated: Boolean(previous),
      evidence: {
        entity_ids: [saved.id],
        affected_rows: 1,
        raw_contact_stored: false,
      },
    };
  });
}

async function reserveSupplierRfqDispatch(input: {
  tenantId: number;
  actorUserId: number;
  draftId: string;
  payload: unknown;
  correlationId: string;
}) {
  const parsed = parseSupplierRfqDispatchInput(input.payload);
  const now = new Date();

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(industrialSupplierRfqDispatches)
      .where(
        and(
          eq(industrialSupplierRfqDispatches.tenantId, input.tenantId),
          eq(industrialSupplierRfqDispatches.rfqDraftId, input.draftId),
        ),
      )
      .limit(1);
    if (existing) {
      return { shouldSend: false as const, dispatch: existing };
    }

    const { draft, anchor, decision } = await loadGovernedSupplierRfqDispatchContext(
      tx,
      { tenantId: input.tenantId, draftId: input.draftId },
    );
    if (
      draft.status !== "approved_for_outreach" ||
      !decision ||
      decision.decision !== "approved" ||
      decision.outreachAuthorized !== true
    ) {
      throw new SupplierRfqDispatchServiceError(
        "SUPPLIER_RFQ_DISPATCH_NOT_AUTHORIZED",
        409,
        "This exact RFQ revision does not have a current outreach approval.",
      );
    }
    if (decision.dispatchCreated) {
      throw new SupplierRfqDispatchServiceError(
        "SUPPLIER_RFQ_DISPATCH_ALREADY_CONSUMED",
        409,
        "This outreach authorization has already been consumed.",
      );
    }
    if (
      !decision.authorizationExpiresAt ||
      decision.authorizationExpiresAt.getTime() <= now.getTime() ||
      draft.responseDeadline.getTime() <= now.getTime()
    ) {
      throw new SupplierRfqDispatchServiceError(
        "SUPPLIER_RFQ_DISPATCH_AUTHORIZATION_EXPIRED",
        409,
        "The RFQ outreach authorization or response deadline has expired.",
      );
    }
    if (
      parsed.expectedContentHash !== draft.contentHash ||
      decision.contentHash !== draft.contentHash
    ) {
      throw new SupplierRfqDispatchServiceError(
        "SUPPLIER_RFQ_DISPATCH_CONTENT_CHANGED",
        409,
        "Dispatch is blocked because the exact approved content hash does not match.",
      );
    }

    const verifiedChannel = channelForVerifiedPromotionContact(
      anchor.promotionContactType,
    );
    if (!verifiedChannel || verifiedChannel !== parsed.channel) {
      throw new SupplierRfqDispatchServiceError(
        "SUPPLIER_RFQ_DISPATCH_CHANNEL_MISMATCH",
        409,
        "The selected channel does not match the human-verified promotion contact.",
      );
    }
    const normalizedContact = normalizeSupplierRfqDispatchContact(
      parsed.channel,
      anchor.promotionContactValue,
    );
    const recipientHash = hashSupplierRfqDispatchContact(
      parsed.channel,
      normalizedContact,
    );
    if (recipientHash !== parsed.expectedRecipientHash) {
      throw new SupplierRfqDispatchServiceError(
        "SUPPLIER_RFQ_DISPATCH_RECIPIENT_CHANGED",
        409,
        "The recipient no longer matches the contact reviewed by the administrator.",
      );
    }
    const [globalSuppression] = await tx
      .select({ id: industrialSupplierContactSuppressions.id })
      .from(industrialSupplierContactSuppressions)
      .where(
        and(
          eq(industrialSupplierContactSuppressions.tenantId, input.tenantId),
          eq(industrialSupplierContactSuppressions.channel, parsed.channel),
          eq(industrialSupplierContactSuppressions.contactHash, recipientHash),
        ),
      )
      .limit(1);
    if (globalSuppression) {
      throw new SupplierRfqDispatchServiceError(
        "SUPPLIER_RFQ_DISPATCH_RECIPIENT_SUPPRESSED",
        409,
        "The recipient opted out of Exportunity supplier RFQs.",
      );
    }
    if (parsed.channel === "whatsapp") {
      assertSupplierRfqWhatsAppLength(draft.messageBody);
    }

    const [control] = await tx
      .select()
      .from(industrialSupplierContactControls)
      .where(
        and(
          eq(industrialSupplierContactControls.tenantId, input.tenantId),
          eq(industrialSupplierContactControls.supplierProfileId, draft.supplierProfileId),
          eq(industrialSupplierContactControls.channel, parsed.channel),
          eq(industrialSupplierContactControls.contactHash, recipientHash),
        ),
      )
      .limit(1);
    if (
      !control ||
      control.state !== "authorized" ||
      control.sourcePromotionId !== draft.promotionId ||
      !control.authorizationBasis ||
      !control.evidenceReference ||
      !control.authorizedAt ||
      !control.authorizationExpiresAt ||
      control.authorizationExpiresAt.getTime() <= now.getTime()
    ) {
      throw new SupplierRfqDispatchServiceError(
        "SUPPLIER_RFQ_DISPATCH_CONTACT_NOT_AUTHORIZED",
        409,
        "The exact recipient and channel do not have a current Exportunity contact authorization, or they are suppressed.",
      );
    }

    if (parsed.channel === "email") {
      const [unsubscribe] = await tx
        .select({ id: emailUnsubscribes.id })
        .from(emailUnsubscribes)
        .where(
          and(
            eq(emailUnsubscribes.tenantId, input.tenantId),
            eq(emailUnsubscribes.email, normalizedContact),
          ),
        )
        .limit(1);
      if (unsubscribe) {
        throw new SupplierRfqDispatchServiceError(
          "SUPPLIER_RFQ_DISPATCH_RECIPIENT_SUPPRESSED",
          409,
          "The recipient appears in the tenant unsubscribe registry.",
        );
      }
    }

    const idempotencyKey = computeSupplierRfqDispatchIdempotencyKey({
      decisionId: decision.id,
      contentHash: draft.contentHash,
      channel: parsed.channel,
      recipientHash,
    });
    const [created] = await tx
      .insert(industrialSupplierRfqDispatches)
      .values({
        tenantId: input.tenantId,
        rfqDraftId: draft.id,
        decisionId: decision.id,
        contactControlId: control.id,
        contactAuthorizationBasis: control.authorizationBasis,
        contactEvidenceReference: control.evidenceReference,
        contactAuthorizedAt: control.authorizedAt,
        contactAuthorizationExpiresAt: control.authorizationExpiresAt,
        supplierProfileId: draft.supplierProfileId,
        channel: parsed.channel,
        contentHash: draft.contentHash,
        recipientHash,
        recipientMasked: control.contactMasked,
        senderAgentKey: EXPORTUNITY_RFQ_SENDER_AGENT_KEY,
        idempotencyKey,
        checklist: parsed.checklist,
        dispatchNotes: parsed.dispatchNotes,
        status: "reserved",
        attemptCount: 0,
        reservedByUserId: input.actorUserId,
        reservedAt: now,
        providerResponse: {},
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning();
    if (!created) {
      const [concurrent] = await tx
        .select()
        .from(industrialSupplierRfqDispatches)
        .where(
          and(
            eq(industrialSupplierRfqDispatches.tenantId, input.tenantId),
            eq(industrialSupplierRfqDispatches.rfqDraftId, draft.id),
          ),
        )
        .limit(1);
      if (concurrent) return { shouldSend: false as const, dispatch: concurrent };
      throw new SupplierRfqDispatchServiceError(
        "SUPPLIER_RFQ_DISPATCH_CONFLICT",
        409,
        "Another administrator consumed this outreach authorization.",
      );
    }

    const consumed = await tx
      .update(industrialSupplierRfqDecisions)
      .set({ dispatchCreated: true })
      .where(
        and(
          eq(industrialSupplierRfqDecisions.id, decision.id),
          eq(industrialSupplierRfqDecisions.tenantId, input.tenantId),
          eq(industrialSupplierRfqDecisions.decision, "approved"),
          eq(industrialSupplierRfqDecisions.dispatchCreated, false),
        ),
      )
      .returning({ id: industrialSupplierRfqDecisions.id });
    if (!consumed[0]) {
      throw new SupplierRfqDispatchServiceError(
        "SUPPLIER_RFQ_DISPATCH_DECISION_CONFLICT",
        409,
        "The one-time outreach authorization was consumed concurrently.",
      );
    }

    await tx.insert(industrialAuditLogs).values({
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      action: "industrial_supplier_rfq.dispatch_reserved",
      entityType: "industrial_supplier_rfq_dispatch",
      entityId: created.id,
      reason: parsed.dispatchNotes,
      previousValue: { dispatchCreated: false, status: null },
      nextValue: {
        dispatchCreated: true,
        status: "reserved",
        channel: parsed.channel,
        recipientMasked: control.contactMasked,
      },
      metadata: {
        correlationId: input.correlationId,
        rfqDraftId: draft.id,
        decisionId: decision.id,
        contentHash: draft.contentHash,
        recipientHash,
        idempotencyKey,
        contactAuthorizationBasis: control.authorizationBasis,
        contactAuthorizationExpiresAt: control.authorizationExpiresAt.toISOString(),
        maximumProviderAttempts: 1,
        automaticRetry: false,
        externalSideEffect: false,
      },
      createdAt: now,
    });

    return {
      shouldSend: true as const,
      dispatch: created,
      content: { subject: draft.subject, messageBody: draft.messageBody },
      recipient: normalizedContact,
    };
  });
}

async function markDispatchSending(input: {
  tenantId: number;
  dispatchId: string;
  recipient: string;
}) {
  const now = new Date();
  return db.transaction(async (tx) => {
    const [dispatch] = await tx
      .select()
      .from(industrialSupplierRfqDispatches)
      .where(
        and(
          eq(industrialSupplierRfqDispatches.id, input.dispatchId),
          eq(industrialSupplierRfqDispatches.tenantId, input.tenantId),
        ),
      )
      .limit(1);
    if (!dispatch || dispatch.status !== "reserved" || dispatch.attemptCount !== 0) {
      throw new SupplierRfqDispatchServiceError(
        "SUPPLIER_RFQ_DISPATCH_NOT_RESERVED",
        409,
        "The RFQ dispatch is not available for a first provider attempt.",
      );
    }
    const [control] = await tx
      .select()
      .from(industrialSupplierContactControls)
      .where(eq(industrialSupplierContactControls.id, dispatch.contactControlId))
      .limit(1);
    if (
      !control ||
      control.state !== "authorized" ||
      control.contactHash !== dispatch.recipientHash ||
      !control.authorizationExpiresAt ||
      control.authorizationExpiresAt.getTime() <= now.getTime() ||
      dispatch.contactAuthorizationExpiresAt.getTime() <= now.getTime()
    ) {
      throw new SupplierRfqDispatchServiceError(
        "SUPPLIER_RFQ_DISPATCH_SUPPRESSED_BEFORE_SEND",
        409,
        "The recipient authorization was withdrawn or expired before provider execution.",
      );
    }
    const [globalSuppression] = await tx
      .select({ id: industrialSupplierContactSuppressions.id })
      .from(industrialSupplierContactSuppressions)
      .where(
        and(
          eq(industrialSupplierContactSuppressions.tenantId, input.tenantId),
          eq(industrialSupplierContactSuppressions.channel, dispatch.channel),
          eq(
            industrialSupplierContactSuppressions.contactHash,
            dispatch.recipientHash,
          ),
        ),
      )
      .limit(1);
    if (globalSuppression) {
      throw new SupplierRfqDispatchServiceError(
        "SUPPLIER_RFQ_DISPATCH_RECIPIENT_SUPPRESSED_BEFORE_SEND",
        409,
        "The recipient opted out before provider execution.",
      );
    }
    if (dispatch.channel === "email") {
      const [unsubscribe] = await tx
        .select({ id: emailUnsubscribes.id })
        .from(emailUnsubscribes)
        .where(
          and(
            eq(emailUnsubscribes.tenantId, input.tenantId),
            eq(emailUnsubscribes.email, input.recipient),
          ),
        )
        .limit(1);
      if (unsubscribe) {
        throw new SupplierRfqDispatchServiceError(
          "SUPPLIER_RFQ_DISPATCH_RECIPIENT_SUPPRESSED_BEFORE_SEND",
          409,
          "The recipient entered the tenant unsubscribe registry before provider execution.",
        );
      }
    }
    const [sending] = await tx
      .update(industrialSupplierRfqDispatches)
      .set({ status: "sending", attemptCount: 1, attemptedAt: now, updatedAt: now })
      .where(
        and(
          eq(industrialSupplierRfqDispatches.id, dispatch.id),
          eq(industrialSupplierRfqDispatches.status, "reserved"),
          eq(industrialSupplierRfqDispatches.attemptCount, 0),
        ),
      )
      .returning();
    if (!sending) {
      throw new SupplierRfqDispatchServiceError(
        "SUPPLIER_RFQ_DISPATCH_ATTEMPT_CONFLICT",
        409,
        "The single provider attempt was claimed concurrently.",
      );
    }
    return sending;
  });
}

async function completeDispatch(input: {
  tenantId: number;
  actorUserId: number;
  dispatchId: string;
  status: "accepted" | "failed" | "unknown";
  providerMessageId?: string | null;
  providerStatus?: string | null;
  providerResponse?: Record<string, unknown>;
  errorCode?: string | null;
  errorMessage?: string | null;
  correlationId: string;
}) {
  const now = new Date();
  const [completed] = await db
    .update(industrialSupplierRfqDispatches)
    .set({
      status: input.status,
      completedAt: now,
      providerMessageId: input.providerMessageId ?? null,
      providerStatus: input.providerStatus ?? null,
      providerResponse: input.providerResponse ?? {},
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ?? null,
      updatedAt: now,
    })
    .where(
      and(
        eq(industrialSupplierRfqDispatches.id, input.dispatchId),
        eq(industrialSupplierRfqDispatches.tenantId, input.tenantId),
        eq(industrialSupplierRfqDispatches.status, "sending"),
        eq(industrialSupplierRfqDispatches.attemptCount, 1),
      ),
    )
    .returning();
  if (!completed) {
    throw new SupplierRfqDispatchServiceError(
      "SUPPLIER_RFQ_DISPATCH_COMPLETION_CONFLICT",
      409,
      "The provider result could not be bound to the reserved dispatch. No retry was attempted.",
    );
  }
  await db.insert(industrialAuditLogs).values({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    action: `industrial_supplier_rfq.dispatch_${input.status}`,
    entityType: "industrial_supplier_rfq_dispatch",
    entityId: completed.id,
    reason: input.errorMessage || `Provider status: ${input.providerStatus || input.status}`,
    previousValue: { status: "sending", attemptCount: 1 },
    nextValue: {
      status: input.status,
      attemptCount: 1,
      providerMessageId: input.providerMessageId ?? null,
      providerStatus: input.providerStatus ?? null,
    },
    metadata: {
      correlationId: input.correlationId,
      channel: completed.channel,
      contentHash: completed.contentHash,
      recipientHash: completed.recipientHash,
      recipientMasked: completed.recipientMasked,
      maximumProviderAttempts: 1,
      automaticRetry: false,
      externalSideEffect: true,
      acceptedIsNotDelivered: input.status === "accepted",
    },
    createdAt: now,
  });
  return completed;
}

export async function dispatchSupplierRfq(input: {
  tenantId: number;
  tenantKey: string;
  actorUserId: number | null;
  draftId: string;
  payload: unknown;
  correlationId: string;
}) {
  assertExportunityTenant(input.tenantKey);
  await ensureIndustrialTables();
  const userId = actorId(input.actorUserId);
  const requestedDispatch = parseSupplierRfqDispatchInput(input.payload);
  if (requestedDispatch.channel === "email") await ensureMailEngineTables();

  const reservation = await reserveSupplierRfqDispatch({
    tenantId: input.tenantId,
    actorUserId: userId,
    draftId: input.draftId,
    payload: input.payload,
    correlationId: input.correlationId,
  });
  if (!reservation.shouldSend) {
    return {
      dispatch: dispatchResponse(reservation.dispatch),
      created: false,
      providerAttempted: reservation.dispatch.attemptCount === 1,
      governance: { automaticRetry: false as const, duplicateSendPrevented: true as const },
      evidence: {
        entity_ids: [reservation.dispatch.id],
        affected_rows: 0,
      },
    };
  }

  const sending = await markDispatchSending({
    tenantId: input.tenantId,
    dispatchId: reservation.dispatch.id,
    recipient: reservation.recipient,
  });

  if (sending.channel === "email") {
    let result: Awaited<ReturnType<typeof sendEmailAsAgent>>;
    try {
      result = await sendEmailAsAgent({
        tenantId: input.tenantId,
        agentKey: EXPORTUNITY_RFQ_SENDER_AGENT_KEY,
        actorType: "human",
        to: [reservation.recipient],
        subject: reservation.content.subject,
        textBody: reservation.content.messageBody,
        htmlBody: null,
        requestedByUserId: userId,
        correlationId: input.correlationId,
        bypassApproval: true,
      });
    } catch (error) {
      const errorMessage = redactSupplierRfqProviderError(
        error,
        reservation.recipient,
      );
      await completeDispatch({
        tenantId: input.tenantId,
        actorUserId: userId,
        dispatchId: sending.id,
        status: "failed",
        providerStatus: "email_provider_failed",
        errorCode: "EMAIL_PROVIDER_FAILED",
        errorMessage,
        correlationId: input.correlationId,
      });
      throw new SupplierRfqDispatchServiceError(
        "SUPPLIER_RFQ_EMAIL_DISPATCH_FAILED",
        502,
        `The single email attempt failed and will not retry automatically: ${errorMessage}`,
      );
    }

    const providerMessageId = String(
      result.message.messageId ||
        result.message.queueId ||
        `email-record-${result.message.id}`,
    );
    const completed = await completeDispatch({
      tenantId: input.tenantId,
      actorUserId: userId,
      dispatchId: sending.id,
      status: "accepted",
      providerMessageId,
      providerStatus: String(result.message.status || "accepted_by_mta"),
      providerResponse: {
        mailboxId: result.mailboxId,
        emailMessageId: result.message.id,
        queueId: result.message.queueId ?? null,
        acceptedIsNotDelivered: true,
      },
      correlationId: input.correlationId,
    });
    return {
      dispatch: dispatchResponse(completed),
      created: true,
      providerAttempted: true,
      governance: { automaticRetry: false as const, acceptedIsNotDelivered: true as const },
      evidence: {
        entity_ids: [completed.id],
        external_ref: completed.providerMessageId,
      },
    };
  }

  let result: Awaited<ReturnType<typeof sendWaText>>;
  try {
    result = await sendWaText(
      reservation.recipient,
      reservation.content.messageBody,
      { maxProviderAttempts: 1, tenantKey: input.tenantKey },
    );
  } catch (error) {
    const errorMessage = redactSupplierRfqProviderError(
      error,
      reservation.recipient,
    );
    await completeDispatch({
      tenantId: input.tenantId,
      actorUserId: userId,
      dispatchId: sending.id,
      status: "failed",
      providerStatus: "whatsapp_provider_failed",
      errorCode: "WHATSAPP_PROVIDER_FAILED",
      errorMessage,
      correlationId: input.correlationId,
    });
    throw new SupplierRfqDispatchServiceError(
      "SUPPLIER_RFQ_WHATSAPP_DISPATCH_FAILED",
      502,
      `The single WhatsApp attempt failed and will not retry automatically: ${errorMessage}`,
    );
  }
  if (!result.ok) {
    const errorMessage = redactSupplierRfqProviderError(
      result.error,
      reservation.recipient,
    );
    await completeDispatch({
      tenantId: input.tenantId,
      actorUserId: userId,
      dispatchId: sending.id,
      status: "failed",
      providerStatus: "whatsapp_provider_failed",
      providerResponse: { dryRun: result.dryRun ?? false },
      errorCode: result.errorCode || "WHATSAPP_PROVIDER_FAILED",
      errorMessage,
      correlationId: input.correlationId,
    });
    throw new SupplierRfqDispatchServiceError(
      "SUPPLIER_RFQ_WHATSAPP_DISPATCH_FAILED",
      502,
      `The single WhatsApp attempt failed and will not retry automatically: ${errorMessage}`,
    );
  }

  const completed = await completeDispatch({
    tenantId: input.tenantId,
    actorUserId: userId,
    dispatchId: sending.id,
    status: "accepted",
    providerMessageId: result.waMessageId,
    providerStatus: result.dryRun ? "dry_run" : "accepted_by_provider",
    providerResponse: {
      dryRun: result.dryRun ?? false,
      acceptedIsNotDelivered: true,
    },
    correlationId: input.correlationId,
  });
  return {
    dispatch: dispatchResponse(completed),
    created: true,
    providerAttempted: true,
    governance: { automaticRetry: false as const, acceptedIsNotDelivered: true as const },
    evidence: {
      entity_ids: [completed.id],
      external_ref: completed.providerMessageId,
    },
  };
}
