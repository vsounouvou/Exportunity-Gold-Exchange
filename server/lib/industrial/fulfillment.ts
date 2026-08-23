import { nanoid } from "nanoid";
import { and, asc, eq, sql } from "drizzle-orm";

import { db } from "@db";
import {
  carrierBookingAuthorizations,
  carrierDeliveryQuotes,
  carrierProfiles,
  industrialFulfillmentEvents,
  industrialFulfillmentPlans,
  industrialFulfillmentServices,
  industrialOrders,
} from "@db/schema";
import { evaluateCarrierProfileReadiness } from "./carrierNetworkPolicy";
import {
  canTransitionIndustrialFulfillmentService,
  industrialFulfillmentTransitionBlock,
  nextIndustrialFulfillmentServiceStatuses,
  nextIndustrialFulfillmentStatuses,
  type IndustrialFulfillmentKind,
  type IndustrialFulfillmentServiceStatus,
  type IndustrialFulfillmentServiceType,
  type IndustrialFulfillmentStatus,
} from "./fulfillmentPolicy";
import {
  canTransitionIndustrialOrder,
  type IndustrialOrderStatus,
} from "./orders";

type Executor = any;

export class IndustrialFulfillmentError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 409,
  ) {
    super(message);
    this.name = "IndustrialFulfillmentError";
  }
}

function trackingCode() {
  return `EXF-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${nanoid(8).toUpperCase()}`;
}

export async function lockPlan(executor: Executor, tenantId: number, orderId: string) {
  await executor.execute(sql`
    select pg_advisory_xact_lock(
      ${tenantId},
      hashtext(${`industrial-fulfillment:${orderId}`})
    )
  `);
}

export async function appendEventInTransaction(
  executor: Executor,
  input: {
    tenantId: number;
    planId: string;
    orderId: string;
    idempotencyKey: string;
    eventType: string;
    planStatus?: IndustrialFulfillmentStatus | null;
    title: string;
    customerMessage?: string | null;
    internalNotes?: string | null;
    customerVisible?: boolean;
    evidence?: Array<Record<string, unknown>>;
    proof?: Record<string, unknown>;
    source?: "system_payment" | "staff" | "delivery_network" | "provider_callback";
    actorUserId?: number | null;
    occurredAt?: Date;
  },
) {
  const [existing] = await executor
    .select()
    .from(industrialFulfillmentEvents)
    .where(
      and(
        eq(industrialFulfillmentEvents.tenantId, input.tenantId),
        eq(industrialFulfillmentEvents.idempotencyKey, input.idempotencyKey),
      ),
    )
    .limit(1);
  if (existing) return { event: existing, created: false };

  const [sequenceRow] = await executor
    .select({
      value: sql<number>`coalesce(max(${industrialFulfillmentEvents.sequence}), 0)`,
    })
    .from(industrialFulfillmentEvents)
    .where(eq(industrialFulfillmentEvents.planId, input.planId));
  const sequence = Number(sequenceRow?.value || 0) + 1;
  const [event] = await executor
    .insert(industrialFulfillmentEvents)
    .values({
      tenantId: input.tenantId,
      planId: input.planId,
      orderId: input.orderId,
      sequence,
      idempotencyKey: input.idempotencyKey,
      eventType: input.eventType,
      planStatus: input.planStatus || null,
      title: input.title,
      customerMessage: input.customerMessage || null,
      internalNotes: input.internalNotes || null,
      customerVisible: Boolean(input.customerVisible),
      evidence: input.evidence || [],
      proof: input.proof || {},
      source: input.source || "staff",
      actorUserId: input.actorUserId || null,
      occurredAt: input.occurredAt || new Date(),
      recordedAt: new Date(),
    })
    .returning();
  return { event, created: true };
}

export async function ensureIndustrialFulfillmentPlan(
  input: {
    tenantId: number;
    orderId: string;
    paymentId: string;
    procurementTaskId?: number | null;
    kind?: IndustrialFulfillmentKind;
    publicEta?: Date | null;
    routeSnapshot?: Record<string, unknown>;
    actorUserId?: number | null;
  },
  executor: Executor = db,
) {
  await lockPlan(executor, input.tenantId, input.orderId);
  let [plan] = await executor
    .select()
    .from(industrialFulfillmentPlans)
    .where(
      and(
        eq(industrialFulfillmentPlans.tenantId, input.tenantId),
        eq(industrialFulfillmentPlans.orderId, input.orderId),
      ),
    )
    .limit(1);
  let created = false;

  if (!plan) {
    [plan] = await executor
      .insert(industrialFulfillmentPlans)
      .values({
        tenantId: input.tenantId,
        orderId: input.orderId,
        kind: input.kind || "standard_order",
        status: "release_review",
        trackingCode: trackingCode(),
        procurementTaskId: input.procurementTaskId || null,
        publicEta: input.publicEta || null,
        routeSnapshot: input.routeSnapshot || {},
        metadata: {
          externalProviderAutomationEnabled: false,
          externalCommitmentsStarted: false,
        },
        createdByUserId: input.actorUserId || null,
        updatedByUserId: input.actorUserId || null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoNothing({
        target: [
          industrialFulfillmentPlans.tenantId,
          industrialFulfillmentPlans.orderId,
        ],
      })
      .returning();
    if (!plan) {
      [plan] = await executor
        .select()
        .from(industrialFulfillmentPlans)
        .where(
          and(
            eq(industrialFulfillmentPlans.tenantId, input.tenantId),
            eq(industrialFulfillmentPlans.orderId, input.orderId),
          ),
        )
        .limit(1);
    } else {
      created = true;
    }
  } else if (input.procurementTaskId && !plan.procurementTaskId) {
    [plan] = await executor
      .update(industrialFulfillmentPlans)
      .set({
        procurementTaskId: input.procurementTaskId,
        updatedByUserId: input.actorUserId || null,
        updatedAt: new Date(),
      })
      .where(eq(industrialFulfillmentPlans.id, plan.id))
      .returning();
  }
  if (!plan) {
    throw new IndustrialFulfillmentError(
      "industrial_fulfillment_initialization_failed",
      "The fulfillment plan could not be initialized.",
      500,
    );
  }

  const serviceSlots: Array<{
    serviceType: IndustrialFulfillmentServiceType;
    status: IndustrialFulfillmentServiceStatus;
    providerKind: string;
    providerName: string | null;
    publicLabel: string;
  }> = [
    {
      serviceType: "procurement",
      status: "approved",
      providerKind: "internal_team",
      providerName: "Exportunity Procurement Team",
      publicLabel: "Procurement coordination",
    },
    {
      serviceType: "inspection",
      status: "candidate",
      providerKind: "internal_team",
      providerName: "Exportunity Quality Team",
      publicLabel: "Quality inspection",
    },
    {
      serviceType: "freight",
      status: "approval_required",
      providerKind: "verified_partner",
      providerName: null,
      publicLabel: "Freight coordination",
    },
    {
      serviceType: "customs",
      status: "approval_required",
      providerKind: "verified_partner",
      providerName: null,
      publicLabel: "Customs clearance",
    },
    {
      serviceType: "last_mile",
      status: "approval_required",
      providerKind: "existing_delivery_network",
      providerName: null,
      publicLabel: "Last-mile delivery",
    },
  ];
  for (const slot of serviceSlots) {
    await executor
      .insert(industrialFulfillmentServices)
      .values({
        tenantId: input.tenantId,
        planId: plan.id,
        orderId: input.orderId,
        ...slot,
        approvalReason:
          slot.serviceType === "procurement"
            ? "Verified payment created an accountable internal procurement workstream; no supplier commitment was made."
            : null,
        approvedByUserId:
          slot.serviceType === "procurement" ? input.actorUserId || null : null,
        approvedAt: slot.serviceType === "procurement" ? new Date() : null,
        metadata: {
          externalActionExecuted: false,
          providerBookingExecuted: false,
        },
        createdByUserId: input.actorUserId || null,
        updatedByUserId: input.actorUserId || null,
      })
      .onConflictDoNothing({
        target: [
          industrialFulfillmentServices.planId,
          industrialFulfillmentServices.serviceType,
        ],
      });
  }

  await appendEventInTransaction(executor, {
    tenantId: input.tenantId,
    planId: plan.id,
    orderId: input.orderId,
    idempotencyKey: `industrial-fulfillment-payment:${input.paymentId}`,
    eventType: "payment_verified",
    planStatus: "release_review",
    title: "Payment verified",
    customerMessage:
      "Payment was verified and the order entered controlled fulfillment review.",
    internalNotes:
      "Procurement, inspection, logistics, customs, and delivery remain governed service steps. No external action was started automatically.",
    customerVisible: true,
    proof: { paymentId: input.paymentId },
    source: "system_payment",
    actorUserId: input.actorUserId || null,
  });

  return { plan, created };
}

export async function loadIndustrialFulfillment(input: {
  tenantId: number;
  orderId: string;
}) {
  const [plan] = await db
    .select()
    .from(industrialFulfillmentPlans)
    .where(
      and(
        eq(industrialFulfillmentPlans.tenantId, input.tenantId),
        eq(industrialFulfillmentPlans.orderId, input.orderId),
      ),
    )
    .limit(1);
  if (!plan) return null;
  const [services, events] = await Promise.all([
    db
      .select()
      .from(industrialFulfillmentServices)
      .where(
        and(
          eq(industrialFulfillmentServices.tenantId, input.tenantId),
          eq(industrialFulfillmentServices.planId, plan.id),
        ),
      )
      .orderBy(asc(industrialFulfillmentServices.createdAt)),
    db
      .select()
      .from(industrialFulfillmentEvents)
      .where(
        and(
          eq(industrialFulfillmentEvents.tenantId, input.tenantId),
          eq(industrialFulfillmentEvents.planId, plan.id),
        ),
      )
      .orderBy(asc(industrialFulfillmentEvents.sequence)),
  ]);
  return { plan, services, events };
}

export function staffIndustrialFulfillmentSummary(
  fulfillment: Awaited<ReturnType<typeof loadIndustrialFulfillment>>,
) {
  if (!fulfillment) return null;
  return {
    ...fulfillment.plan,
    nextStatuses: nextIndustrialFulfillmentStatuses(
      fulfillment.plan.status as IndustrialFulfillmentStatus,
    ),
    services: fulfillment.services.map((service) => ({
      ...service,
      nextStatuses: nextIndustrialFulfillmentServiceStatuses(
        service.status as IndustrialFulfillmentServiceStatus,
      ),
    })),
    events: fulfillment.events,
    controls: {
      providerAutomationEnabled: false,
      externalCommitmentsRequireHumanEvidence: true,
      privateCostsVisible: true,
    },
  };
}

function publicEvidence(evidence: unknown) {
  if (!Array.isArray(evidence)) return [];
  return evidence
    .filter(
      (item) =>
        item &&
        typeof item === "object" &&
        (item as Record<string, unknown>).public === true,
    )
    .map((item) => {
      const record = item as Record<string, unknown>;
      return {
        label: String(record.label || "Evidence"),
        url: record.url ? String(record.url) : null,
        reference: record.reference ? String(record.reference) : null,
      };
    });
}

function publicDeliveryProof(proof: unknown) {
  if (!proof || typeof proof !== "object" || Array.isArray(proof)) return null;
  const record = proof as Record<string, unknown>;
  if (!record.method) return null;
  return {
    method: String(record.method),
    recipientName: record.recipientName ? String(record.recipientName) : null,
    condition: record.condition ? String(record.condition) : null,
    deliveredAt: record.deliveredAt ? String(record.deliveredAt) : null,
    reference: record.reference ? String(record.reference) : null,
  };
}

export function customerIndustrialFulfillmentSummary(
  fulfillment: Awaited<ReturnType<typeof loadIndustrialFulfillment>>,
) {
  if (!fulfillment) return null;
  return {
    trackingCode: fulfillment.plan.trackingCode,
    kind: fulfillment.plan.kind,
    status: fulfillment.plan.status,
    publicEta: fulfillment.plan.publicEta,
    deliveredAt: fulfillment.plan.deliveredAt,
    services: fulfillment.services.map((service) => ({
      serviceType: service.serviceType,
      status: service.status,
      label: service.publicLabel || null,
    })),
    timeline: fulfillment.events
      .filter((event) => event.customerVisible)
      .map((event) => ({
        id: event.id,
        sequence: event.sequence,
        eventType: event.eventType,
        planStatus: event.planStatus,
        title: event.title,
        message: event.customerMessage,
        occurredAt: event.occurredAt,
        evidence: publicEvidence(event.evidence),
        proof:
          event.eventType === "delivery_proof_recorded"
            ? publicDeliveryProof(event.proof)
            : null,
      })),
  };
}

export async function configureIndustrialFulfillmentService(input: {
  tenantId: number;
  orderId: string;
  serviceType: IndustrialFulfillmentServiceType;
  providerKind: string;
  providerName?: string | null;
  providerReference?: string | null;
  externalReference?: string | null;
  publicLabel?: string | null;
  quotedCost?: string | null;
  currencyCode?: string | null;
  linkedDeliveryOrderId?: number | null;
  linkedDeliveryReference?: string | null;
  carrierProfileId?: string | null;
  carrierDeliveryQuoteId?: string | null;
  carrierBookingAuthorizationId?: string | null;
  scheduledStartAt?: Date | null;
  scheduledEndAt?: Date | null;
  internalNotes?: string | null;
  reason: string;
  actorUserId?: number | null;
}) {
  return db.transaction(async (tx) => {
    await lockPlan(tx, input.tenantId, input.orderId);
    const [plan] = await tx
      .select()
      .from(industrialFulfillmentPlans)
      .where(
        and(
          eq(industrialFulfillmentPlans.tenantId, input.tenantId),
          eq(industrialFulfillmentPlans.orderId, input.orderId),
        ),
      )
      .limit(1);
    if (!plan) {
      throw new IndustrialFulfillmentError(
        "industrial_fulfillment_not_found",
        "Initialize the paid order's fulfillment plan first.",
        404,
      );
    }
    const [service] = await tx
      .select()
      .from(industrialFulfillmentServices)
      .where(
        and(
          eq(industrialFulfillmentServices.planId, plan.id),
          eq(industrialFulfillmentServices.serviceType, input.serviceType),
        ),
      )
      .limit(1);
    if (!service) {
      throw new IndustrialFulfillmentError(
        "industrial_fulfillment_service_not_found",
        "The requested fulfillment service slot does not exist.",
        404,
      );
    }
    if (["completed", "cancelled"].includes(service.status)) {
      throw new IndustrialFulfillmentError(
        "industrial_fulfillment_service_final",
        "A completed or cancelled service cannot be reconfigured.",
      );
    }
    const carrierManagedService = ["freight", "customs", "last_mile"].includes(
      service.serviceType,
    );
    const carrierProviderKind = ["verified_partner", "verified_carrier"].includes(
      String(input.providerKind || "").trim().toLowerCase(),
    );
    if (carrierManagedService && carrierProviderKind && !input.carrierProfileId) {
      throw new IndustrialFulfillmentError(
        "industrial_fulfillment_carrier_profile_required",
        "Select a tenant-scoped verified carrier profile instead of entering a free-text partner name.",
      );
    }
    if (
      service.serviceType === "last_mile" &&
      input.providerKind === "existing_delivery_network" &&
      !(input.linkedDeliveryOrderId && input.linkedDeliveryReference)
    ) {
      throw new IndustrialFulfillmentError(
        "industrial_fulfillment_delivery_link_required",
        "A canonical tenant-scoped delivery job is required for the existing delivery network.",
      );
    }
    const nextStatus =
      input.providerKind === "internal_team" || service.status !== "candidate"
        ? service.status
        : "approval_required";
    const [updated] = await tx
      .update(industrialFulfillmentServices)
      .set({
        providerKind: input.providerKind,
        providerName: input.providerName || null,
        providerReference: input.providerReference || null,
        externalReference: input.externalReference || null,
        publicLabel: input.publicLabel || service.publicLabel,
        quotedCost: input.quotedCost || null,
        currencyCode: input.currencyCode || null,
        linkedDeliveryOrderId: input.linkedDeliveryOrderId || null,
        linkedDeliveryReference: input.linkedDeliveryReference || null,
        carrierProfileId: input.carrierProfileId || null,
        carrierDeliveryQuoteId: input.carrierDeliveryQuoteId || null,
        carrierBookingAuthorizationId: input.carrierBookingAuthorizationId || null,
        scheduledStartAt: input.scheduledStartAt || null,
        scheduledEndAt: input.scheduledEndAt || null,
        internalNotes: input.internalNotes || null,
        status: nextStatus,
        metadata: {
          ...(service.metadata as Record<string, unknown>),
          configuredReason: input.reason,
          externalActionExecuted: false,
          providerBookingExecuted: false,
        },
        updatedByUserId: input.actorUserId || null,
        updatedAt: new Date(),
      })
      .where(eq(industrialFulfillmentServices.id, service.id))
      .returning();
    return { plan, service: updated, previous: service };
  });
}

export async function transitionIndustrialFulfillmentService(input: {
  tenantId: number;
  orderId: string;
  serviceId: string;
  status: IndustrialFulfillmentServiceStatus;
  reason: string;
  humanConfirmed?: boolean;
  customerMessage?: string | null;
  performanceRating?: number | null;
  onTime?: boolean | null;
  issueCount?: number | null;
  performanceNotes?: string | null;
  actorUserId?: number | null;
}) {
  return db.transaction(async (tx) => {
    await lockPlan(tx, input.tenantId, input.orderId);
    const [service] = await tx
      .select()
      .from(industrialFulfillmentServices)
      .where(
        and(
          eq(industrialFulfillmentServices.id, input.serviceId),
          eq(industrialFulfillmentServices.tenantId, input.tenantId),
          eq(industrialFulfillmentServices.orderId, input.orderId),
        ),
      )
      .limit(1);
    if (!service) {
      throw new IndustrialFulfillmentError(
        "industrial_fulfillment_service_not_found",
        "The fulfillment service was not found.",
        404,
      );
    }
    if (service.status === input.status) {
      throw new IndustrialFulfillmentError(
        "industrial_fulfillment_service_status_unchanged",
        "The fulfillment service is already in the requested status.",
      );
    }
    if (
      !canTransitionIndustrialFulfillmentService(
        service.status as IndustrialFulfillmentServiceStatus,
        input.status,
      )
    ) {
      throw new IndustrialFulfillmentError(
        "industrial_fulfillment_service_transition_invalid",
        "The fulfillment service cannot move to that status.",
      );
    }
    if (input.status === "approved" && input.humanConfirmed !== true) {
      throw new IndustrialFulfillmentError(
        "industrial_fulfillment_service_approval_required",
        "A visible human approval is required before approving a fulfillment provider.",
      );
    }
    if (
      input.status === "approved" &&
      service.providerKind !== "internal_team" &&
      !String(service.providerName || "").trim()
    ) {
      throw new IndustrialFulfillmentError(
        "industrial_fulfillment_provider_identity_required",
        "Record the verified provider identity before approving an external fulfillment service.",
      );
    }
    if (
      input.status === "approved" &&
      ["verified_partner", "verified_carrier"].includes(service.providerKind)
    ) {
      if (!service.carrierProfileId) {
        throw new IndustrialFulfillmentError(
          "industrial_fulfillment_carrier_profile_required",
          "A verified carrier registry profile is required before approving this service.",
        );
      }
      const [profile, quote] = await Promise.all([
        tx.query.carrierProfiles.findFirst({
          where: and(
            eq(carrierProfiles.tenantId, input.tenantId),
            eq(carrierProfiles.id, service.carrierProfileId),
          ),
        }),
        service.carrierDeliveryQuoteId
          ? tx.query.carrierDeliveryQuotes.findFirst({
              where: and(
                eq(carrierDeliveryQuotes.tenantId, input.tenantId),
                eq(carrierDeliveryQuotes.id, service.carrierDeliveryQuoteId),
                eq(carrierDeliveryQuotes.carrierProfileId, service.carrierProfileId),
              ),
            })
          : Promise.resolve(null),
      ]);
      const readiness = evaluateCarrierProfileReadiness({
        tenantId: input.tenantId,
        profile: profile || null,
        requireContractedPartner: true,
      });
      if (!readiness.ready) {
        throw new IndustrialFulfillmentError(
          "industrial_fulfillment_carrier_not_ready",
          `Carrier approval is blocked: ${readiness.blockers.join(", ")}`,
        );
      }
      if (!quote || !["verified", "selected"].includes(quote.status)) {
        throw new IndustrialFulfillmentError(
          "industrial_fulfillment_carrier_quote_required",
          "A current verified carrier quote is required before approving this external service.",
        );
      }
      if (new Date(quote.validUntil).getTime() <= Date.now()) {
        throw new IndustrialFulfillmentError(
          "industrial_fulfillment_carrier_quote_expired",
          "The selected carrier quote has expired.",
        );
      }
    }
    if (
      input.status === "in_progress" &&
      service.providerKind !== "internal_team" &&
      !(service.externalReference ||
        service.providerReference ||
        service.linkedDeliveryReference)
    ) {
      throw new IndustrialFulfillmentError(
        "industrial_fulfillment_external_reference_required",
        "Record the existing provider, carrier, customs, or delivery reference before marking this external service in progress.",
      );
    }
    if (
      input.status === "in_progress" &&
      ["verified_partner", "verified_carrier"].includes(service.providerKind)
    ) {
      if (!service.carrierBookingAuthorizationId) {
        throw new IndustrialFulfillmentError(
          "industrial_fulfillment_provider_booking_confirmation_required",
          "A provider-confirmed carrier booking is required before this service can start.",
        );
      }
      const booking = await tx.query.carrierBookingAuthorizations.findFirst({
        where: and(
          eq(carrierBookingAuthorizations.tenantId, input.tenantId),
          eq(
            carrierBookingAuthorizations.id,
            service.carrierBookingAuthorizationId,
          ),
          eq(carrierBookingAuthorizations.fulfillmentServiceId, service.id),
        ),
      });
      if (
        !booking ||
        !["provider_confirmed", "in_progress", "completed"].includes(
          booking.status,
        ) ||
        booking.externalBookingExecuted !== true ||
        !booking.providerBookingReference
      ) {
        throw new IndustrialFulfillmentError(
          "industrial_fulfillment_provider_booking_confirmation_required",
          "Record a verified provider booking receipt before marking this carrier service in progress.",
        );
      }
    }
    if (
      input.status === "in_progress" &&
      service.providerKind !== "internal_team" &&
      input.humanConfirmed !== true
    ) {
      throw new IndustrialFulfillmentError(
        "industrial_fulfillment_external_commitment_confirmation_required",
        "Confirm that the external commitment already exists before recording it as in progress.",
      );
    }

    const now = new Date();
    const [updated] = await tx
      .update(industrialFulfillmentServices)
      .set({
        status: input.status,
        approvalReason:
          input.status === "approved" ? input.reason : service.approvalReason,
        approvedByUserId:
          input.status === "approved"
            ? input.actorUserId || null
            : service.approvedByUserId,
        approvedAt: input.status === "approved" ? now : service.approvedAt,
        startedAt: input.status === "in_progress" ? now : service.startedAt,
        completedAt: input.status === "completed" ? now : service.completedAt,
        performanceRating:
          input.performanceRating === undefined
            ? service.performanceRating
            : input.performanceRating,
        onTime: input.onTime === undefined ? service.onTime : input.onTime,
        issueCount:
          input.issueCount === undefined || input.issueCount === null
            ? service.issueCount
            : input.issueCount,
        performanceNotes:
          input.performanceNotes === undefined
            ? service.performanceNotes
            : input.performanceNotes,
        metadata: {
          ...(service.metadata as Record<string, unknown>),
          lastTransitionReason: input.reason,
          externalActionExecuted: false,
          providerBookingExecuted: false,
          existingExternalCommitmentRecorded:
            input.status === "in_progress" && service.providerKind !== "internal_team",
        },
        updatedByUserId: input.actorUserId || null,
        updatedAt: now,
      })
      .where(
        and(
          eq(industrialFulfillmentServices.id, service.id),
          eq(industrialFulfillmentServices.status, service.status),
        ),
      )
      .returning();
    if (!updated) {
      throw new IndustrialFulfillmentError(
        "industrial_fulfillment_service_concurrent_update",
        "The service changed while it was being updated. Reload and try again.",
      );
    }
    await appendEventInTransaction(tx, {
      tenantId: input.tenantId,
      planId: service.planId,
      orderId: input.orderId,
      idempotencyKey: `industrial-service:${service.id}:${service.status}:${input.status}:${now.toISOString()}`,
      eventType: "service_status_changed",
      title: `${service.serviceType.replaceAll("_", " ")} service: ${input.status.replaceAll("_", " ")}`,
      customerMessage: input.customerMessage || null,
      internalNotes: input.reason,
      customerVisible: Boolean(input.customerMessage),
      source: "staff",
      actorUserId: input.actorUserId || null,
      occurredAt: now,
    });
    return { service: updated, previous: service };
  });
}

const PUBLIC_STATUS_MESSAGES: Partial<
  Record<IndustrialFulfillmentStatus, { title: string; message: string }>
> = {
  procurement: {
    title: "Procurement underway",
    message: "The procurement workstream has been released for this order.",
  },
  inspection: {
    title: "Quality inspection underway",
    message: "The order is in controlled quality inspection.",
  },
  ready_to_ship: {
    title: "Ready to ship",
    message: "Inspection evidence was recorded and the order is ready for dispatch.",
  },
  in_transit: {
    title: "Shipment in transit",
    message: "The carrier reference was verified and the shipment is in transit.",
  },
  customs: {
    title: "Customs clearance",
    message: "The shipment is in the customs clearance workstream.",
  },
  last_mile: {
    title: "Final delivery underway",
    message: "The order entered the last-mile delivery workstream.",
  },
  delivered: {
    title: "Delivered",
    message: "Delivery was recorded with proof.",
  },
  cancelled: {
    title: "Fulfillment cancelled",
    message: "Fulfillment was cancelled by the accountable operations team.",
  },
};

function orderStatusForFulfillment(
  status: IndustrialFulfillmentStatus,
): IndustrialOrderStatus | null {
  if (status === "procurement") return "procurement";
  if (status === "inspection") return "quality_control";
  if (["ready_to_ship", "in_transit", "customs", "last_mile"].includes(status)) {
    return "delivery";
  }
  if (status === "delivered") return "completed";
  if (status === "cancelled") return "cancelled";
  return null;
}

export async function transitionIndustrialFulfillmentPlan(input: {
  tenantId: number;
  orderId: string;
  status: IndustrialFulfillmentStatus;
  reason: string;
  customerMessage?: string | null;
  publicEta?: Date | null;
  actorUserId?: number | null;
}) {
  return db.transaction(async (tx) => {
    await lockPlan(tx, input.tenantId, input.orderId);
    const [plan] = await tx
      .select()
      .from(industrialFulfillmentPlans)
      .where(
        and(
          eq(industrialFulfillmentPlans.tenantId, input.tenantId),
          eq(industrialFulfillmentPlans.orderId, input.orderId),
        ),
      )
      .limit(1);
    const [order] = await tx
      .select()
      .from(industrialOrders)
      .where(
        and(
          eq(industrialOrders.tenantId, input.tenantId),
          eq(industrialOrders.id, input.orderId),
        ),
      )
      .limit(1);
    if (!plan || !order) {
      throw new IndustrialFulfillmentError(
        "industrial_fulfillment_not_found",
        "The industrial fulfillment plan was not found.",
        404,
      );
    }
    if (plan.status === input.status) {
      throw new IndustrialFulfillmentError(
        "industrial_fulfillment_status_unchanged",
        "The fulfillment plan is already in the requested status.",
      );
    }
    const [services, events] = await Promise.all([
      tx
        .select()
        .from(industrialFulfillmentServices)
        .where(eq(industrialFulfillmentServices.planId, plan.id)),
      tx
        .select()
        .from(industrialFulfillmentEvents)
        .where(eq(industrialFulfillmentEvents.planId, plan.id)),
    ]);
    const block = industrialFulfillmentTransitionBlock({
      from: plan.status as IndustrialFulfillmentStatus,
      to: input.status,
      paymentStatus: order.paymentStatus,
      services: services as any,
      events,
    });
    if (block) {
      throw new IndustrialFulfillmentError(block.code, block.message);
    }

    const now = new Date();
    const [updated] = await tx
      .update(industrialFulfillmentPlans)
      .set({
        status: input.status,
        publicEta: input.publicEta === undefined ? plan.publicEta : input.publicEta,
        startedAt:
          input.status === "procurement" ? plan.startedAt || now : plan.startedAt,
        deliveredAt: input.status === "delivered" ? now : plan.deliveredAt,
        cancelledAt: input.status === "cancelled" ? now : plan.cancelledAt,
        exceptionSummary:
          input.status === "exception"
            ? input.reason
            : plan.status === "exception"
              ? null
              : plan.exceptionSummary,
        updatedByUserId: input.actorUserId || null,
        updatedAt: now,
      })
      .where(
        and(
          eq(industrialFulfillmentPlans.id, plan.id),
          eq(industrialFulfillmentPlans.status, plan.status),
        ),
      )
      .returning();
    if (!updated) {
      throw new IndustrialFulfillmentError(
        "industrial_fulfillment_concurrent_update",
        "The fulfillment plan changed while it was being updated. Reload and try again.",
      );
    }

    const mappedOrderStatus = orderStatusForFulfillment(input.status);
    if (
      mappedOrderStatus &&
      mappedOrderStatus !== order.status &&
      canTransitionIndustrialOrder(
        order.status as IndustrialOrderStatus,
        mappedOrderStatus,
      )
    ) {
      await tx
        .update(industrialOrders)
        .set({
          status: mappedOrderStatus,
          completedAt: mappedOrderStatus === "completed" ? now : order.completedAt,
          cancelledAt: mappedOrderStatus === "cancelled" ? now : order.cancelledAt,
          updatedByUserId: input.actorUserId || null,
          updatedAt: now,
        })
        .where(
          and(
            eq(industrialOrders.id, order.id),
            eq(industrialOrders.status, order.status),
          ),
        );
    }

    const publicStatus = PUBLIC_STATUS_MESSAGES[input.status];
    await appendEventInTransaction(tx, {
      tenantId: input.tenantId,
      planId: plan.id,
      orderId: input.orderId,
      idempotencyKey: `industrial-plan:${plan.id}:${plan.status}:${input.status}:${now.toISOString()}`,
      eventType: "plan_status_changed",
      planStatus: input.status,
      title: publicStatus?.title || `Fulfillment: ${input.status.replaceAll("_", " ")}`,
      customerMessage: input.customerMessage || publicStatus?.message || null,
      internalNotes: input.reason,
      customerVisible: Boolean(input.customerMessage || publicStatus),
      source: "staff",
      actorUserId: input.actorUserId || null,
      occurredAt: now,
    });
    return { plan: updated, previous: plan, orderStatus: mappedOrderStatus };
  });
}

export async function appendIndustrialFulfillmentEvent(input: {
  tenantId: number;
  orderId: string;
  idempotencyKey: string;
  eventType: string;
  title: string;
  customerMessage?: string | null;
  internalNotes?: string | null;
  customerVisible?: boolean;
  evidence?: Array<Record<string, unknown>>;
  proof?: Record<string, unknown>;
  occurredAt?: Date;
  actorUserId?: number | null;
}) {
  return db.transaction(async (tx) => {
    await lockPlan(tx, input.tenantId, input.orderId);
    const [plan] = await tx
      .select()
      .from(industrialFulfillmentPlans)
      .where(
        and(
          eq(industrialFulfillmentPlans.tenantId, input.tenantId),
          eq(industrialFulfillmentPlans.orderId, input.orderId),
        ),
      )
      .limit(1);
    if (!plan) {
      throw new IndustrialFulfillmentError(
        "industrial_fulfillment_not_found",
        "The industrial fulfillment plan was not found.",
        404,
      );
    }
    return appendEventInTransaction(tx, {
      ...input,
      planId: plan.id,
      planStatus: plan.status as IndustrialFulfillmentStatus,
      source: "staff",
    });
  });
}
