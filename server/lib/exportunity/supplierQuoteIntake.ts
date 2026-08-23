import { and, desc, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@db";
import {
  communicationsMessages,
  emailAttachmentsMeta,
  emailMessages,
  emailUnsubscribes,
  industrialAuditLogs,
  industrialSupplierContactControls,
  industrialSupplierContactSuppressions,
  industrialSupplierProfiles,
  industrialSupplierQuoteIntakes,
  industrialSupplierQuotes,
  industrialSupplierRfqDispatches,
  industrialSupplierRfqDrafts,
  tenants,
} from "@db/schema";
import { ensureCommunicationsTables } from "../communications/ensureTables";
import { ensureIndustrialTables } from "../industrial/ensureTables";
import { ensureMailEngineTables } from "../mail/ensureTables";
import {
  hashSupplierRfqDispatchContact,
  maskSupplierRfqDispatchContact,
  normalizeSupplierRfqDispatchContact,
  type SupplierRfqDispatchChannel,
} from "./supplierRfqDispatchPolicy";
import {
  correlateSupplierQuoteReply,
  detectSupplierQuoteOptOut,
  normalizeSupplierQuoteMessage,
  parseSupplierQuoteReviewInput,
  SupplierQuoteIntakePolicyError,
  type SupplierQuoteDispatchCandidate,
} from "./supplierQuoteIntakePolicy";
import {
  buildCanonicalSupplierQuoteComparisons,
  projectCanonicalSupplierQuote,
  type CanonicalSupplierQuoteComparisonItem,
} from "./supplierQuotePolicy";

export class SupplierQuoteIntakeServiceError extends Error {
  code: string;
  statusCode: number;

  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.name = "SupplierQuoteIntakeServiceError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

type CandidateRecord = SupplierQuoteDispatchCandidate & {
  rfqDraftId: string;
  requirementId: string;
  supplierProfileId: string;
};

type CanonicalSupplierQuoteRow =
  typeof industrialSupplierQuotes.$inferSelect & {
    quoteIntakeId: string;
    rfqDispatchId: string;
    rfqDraftId: string;
    supplierProfileId: string;
    sourceReceivedAt: Date;
    projectionVersion: string;
    normalizationVersion: string;
    quoteHash: string;
    qualifiedAt: Date;
  };

function requireCanonicalSupplierQuote(
  quote: typeof industrialSupplierQuotes.$inferSelect,
): CanonicalSupplierQuoteRow {
  if (
    !quote.quoteIntakeId ||
    !quote.rfqDispatchId ||
    !quote.rfqDraftId ||
    !quote.supplierProfileId ||
    !quote.sourceReceivedAt ||
    !quote.projectionVersion ||
    !quote.normalizationVersion ||
    !quote.quoteHash ||
    !quote.qualifiedAt ||
    (quote.sourceChannel !== "email" && quote.sourceChannel !== "whatsapp")
  ) {
    throw new SupplierQuoteIntakeServiceError(
      "SUPPLIER_QUOTE_CANONICAL_LINEAGE_INCOMPLETE",
      500,
      "A canonical supplier quote is missing required source lineage.",
    );
  }
  return quote as CanonicalSupplierQuoteRow;
}

type IntakeSource = {
  channel: SupplierRfqDispatchChannel;
  sourceEmailMessageId: number | null;
  sourceCommunicationsMessageId: number | null;
  sourceProviderMessageId: string;
  sourceAgentKey: string;
  rawContact: string;
  subject: string | null;
  body: string | null;
  providerReplyIds: string[];
  receivedAt: Date;
  sourceAttachments: Array<Record<string, unknown>>;
  attachmentNames: string[];
};

function assertExportunityTenant(tenantKey: string) {
  if (String(tenantKey || "").trim().toLowerCase() !== "exportunity") {
    throw new SupplierQuoteIntakeServiceError(
      "SUPPLIER_QUOTE_TENANT_INVALID",
      404,
      "Supplier quote intake is available only inside Exportunity.",
    );
  }
}

function actorId(value: number | null | undefined) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new SupplierQuoteIntakeServiceError(
      "SUPPLIER_QUOTE_ACTOR_REQUIRED",
      403,
      "An authenticated Exportunity administrator is required.",
    );
  }
  return parsed;
}

function normalizeSourceAgentKey(value: unknown) {
  const normalized = String(value || "sourcing")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return normalized.length >= 2 ? normalized : "sourcing";
}

const canonicalBackfillPromises = new Map<number, Promise<void>>();

async function ensureQuoteIntakeDependencies(tenantId?: number) {
  await ensureMailEngineTables();
  await ensureCommunicationsTables();
  await ensureIndustrialTables();
  if (tenantId) await backfillCanonicalSupplierQuotes(tenantId);
}

async function resolveExportunityTenantKey(tenantId: number) {
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
    columns: { key: true },
  });
  return String(tenant?.key || "").trim().toLowerCase();
}

async function loadDispatchCandidates(tenantId: number) {
  const rows = await db
    .select({
      id: industrialSupplierRfqDispatches.id,
      status: industrialSupplierRfqDispatches.status,
      providerMessageId: industrialSupplierRfqDispatches.providerMessageId,
      recipientHash: industrialSupplierRfqDispatches.recipientHash,
      attemptedAt: industrialSupplierRfqDispatches.attemptedAt,
      rfqDraftId: industrialSupplierRfqDrafts.id,
      referenceCode: industrialSupplierRfqDrafts.referenceCode,
      responseDeadline: industrialSupplierRfqDrafts.responseDeadline,
      requirementId: industrialSupplierRfqDrafts.requirementId,
      supplierProfileId: industrialSupplierRfqDrafts.supplierProfileId,
    })
    .from(industrialSupplierRfqDispatches)
    .innerJoin(
      industrialSupplierRfqDrafts,
      eq(
        industrialSupplierRfqDrafts.id,
        industrialSupplierRfqDispatches.rfqDraftId,
      ),
    )
    .where(eq(industrialSupplierRfqDispatches.tenantId, tenantId))
    .orderBy(desc(industrialSupplierRfqDispatches.attemptedAt))
    .limit(500);
  return rows as CandidateRecord[];
}

function sourceProviderId(value: unknown, fallback: string) {
  const normalized = String(value || "").trim().slice(0, 300);
  return normalized.length >= 2 ? normalized : fallback.slice(0, 300);
}

function boundedReplyIds(values: unknown[], maximum = 50) {
  return values
    .map((value) => String(value || "").trim().slice(0, 300))
    .filter(Boolean)
    .slice(0, maximum);
}

function intakeResponse(
  intake: typeof industrialSupplierQuoteIntakes.$inferSelect,
  enrichment: {
    rfqReferenceCode?: string | null;
    supplierLegalName?: string | null;
  } = {},
) {
  return {
    id: intake.id,
    rfqDispatchId: intake.rfqDispatchId,
    rfqDraftId: intake.rfqDraftId,
    requirementId: intake.requirementId,
    supplierProfileId: intake.supplierProfileId,
    rfqReferenceCode: enrichment.rfqReferenceCode ?? null,
    supplierLegalName: enrichment.supplierLegalName ?? null,
    channel: intake.channel,
    source: {
      emailMessageId: intake.sourceEmailMessageId,
      communicationsMessageId: intake.sourceCommunicationsMessageId,
      providerMessageId: intake.sourceProviderMessageId,
      agentKey: intake.sourceAgentKey,
      contactHash: intake.sourceContactHash,
      contactMasked: intake.sourceContactMasked,
      receivedAt: intake.sourceReceivedAt.toISOString(),
      attachments: intake.sourceAttachments,
      rawMessageStoredInNativeInbox: true as const,
    },
    correlation: {
      status: intake.correlationStatus,
      method: intake.correlationMethod,
      candidateDispatchIds: intake.candidateDispatchIds,
    },
    normalization: {
      version: intake.normalizationVersion,
      fields: intake.normalizedQuote,
      missingFields: intake.missingFields,
      ambiguousFields: intake.ambiguousFields,
      quoteLikeSignals: intake.quoteLikeSignals,
      inventedFields: false as const,
    },
    optOut: {
      detected: intake.optOutDetected,
      suppressionRegistryId: intake.contactSuppressionId,
      suppressionAppliedAt: intake.suppressionAppliedAt?.toISOString() ?? null,
      suppressedControlIds: intake.suppressedControlIds,
    },
    review: {
      status: intake.reviewStatus,
      checklist: intake.reviewChecklist,
      notes: intake.reviewNotes,
      reviewedAt: intake.reviewedAt?.toISOString() ?? null,
    },
    createdAt: intake.createdAt.toISOString(),
    updatedAt: intake.updatedAt.toISOString(),
  };
}

function canonicalSupplierQuoteReference(quoteIntakeId: string) {
  return `SUPQ-${quoteIntakeId.replace(/-/g, "").toUpperCase()}`;
}

type CanonicalQuoteSource = {
  id: string;
  tenantId: number;
  rfqDispatchId: string | null;
  rfqDraftId: string | null;
  requirementId: string | null;
  supplierProfileId: string | null;
  channel: "email" | "whatsapp";
  sourceReceivedAt: Date;
  normalizationVersion: string;
  normalizedQuote: Record<string, unknown>;
};

function canonicalSupplierQuoteInsert(input: {
  source: CanonicalQuoteSource;
  qualifiedByUserId: number | null;
  qualifiedAt: Date;
}) {
  const source = input.source;
  if (
    !source.rfqDispatchId ||
    !source.rfqDraftId ||
    !source.requirementId ||
    !source.supplierProfileId
  ) {
    return null;
  }
  const projection = projectCanonicalSupplierQuote({
    normalizedQuote: source.normalizedQuote,
    normalizationVersion: source.normalizationVersion,
  });
  const values = projection.values;
  return {
    projection,
    values: {
      tenantId: source.tenantId,
      quoteIntakeId: source.id,
      rfqDispatchId: source.rfqDispatchId,
      rfqDraftId: source.rfqDraftId,
      requirementId: source.requirementId,
      supplierProfileId: source.supplierProfileId,
      referenceCode: canonicalSupplierQuoteReference(source.id),
      status: "qualified" as const,
      sourceChannel: source.channel,
      sourceReceivedAt: source.sourceReceivedAt,
      supplierQuoteReference: values.supplierQuoteReference,
      productName: values.productName,
      specification: values.specification,
      offeredQuantity: values.offeredQuantity,
      unitOfMeasure: values.unitOfMeasure,
      currencyCode: values.currencyCode,
      unitPrice: values.unitPrice,
      totalAmount: values.totalAmount,
      minimumOrderQuantity: values.minimumOrderQuantity,
      packaging: values.packaging,
      leadTime: values.leadTime,
      incoterm: values.incoterm,
      paymentTerms: values.paymentTerms,
      validity: values.validity,
      countryOfOrigin: values.countryOfOrigin,
      certifications: values.certifications,
      warranty: values.warranty,
      supplierNotes: values.supplierNotes,
      projectionVersion: projection.projectionVersion,
      normalizationVersion: projection.normalizationVersion,
      quoteHash: projection.quoteHash,
      fieldEvidence: projection.fields,
      providedFields: projection.providedFields,
      missingFields: projection.missingFields,
      ambiguousFields: projection.ambiguousFields,
      comparisonReady: projection.readiness.comparison.ready,
      comparisonBlockers: projection.readiness.comparison.blockers,
      offerPreparationReady: projection.readiness.offerPreparation.ready,
      offerPreparationBlockers:
        projection.readiness.offerPreparation.blockers,
      qualifiedByUserId: input.qualifiedByUserId,
      qualifiedAt: input.qualifiedAt,
      createdAt: input.qualifiedAt,
      updatedAt: input.qualifiedAt,
    },
  };
}

async function backfillCanonicalSupplierQuotes(tenantId: number) {
  const existing = canonicalBackfillPromises.get(tenantId);
  if (existing) return existing;
  const promise = (async () => {
    const sources = await db
      .select({
        id: industrialSupplierQuoteIntakes.id,
        tenantId: industrialSupplierQuoteIntakes.tenantId,
        rfqDispatchId: industrialSupplierQuoteIntakes.rfqDispatchId,
        rfqDraftId: industrialSupplierQuoteIntakes.rfqDraftId,
        requirementId: industrialSupplierQuoteIntakes.requirementId,
        supplierProfileId: industrialSupplierQuoteIntakes.supplierProfileId,
        channel: industrialSupplierQuoteIntakes.channel,
        sourceReceivedAt: industrialSupplierQuoteIntakes.sourceReceivedAt,
        normalizationVersion:
          industrialSupplierQuoteIntakes.normalizationVersion,
        normalizedQuote: industrialSupplierQuoteIntakes.normalizedQuote,
        reviewedByUserId: industrialSupplierQuoteIntakes.reviewedByUserId,
        reviewedAt: industrialSupplierQuoteIntakes.reviewedAt,
        updatedAt: industrialSupplierQuoteIntakes.updatedAt,
      })
      .from(industrialSupplierQuoteIntakes)
      .leftJoin(
        industrialSupplierQuotes,
        and(
          eq(
            industrialSupplierQuotes.quoteIntakeId,
            industrialSupplierQuoteIntakes.id,
          ),
          eq(industrialSupplierQuotes.tenantId, tenantId),
        ),
      )
      .where(
        and(
          eq(industrialSupplierQuoteIntakes.tenantId, tenantId),
          eq(industrialSupplierQuoteIntakes.reviewStatus, "qualified"),
          isNull(industrialSupplierQuotes.id),
        ),
      )
      .limit(5_000);

    for (const source of sources) {
      const projected = canonicalSupplierQuoteInsert({
        source,
        qualifiedByUserId: source.reviewedByUserId,
        qualifiedAt: source.reviewedAt || source.updatedAt,
      });
      if (!projected) continue;
      const [created] = await db
        .insert(industrialSupplierQuotes)
        .values(projected.values)
        .onConflictDoNothing({
          target: industrialSupplierQuotes.quoteIntakeId,
        })
        .returning();
      if (!created) continue;
      await db.insert(industrialAuditLogs).values({
        tenantId,
        actorUserId: source.reviewedByUserId,
        action: "industrial_supplier_quote.backfilled",
        entityType: "industrial_supplier_quote",
        entityId: created.id,
        reason:
          "Additive canonicalization of a previously human-qualified supplier quote intake.",
        previousValue: {
          quoteIntakeId: source.id,
          reviewStatus: "qualified",
        },
        nextValue: {
          canonicalSupplierQuoteId: created.id,
          quoteHash: created.quoteHash,
          comparisonReady: created.comparisonReady,
          offerPreparationReady: created.offerPreparationReady,
        },
        metadata: {
          dataMigration: true,
          externalSideEffect: false,
          customerOfferCreated: false,
          orderCreated: false,
          paymentCreated: false,
        },
        createdAt: new Date(),
      });
    }
  })().catch((error) => {
    canonicalBackfillPromises.delete(tenantId);
    throw error;
  });
  canonicalBackfillPromises.set(tenantId, promise);
  return promise;
}

function supplierQuoteValues(
  quote: typeof industrialSupplierQuotes.$inferSelect,
) {
  return {
    supplierQuoteReference: quote.supplierQuoteReference,
    productName: quote.productName,
    specification: quote.specification,
    offeredQuantity: quote.offeredQuantity,
    unitOfMeasure: quote.unitOfMeasure,
    currencyCode: quote.currencyCode,
    unitPrice: quote.unitPrice,
    totalAmount: quote.totalAmount,
    minimumOrderQuantity: quote.minimumOrderQuantity,
    packaging: quote.packaging,
    leadTime: quote.leadTime,
    incoterm: quote.incoterm,
    paymentTerms: quote.paymentTerms,
    validity: quote.validity,
    countryOfOrigin: quote.countryOfOrigin,
    certifications: quote.certifications,
    warranty: quote.warranty,
    supplierNotes: quote.supplierNotes,
  };
}

function canonicalSupplierQuoteResponse(
  quote: CanonicalSupplierQuoteRow,
  enrichment: {
    rfqReferenceCode?: string | null;
    supplierLegalName?: string | null;
  } = {},
) {
  return {
    id: quote.id,
    referenceCode: quote.referenceCode,
    status: quote.status,
    quoteIntakeId: quote.quoteIntakeId,
    rfqDispatchId: quote.rfqDispatchId,
    rfqDraftId: quote.rfqDraftId,
    requirementId: quote.requirementId,
    supplierProfileId: quote.supplierProfileId,
    rfqReferenceCode: enrichment.rfqReferenceCode ?? null,
    supplierLegalName: enrichment.supplierLegalName ?? null,
    source: {
      channel: quote.sourceChannel,
      receivedAt: quote.sourceReceivedAt.toISOString(),
      quoteIntakeId: quote.quoteIntakeId,
      rawMessageStoredInNativeInbox: true as const,
    },
    values: supplierQuoteValues(quote),
    evidence: {
      projectionVersion: quote.projectionVersion,
      normalizationVersion: quote.normalizationVersion,
      quoteHash: quote.quoteHash,
      fields: quote.fieldEvidence,
      providedFields: quote.providedFields,
      missingFields: quote.missingFields,
      ambiguousFields: quote.ambiguousFields,
      inventedFields: false as const,
    },
    readiness: {
      comparison: {
        ready: quote.comparisonReady,
        blockers: quote.comparisonBlockers,
      },
      offerPreparation: {
        ready: quote.offerPreparationReady,
        blockers: quote.offerPreparationBlockers,
      },
    },
    qualified: {
      byUserId: quote.qualifiedByUserId,
      at: quote.qualifiedAt.toISOString(),
    },
    createdAt: quote.createdAt.toISOString(),
    updatedAt: quote.updatedAt.toISOString(),
  };
}

function comparisonItem(
  quote: CanonicalSupplierQuoteRow,
  enrichment: {
    rfqReferenceCode?: string | null;
    supplierLegalName?: string | null;
  },
): CanonicalSupplierQuoteComparisonItem {
  return {
    id: quote.id,
    quoteIntakeId: quote.quoteIntakeId,
    requirementId: quote.requirementId,
    supplierProfileId: quote.supplierProfileId,
    supplierLegalName: enrichment.supplierLegalName ?? null,
    rfqReferenceCode: enrichment.rfqReferenceCode ?? null,
    referenceCode: quote.referenceCode,
    supplierQuoteReference: quote.supplierQuoteReference,
    status: quote.status,
    values: supplierQuoteValues(quote),
    missingFields: quote.missingFields,
    ambiguousFields: quote.ambiguousFields,
    comparisonReady: quote.comparisonReady,
    comparisonBlockers: quote.comparisonBlockers,
    offerPreparationReady: quote.offerPreparationReady,
    offerPreparationBlockers: quote.offerPreparationBlockers,
  };
}

async function recordSupplierQuoteSource(input: {
  tenantId: number;
  source: IntakeSource;
}) {
  const { tenantId, source } = input;
  const tenantKey = await resolveExportunityTenantKey(tenantId);
  if (tenantKey !== "exportunity") {
    return {
      handled: false as const,
      suppressAutoReply: false as const,
      reason: "tenant_not_exportunity" as const,
    };
  }
  await ensureQuoteIntakeDependencies(tenantId);

  let normalizedContact: string;
  try {
    normalizedContact = normalizeSupplierRfqDispatchContact(
      source.channel,
      source.rawContact,
    );
  } catch {
    return {
      handled: false as const,
      suppressAutoReply: false as const,
      reason: "invalid_source_contact" as const,
    };
  }
  const contactHash = hashSupplierRfqDispatchContact(
    source.channel,
    normalizedContact,
  );
  const contactMasked = maskSupplierRfqDispatchContact(
    source.channel,
    normalizedContact,
  );
  const candidates = await loadDispatchCandidates(tenantId);
  const correlation = correlateSupplierQuoteReply({
    providerReplyIds: source.providerReplyIds,
    referenceText: `${source.subject || ""}\n${source.body || ""}`,
    contactHash,
    receivedAt: source.receivedAt,
    candidates,
  });
  const normalization = normalizeSupplierQuoteMessage({
    subject: source.subject,
    body: source.body,
    attachmentNames: source.attachmentNames,
  });
  const optOutDetected = detectSupplierQuoteOptOut(
    `${source.subject || ""}\n${source.body || ""}`,
  );
  const correlated = correlation.status !== "unmatched";
  const sourcingSource =
    String(source.sourceAgentKey || "").trim().toLowerCase() === "sourcing";
  const relevant =
    correlated ||
    optOutDetected ||
    (sourcingSource &&
      (normalization.quoteLike || source.sourceAttachments.length > 0));
  if (!relevant) {
    return {
      handled: false as const,
      suppressAutoReply: false as const,
      reason: "not_supplier_quote_or_rfq_reply" as const,
    };
  }

  const correlatedCandidate = correlation.dispatchId
    ? candidates.find((candidate) => candidate.id === correlation.dispatchId) || null
    : null;
  const quoteLikeSignals = [
    ...normalization.quoteLikeSignals,
    ...(correlated ? ["correlated_rfq_reply"] : []),
    ...(optOutDetected ? ["recipient_opt_out"] : []),
  ];

  return db.transaction(async (tx) => {
    const existingWhere = source.sourceEmailMessageId
      ? and(
          eq(industrialSupplierQuoteIntakes.tenantId, tenantId),
          eq(
            industrialSupplierQuoteIntakes.sourceEmailMessageId,
            source.sourceEmailMessageId,
          ),
        )
      : and(
          eq(industrialSupplierQuoteIntakes.tenantId, tenantId),
          eq(
            industrialSupplierQuoteIntakes.sourceCommunicationsMessageId,
            source.sourceCommunicationsMessageId as number,
          ),
        );
    const [existing] = await tx
      .select()
      .from(industrialSupplierQuoteIntakes)
      .where(existingWhere)
      .limit(1);
    if (existing) {
      return {
        handled: true as const,
        suppressAutoReply: true as const,
        created: false as const,
        quoteIntake: intakeResponse(existing),
      };
    }

    const now = new Date();
    const [previousContactSuppression] = optOutDetected
      ? await tx
          .select()
          .from(industrialSupplierContactSuppressions)
          .where(
            and(
              eq(industrialSupplierContactSuppressions.tenantId, tenantId),
              eq(industrialSupplierContactSuppressions.channel, source.channel),
              eq(industrialSupplierContactSuppressions.contactHash, contactHash),
            ),
          )
          .limit(1)
      : [];
    const [contactSuppression] = optOutDetected
      ? await tx
          .insert(industrialSupplierContactSuppressions)
          .values({
            tenantId,
            channel: source.channel,
            contactHash,
            contactMasked,
            reason:
              "The exact recipient explicitly opted out through a recorded inbound reply.",
            sourceKind: "recipient_opt_out",
            sourceEmailMessageId: source.sourceEmailMessageId,
            sourceCommunicationsMessageId:
              source.sourceCommunicationsMessageId,
            createdByUserId: null,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [
              industrialSupplierContactSuppressions.tenantId,
              industrialSupplierContactSuppressions.channel,
              industrialSupplierContactSuppressions.contactHash,
            ],
            set: {
              contactMasked,
              reason:
                "The exact recipient explicitly opted out through a recorded inbound reply.",
              sourceKind: "recipient_opt_out",
              sourceEmailMessageId: source.sourceEmailMessageId,
              sourceCommunicationsMessageId:
                source.sourceCommunicationsMessageId,
              updatedAt: now,
            },
          })
          .returning()
      : [];
    if (contactSuppression) {
      await tx.insert(industrialAuditLogs).values({
        tenantId,
        actorUserId: null,
        action: previousContactSuppression
          ? "industrial_supplier_contact.global_suppression_refreshed"
          : "industrial_supplier_contact.global_suppression_recorded",
        entityType: "industrial_supplier_contact_suppression",
        entityId: contactSuppression.id,
        reason: contactSuppression.reason,
        previousValue: previousContactSuppression
          ? {
              id: previousContactSuppression.id,
              channel: previousContactSuppression.channel,
              contactHash: previousContactSuppression.contactHash,
              sourceEmailMessageId:
                previousContactSuppression.sourceEmailMessageId,
              sourceCommunicationsMessageId:
                previousContactSuppression.sourceCommunicationsMessageId,
              updatedAt: previousContactSuppression.updatedAt.toISOString(),
            }
          : {},
        nextValue: {
          channel: contactSuppression.channel,
          contactHash: contactSuppression.contactHash,
          state: "suppressed",
        },
        metadata: {
          sourceEmailMessageId: source.sourceEmailMessageId,
          sourceCommunicationsMessageId:
            source.sourceCommunicationsMessageId,
          sourceProviderMessageId: source.sourceProviderMessageId,
          tenantWide: true,
          rawContactStored: false,
          externalSideEffect: false,
        },
        createdAt: now,
      });
    }
    const controls = optOutDetected
      ? await tx
          .select()
          .from(industrialSupplierContactControls)
          .where(
            and(
              eq(industrialSupplierContactControls.tenantId, tenantId),
              eq(industrialSupplierContactControls.channel, source.channel),
              eq(industrialSupplierContactControls.contactHash, contactHash),
            ),
          )
      : [];
    const controlIds = controls.map((control) => control.id);
    const changedControls = controls.filter(
      (control) => control.state !== "suppressed",
    );
    if (changedControls.length) {
      const changedControlIds = changedControls.map((control) => control.id);
      await tx
        .update(industrialSupplierContactControls)
        .set({
          state: "suppressed",
          authorizationBasis: null,
          evidenceReference: null,
          notes:
            "Recipient opt-out received through Exportunity native inbound message processing.",
          authorizedByUserId: null,
          authorizedAt: null,
          authorizationExpiresAt: null,
          suppressedByUserId: null,
          suppressedAt: now,
          suppressionReason:
            "The exact recipient explicitly opted out through a recorded inbound reply.",
          updatedAt: now,
        })
        .where(
          inArray(
            industrialSupplierContactControls.id,
            changedControlIds,
          ),
        );

      await tx.insert(industrialAuditLogs).values(
        changedControls.map((control) => ({
          tenantId,
          actorUserId: null,
          action: "industrial_supplier_contact.suppressed_by_recipient",
          entityType: "industrial_supplier_contact_control",
          entityId: control.id,
          reason:
            "The recipient explicitly opted out through a recorded Exportunity inbound reply.",
          previousValue: {
            state: control.state,
            contactHash: control.contactHash,
            authorizationExpiresAt:
              control.authorizationExpiresAt?.toISOString() ?? null,
          },
          nextValue: {
            state: "suppressed",
            contactHash: control.contactHash,
            suppressedAt: now.toISOString(),
          },
          metadata: {
            sourceChannel: source.channel,
            sourceEmailMessageId: source.sourceEmailMessageId,
            sourceCommunicationsMessageId:
              source.sourceCommunicationsMessageId,
            sourceProviderMessageId: source.sourceProviderMessageId,
            rawContactStored: false,
            externalSideEffect: false,
          },
          createdAt: now,
        })),
      );
    }

    if (optOutDetected && source.channel === "email") {
      await tx
        .insert(emailUnsubscribes)
        .values({
          tenantId,
          email: normalizedContact,
          scope: "supplier_rfq",
          metadata: {
            source: "supplier_quote_inbound_opt_out",
            sourceEmailMessageId: source.sourceEmailMessageId,
            sourceProviderMessageId: source.sourceProviderMessageId,
          },
          createdAt: now,
        })
        .onConflictDoNothing({
          target: [
            emailUnsubscribes.tenantId,
            emailUnsubscribes.email,
            emailUnsubscribes.scope,
          ],
        });
    }

    const suppressionApplied = Boolean(contactSuppression);
    const [created] = await tx
      .insert(industrialSupplierQuoteIntakes)
      .values({
        tenantId,
        rfqDispatchId: correlatedCandidate?.id ?? null,
        rfqDraftId: correlatedCandidate?.rfqDraftId ?? null,
        requirementId: correlatedCandidate?.requirementId ?? null,
        supplierProfileId: correlatedCandidate?.supplierProfileId ?? null,
        contactSuppressionId: contactSuppression?.id ?? null,
        channel: source.channel,
        sourceEmailMessageId: source.sourceEmailMessageId,
        sourceCommunicationsMessageId: source.sourceCommunicationsMessageId,
        sourceProviderMessageId: source.sourceProviderMessageId,
        sourceAgentKey: source.sourceAgentKey,
        sourceContactHash: contactHash,
        sourceContactMasked: contactMasked,
        sourceReceivedAt: source.receivedAt,
        sourceAttachments: source.sourceAttachments,
        correlationStatus: correlation.status,
        correlationMethod: correlation.method,
        candidateDispatchIds: correlation.candidateDispatchIds,
        normalizationVersion: normalization.normalizationVersion,
        normalizedQuote: normalization.fields,
        missingFields: normalization.missingFields,
        ambiguousFields: normalization.ambiguousFields,
        quoteLikeSignals,
        optOutDetected,
        suppressionAppliedAt: suppressionApplied ? now : null,
        suppressedControlIds: controlIds,
        reviewStatus: "needs_review",
        reviewChecklist: {},
        reviewNotes: null,
        reviewedByUserId: null,
        reviewedAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning();

    if (!created) {
      const [concurrent] = await tx
        .select()
        .from(industrialSupplierQuoteIntakes)
        .where(existingWhere)
        .limit(1);
      if (!concurrent) {
        throw new SupplierQuoteIntakeServiceError(
          "SUPPLIER_QUOTE_CAPTURE_CONFLICT",
          409,
          "The inbound quote source was captured concurrently.",
        );
      }
      return {
        handled: true as const,
        suppressAutoReply: true as const,
        created: false as const,
        quoteIntake: intakeResponse(concurrent),
      };
    }

    await tx.insert(industrialAuditLogs).values({
      tenantId,
      actorUserId: null,
      action: "industrial_supplier_quote.intake_recorded",
      entityType: "industrial_supplier_quote_intake",
      entityId: created.id,
      reason:
        "A native inbound message was preserved and deterministically normalized for human quote review.",
      previousValue: {},
      nextValue: {
        correlationStatus: created.correlationStatus,
        reviewStatus: created.reviewStatus,
        missingFields: created.missingFields,
        ambiguousFields: created.ambiguousFields,
        optOutDetected: created.optOutDetected,
      },
      metadata: {
        sourceChannel: source.channel,
        sourceEmailMessageId: source.sourceEmailMessageId,
        sourceCommunicationsMessageId: source.sourceCommunicationsMessageId,
        sourceProviderMessageId: source.sourceProviderMessageId,
        candidateDispatchIds: correlation.candidateDispatchIds,
        normalizationVersion: normalization.normalizationVersion,
        rawMessageStoredInNativeInbox: true,
        rawContactStoredInIntake: false,
        inventedFields: false,
        externalSideEffect: false,
      },
      createdAt: now,
    });

    return {
      handled: true as const,
      suppressAutoReply: true as const,
      created: true as const,
      quoteIntake: intakeResponse(created),
    };
  });
}

export async function captureSupplierQuoteFromEmail(input: {
  tenantId: number;
  emailMessageId: number;
}) {
  await ensureMailEngineTables();
  const message = await db.query.emailMessages.findFirst({
    where: and(
      eq(emailMessages.tenantId, input.tenantId),
      eq(emailMessages.id, input.emailMessageId),
      eq(emailMessages.direction, "inbound"),
    ),
  });
  if (!message) {
    return {
      handled: false as const,
      suppressAutoReply: false as const,
      reason: "email_message_not_found" as const,
    };
  }
  const attachments = await db.query.emailAttachmentsMeta.findMany({
    where: and(
      eq(emailAttachmentsMeta.tenantId, input.tenantId),
      eq(emailAttachmentsMeta.messageId, message.id),
    ),
  });
  return recordSupplierQuoteSource({
    tenantId: input.tenantId,
    source: {
      channel: "email",
      sourceEmailMessageId: message.id,
      sourceCommunicationsMessageId: null,
      sourceProviderMessageId: sourceProviderId(
        message.messageId,
        `email-message-${message.id}`,
      ),
      sourceAgentKey: normalizeSourceAgentKey(message.agentKey),
      rawContact: message.fromEmail,
      subject: message.subject,
      body: message.textBody,
      providerReplyIds: boundedReplyIds([
        message.inReplyTo,
        ...(Array.isArray(message.referencesJson) ? message.referencesJson : []),
      ]),
      receivedAt: message.createdAt,
      sourceAttachments: attachments.slice(0, 50).map((attachment) => ({
        emailAttachmentId: attachment.id,
        filename: String(attachment.filename || "attachment").slice(0, 300),
        mimeType: String(attachment.mimeType || "application/octet-stream").slice(
          0,
          200,
        ),
        sizeBytes: attachment.sizeBytes,
      })),
      attachmentNames: attachments
        .slice(0, 50)
        .map((attachment) => String(attachment.filename || "attachment").slice(0, 300)),
    },
  });
}

function communicationsReplyIds(metadataValue: unknown) {
  if (!metadataValue || typeof metadataValue !== "object" || Array.isArray(metadataValue)) {
    return [];
  }
  const metadata = metadataValue as Record<string, any>;
  return boundedReplyIds([
    metadata?.replyContext?.originalRepliedMessageSid,
    metadata?.originalRepliedMessageSid,
  ], 10);
}

function communicationsAttachments(
  metadataValue: unknown,
): Array<Record<string, unknown>> {
  if (!metadataValue || typeof metadataValue !== "object" || Array.isArray(metadataValue)) {
    return [] as Array<Record<string, unknown>>;
  }
  const metadata = metadataValue as Record<string, any>;
  const items = Array.isArray(metadata?.media?.items)
    ? metadata.media.items
    : [];
  return items.slice(0, 10).map((item: any, index: number) => ({
    index,
    contentType: String(item?.contentType || "").trim().slice(0, 200) || null,
    providerMediaPresent: Boolean(item?.url),
    providerMediaUrlStoredInNativeMessage: Boolean(item?.url),
  }));
}

export async function captureSupplierQuoteFromWhatsApp(input: {
  tenantId: number;
  communicationsMessageId: number;
}) {
  await ensureCommunicationsTables();
  const message = await db.query.communicationsMessages.findFirst({
    where: and(
      eq(communicationsMessages.tenantId, input.tenantId),
      eq(communicationsMessages.id, input.communicationsMessageId),
      eq(communicationsMessages.direction, "inbound"),
      eq(communicationsMessages.channel, "whatsapp"),
    ),
  });
  if (!message) {
    return {
      handled: false as const,
      suppressAutoReply: false as const,
      reason: "whatsapp_message_not_found" as const,
    };
  }
  const attachments = communicationsAttachments(message.metadata);
  return recordSupplierQuoteSource({
    tenantId: input.tenantId,
    source: {
      channel: "whatsapp",
      sourceEmailMessageId: null,
      sourceCommunicationsMessageId: message.id,
      sourceProviderMessageId: sourceProviderId(
        message.providerMessageId,
        `communications-message-${message.id}`,
      ),
      sourceAgentKey: normalizeSourceAgentKey(message.agentKey),
      rawContact: message.fromAddress,
      subject: null,
      body: message.body,
      providerReplyIds: communicationsReplyIds(message.metadata),
      receivedAt: message.createdAt,
      sourceAttachments: attachments,
      attachmentNames: attachments.map((attachment) =>
        String(attachment.contentType || "attachment"),
      ),
    },
  });
}

export async function listSupplierQuoteIntakes(input: {
  tenantId: number;
  tenantKey: string;
  limit?: number;
}) {
  assertExportunityTenant(input.tenantKey);
  await ensureQuoteIntakeDependencies(input.tenantId);
  const limit = Math.max(1, Math.min(250, Math.trunc(Number(input.limit) || 100)));
  const intakes = await db
    .select()
    .from(industrialSupplierQuoteIntakes)
    .where(eq(industrialSupplierQuoteIntakes.tenantId, input.tenantId))
    .orderBy(desc(industrialSupplierQuoteIntakes.updatedAt))
    .limit(limit);

  const draftIds = [
    ...new Set(
      intakes
        .map((intake) => intake.rfqDraftId)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const supplierIds = [
    ...new Set(
      intakes
        .map((intake) => intake.supplierProfileId)
      .filter((value): value is string => Boolean(value)),
    ),
  ];
  const intakeIds = intakes.map((intake) => intake.id);
  const [drafts, suppliers, supplierQuotes] = await Promise.all([
    draftIds.length
      ? db
          .select({
            id: industrialSupplierRfqDrafts.id,
            referenceCode: industrialSupplierRfqDrafts.referenceCode,
          })
          .from(industrialSupplierRfqDrafts)
          .where(
            and(
              eq(industrialSupplierRfqDrafts.tenantId, input.tenantId),
              inArray(industrialSupplierRfqDrafts.id, draftIds),
            ),
          )
      : [],
    supplierIds.length
      ? db
          .select({
            id: industrialSupplierProfiles.id,
            legalName: industrialSupplierProfiles.legalName,
          })
          .from(industrialSupplierProfiles)
          .where(
            and(
              eq(industrialSupplierProfiles.tenantId, input.tenantId),
              inArray(industrialSupplierProfiles.id, supplierIds),
            ),
          )
      : [],
    intakeIds.length
      ? db
          .select()
          .from(industrialSupplierQuotes)
          .where(
            and(
              eq(industrialSupplierQuotes.tenantId, input.tenantId),
              inArray(industrialSupplierQuotes.quoteIntakeId, intakeIds),
            ),
          )
          .orderBy(desc(industrialSupplierQuotes.qualifiedAt))
      : [],
  ]);
  const draftMap = new Map(drafts.map((draft) => [draft.id, draft.referenceCode]));
  const supplierMap = new Map(
    suppliers.map((supplier) => [supplier.id, supplier.legalName]),
  );
  const canonicalSupplierQuotes = supplierQuotes.map(
    requireCanonicalSupplierQuote,
  );
  const supplierQuoteMap = new Map(
    canonicalSupplierQuotes.map((quote) => [quote.quoteIntakeId, quote]),
  );
  const items = intakes.map((intake) => {
    const enrichment = {
      rfqReferenceCode: intake.rfqDraftId
        ? draftMap.get(intake.rfqDraftId) ?? null
        : null,
      supplierLegalName: intake.supplierProfileId
        ? supplierMap.get(intake.supplierProfileId) ?? null
        : null,
    };
    const canonicalQuote = supplierQuoteMap.get(intake.id);
    return {
      ...intakeResponse(intake, enrichment),
      canonicalQuote: canonicalQuote
        ? canonicalSupplierQuoteResponse(canonicalQuote, enrichment)
        : null,
    };
  });
  const intakeCountByRequirement = new Map<string, number>();
  for (const intake of intakes) {
    if (!intake.requirementId) continue;
    intakeCountByRequirement.set(
      intake.requirementId,
      (intakeCountByRequirement.get(intake.requirementId) || 0) + 1,
    );
  }
  const canonicalItems = canonicalSupplierQuotes.map((quote) =>
    comparisonItem(quote, {
      rfqReferenceCode: draftMap.get(quote.rfqDraftId) ?? null,
      supplierLegalName: supplierMap.get(quote.supplierProfileId) ?? null,
    }),
  );
  const comparisons = buildCanonicalSupplierQuoteComparisons(
    canonicalItems,
    intakeCountByRequirement,
  ).map((comparison) => ({
    ...comparison,
    items: comparison.items.map((item) => ({
      ...item,
      intakeId: item.quoteIntakeId,
      ...item.values,
    })),
  }));

  return {
    items,
    supplierQuotes: canonicalSupplierQuotes.map((quote) =>
      canonicalSupplierQuoteResponse(quote, {
        rfqReferenceCode: draftMap.get(quote.rfqDraftId) ?? null,
        supplierLegalName: supplierMap.get(quote.supplierProfileId) ?? null,
      }),
    ),
    comparisons,
    governance: {
      nativeSources: ["email", "whatsapp"] as const,
      deterministicNormalization: true as const,
      rawMessageDuplicated: false as const,
      inventedFields: false as const,
      missingAndAmbiguousExplicit: true as const,
      humanQualificationRequired: true as const,
      canonicalSupplierQuoteRequired: true as const,
      comparisonsUseQualifiedCanonicalQuotes: true as const,
      ambiguousCorrelationQualifiable: false as const,
      automatedSupplierRanking: false as const,
      currencyConversionPerformed: false as const,
      customerOfferCreated: false as const,
      recipientOptOutSuppressesContact: true as const,
    },
  };
}

export async function reviewSupplierQuoteIntake(input: {
  tenantId: number;
  tenantKey: string;
  actorUserId: number | null;
  quoteIntakeId: string;
  payload: unknown;
}) {
  assertExportunityTenant(input.tenantKey);
  await ensureQuoteIntakeDependencies(input.tenantId);
  const userId = actorId(input.actorUserId);
  const parsed = parseSupplierQuoteReviewInput(input.payload);
  const now = new Date();

  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(industrialSupplierQuoteIntakes)
      .where(
        and(
          eq(industrialSupplierQuoteIntakes.id, input.quoteIntakeId),
          eq(industrialSupplierQuoteIntakes.tenantId, input.tenantId),
        ),
      )
      .limit(1);
    if (!current) {
      throw new SupplierQuoteIntakeServiceError(
        "SUPPLIER_QUOTE_NOT_FOUND",
        404,
        "The supplier quote intake was not found.",
      );
    }
    if (current.reviewStatus !== "needs_review") {
      if (current.reviewStatus === parsed.decision) {
        const [canonicalQuote] =
          current.reviewStatus === "qualified"
            ? await tx
                .select()
                .from(industrialSupplierQuotes)
                .where(
                  and(
                    eq(industrialSupplierQuotes.tenantId, input.tenantId),
                    eq(industrialSupplierQuotes.quoteIntakeId, current.id),
                  ),
                )
                .limit(1)
            : [];
        return {
          quoteIntake: intakeResponse(current),
          canonicalQuote: canonicalQuote
            ? canonicalSupplierQuoteResponse(
                requireCanonicalSupplierQuote(canonicalQuote),
              )
            : null,
          evidence: {
            entity_ids: [current.id, canonicalQuote?.id].filter(Boolean),
            affected_rows: 0,
            external_side_effect: false,
            idempotent: true,
          },
        };
      }
      throw new SupplierQuoteIntakeServiceError(
        "SUPPLIER_QUOTE_REVIEW_ALREADY_DECIDED",
        409,
        "This supplier quote already has a final review decision.",
      );
    }
    if (
      parsed.decision === "qualified" &&
      current.correlationStatus !== "exact" &&
      current.correlationStatus !== "inferred"
    ) {
      throw new SupplierQuoteIntakeServiceError(
        "SUPPLIER_QUOTE_CORRELATION_UNRESOLVED",
        409,
        "Ambiguous or unmatched replies cannot be qualified until their RFQ correlation is resolved.",
      );
    }
    if (
      parsed.decision === "qualified" &&
      (!current.rfqDispatchId ||
        !current.rfqDraftId ||
        !current.requirementId ||
        !current.supplierProfileId)
    ) {
      throw new SupplierQuoteIntakeServiceError(
        "SUPPLIER_QUOTE_LINEAGE_INCOMPLETE",
        409,
        "A canonical supplier quote requires the governed dispatch, RFQ draft, requirement, and supplier lineage.",
      );
    }

    const resetToReview = parsed.decision === "needs_review";
    const [saved] = await tx
      .update(industrialSupplierQuoteIntakes)
      .set({
        reviewStatus: parsed.decision,
        reviewChecklist: resetToReview ? {} : parsed.checklist,
        reviewNotes: resetToReview ? null : parsed.reviewNotes,
        reviewedByUserId: resetToReview ? null : userId,
        reviewedAt: resetToReview ? null : now,
        updatedAt: now,
      })
      .where(
        and(
          eq(industrialSupplierQuoteIntakes.id, current.id),
          eq(industrialSupplierQuoteIntakes.tenantId, input.tenantId),
          eq(industrialSupplierQuoteIntakes.reviewStatus, "needs_review"),
        ),
      )
      .returning();
    if (!saved) {
      throw new SupplierQuoteIntakeServiceError(
        "SUPPLIER_QUOTE_REVIEW_CONFLICT",
        409,
        "The supplier quote review changed concurrently.",
      );
    }

    let canonicalQuote: typeof industrialSupplierQuotes.$inferSelect | null =
      null;
    if (saved.reviewStatus === "qualified") {
      if (
        !saved.rfqDispatchId ||
        !saved.rfqDraftId ||
        !saved.requirementId ||
        !saved.supplierProfileId
      ) {
        throw new SupplierQuoteIntakeServiceError(
          "SUPPLIER_QUOTE_LINEAGE_INCOMPLETE",
          409,
          "A canonical supplier quote requires complete governed lineage.",
        );
      }
      const projected = canonicalSupplierQuoteInsert({
        source: saved,
        qualifiedByUserId: userId,
        qualifiedAt: now,
      });
      if (!projected) {
        throw new SupplierQuoteIntakeServiceError(
          "SUPPLIER_QUOTE_LINEAGE_INCOMPLETE",
          409,
          "A canonical supplier quote requires complete governed lineage.",
        );
      }
      const [inserted] = await tx
        .insert(industrialSupplierQuotes)
        .values(projected.values)
        .onConflictDoNothing({
          target: industrialSupplierQuotes.quoteIntakeId,
        })
        .returning();
      canonicalQuote = inserted || null;
      if (!canonicalQuote) {
        const [existing] = await tx
          .select()
          .from(industrialSupplierQuotes)
          .where(
            and(
              eq(industrialSupplierQuotes.tenantId, input.tenantId),
              eq(industrialSupplierQuotes.quoteIntakeId, saved.id),
            ),
          )
          .limit(1);
        canonicalQuote = existing || null;
      }
      if (!canonicalQuote) {
        throw new SupplierQuoteIntakeServiceError(
          "SUPPLIER_QUOTE_PROMOTION_FAILED",
          500,
          "The qualified intake could not be promoted into the canonical supplier quote ledger.",
        );
      }
    }

    await tx.insert(industrialAuditLogs).values({
      tenantId: input.tenantId,
      actorUserId: userId,
      action: `industrial_supplier_quote.${parsed.decision}`,
      entityType: "industrial_supplier_quote_intake",
      entityId: current.id,
      reason: parsed.reviewNotes,
      previousValue: {
        reviewStatus: current.reviewStatus,
        correlationStatus: current.correlationStatus,
      },
      nextValue: {
        reviewStatus: saved.reviewStatus,
        correlationStatus: saved.correlationStatus,
        checklist: saved.reviewChecklist,
        canonicalSupplierQuoteId: canonicalQuote?.id ?? null,
      },
      metadata: {
        rfqDispatchId: saved.rfqDispatchId,
        rfqDraftId: saved.rfqDraftId,
        requirementId: saved.requirementId,
        supplierProfileId: saved.supplierProfileId,
        normalizationVersion: saved.normalizationVersion,
        missingFields: saved.missingFields,
        ambiguousFields: saved.ambiguousFields,
        canonicalSupplierQuoteId: canonicalQuote?.id ?? null,
        canonicalSupplierQuoteHash: canonicalQuote?.quoteHash ?? null,
        comparisonReady: canonicalQuote?.comparisonReady ?? false,
        offerPreparationReady:
          canonicalQuote?.offerPreparationReady ?? false,
        inventedFields: false,
        externalSideEffect: false,
      },
      createdAt: now,
    });

    return {
      quoteIntake: intakeResponse(saved),
      canonicalQuote: canonicalQuote
        ? canonicalSupplierQuoteResponse(
            requireCanonicalSupplierQuote(canonicalQuote),
          )
        : null,
      evidence: {
        entity_ids: [saved.id, canonicalQuote?.id].filter(Boolean),
        affected_rows: canonicalQuote ? 2 : 1,
        external_side_effect: false,
        customer_offer_created: false,
        order_created: false,
        payment_created: false,
      },
    };
  });
}

export { SupplierQuoteIntakePolicyError };
