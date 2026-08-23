export const INDUSTRIAL_FULFILLMENT_KINDS = [
  "standard_order",
  "sample",
  "prototype",
] as const;

export const INDUSTRIAL_FULFILLMENT_STATUSES = [
  "release_review",
  "procurement",
  "inspection",
  "ready_to_ship",
  "in_transit",
  "customs",
  "last_mile",
  "delivered",
  "exception",
  "cancelled",
] as const;

export const INDUSTRIAL_FULFILLMENT_SERVICE_TYPES = [
  "procurement",
  "inspection",
  "freight",
  "customs",
  "last_mile",
] as const;

export const INDUSTRIAL_FULFILLMENT_SERVICE_STATUSES = [
  "candidate",
  "approval_required",
  "approved",
  "in_progress",
  "completed",
  "exception",
  "cancelled",
] as const;

export const INDUSTRIAL_FULFILLMENT_EVENT_SOURCES = [
  "system_payment",
  "staff",
  "delivery_network",
  "provider_callback",
] as const;

export const INDUSTRIAL_FULFILLMENT_EVENT_TYPES = [
  "payment_verified",
  "fulfillment_initialized",
  "plan_status_changed",
  "service_status_changed",
  "procurement_released",
  "supplier_order_confirmed",
  "goods_ready",
  "inspection_passed",
  "inspection_failed",
  "carrier_booked",
  "carrier_departed",
  "shipment_in_transit",
  "customs_submitted",
  "customs_cleared",
  "last_mile_dispatched",
  "delivery_proof_recorded",
  "exception_reported",
  "exception_resolved",
] as const;

export const INDUSTRIAL_FULFILLMENT_MANUAL_EVENT_TYPES = [
  "procurement_released",
  "supplier_order_confirmed",
  "goods_ready",
  "inspection_passed",
  "inspection_failed",
  "carrier_booked",
  "carrier_departed",
  "shipment_in_transit",
  "customs_submitted",
  "customs_cleared",
  "last_mile_dispatched",
  "delivery_proof_recorded",
  "exception_reported",
  "exception_resolved",
] as const;

export type IndustrialFulfillmentKind =
  (typeof INDUSTRIAL_FULFILLMENT_KINDS)[number];
export type IndustrialFulfillmentStatus =
  (typeof INDUSTRIAL_FULFILLMENT_STATUSES)[number];
export type IndustrialFulfillmentServiceType =
  (typeof INDUSTRIAL_FULFILLMENT_SERVICE_TYPES)[number];
export type IndustrialFulfillmentServiceStatus =
  (typeof INDUSTRIAL_FULFILLMENT_SERVICE_STATUSES)[number];

const FULFILLMENT_TRANSITIONS: Record<
  IndustrialFulfillmentStatus,
  readonly IndustrialFulfillmentStatus[]
> = {
  release_review: ["procurement", "exception", "cancelled"],
  procurement: ["inspection", "exception", "cancelled"],
  inspection: ["procurement", "ready_to_ship", "exception", "cancelled"],
  ready_to_ship: ["in_transit", "last_mile", "exception", "cancelled"],
  in_transit: ["customs", "last_mile", "exception", "cancelled"],
  customs: ["in_transit", "last_mile", "exception", "cancelled"],
  last_mile: ["delivered", "exception", "cancelled"],
  delivered: [],
  exception: [
    "release_review",
    "procurement",
    "inspection",
    "ready_to_ship",
    "in_transit",
    "customs",
    "last_mile",
    "cancelled",
  ],
  cancelled: [],
};

const SERVICE_TRANSITIONS: Record<
  IndustrialFulfillmentServiceStatus,
  readonly IndustrialFulfillmentServiceStatus[]
> = {
  candidate: ["approval_required", "approved", "cancelled"],
  approval_required: ["approved", "cancelled"],
  approved: ["in_progress", "exception", "cancelled"],
  in_progress: ["completed", "exception", "cancelled"],
  completed: [],
  exception: ["approved", "in_progress", "cancelled"],
  cancelled: [],
};

export function canTransitionIndustrialFulfillment(
  from: IndustrialFulfillmentStatus,
  to: IndustrialFulfillmentStatus,
) {
  return from === to || FULFILLMENT_TRANSITIONS[from].includes(to);
}

export function nextIndustrialFulfillmentStatuses(
  status: IndustrialFulfillmentStatus,
) {
  return [...FULFILLMENT_TRANSITIONS[status]];
}

export function canTransitionIndustrialFulfillmentService(
  from: IndustrialFulfillmentServiceStatus,
  to: IndustrialFulfillmentServiceStatus,
) {
  return from === to || SERVICE_TRANSITIONS[from].includes(to);
}

export function nextIndustrialFulfillmentServiceStatuses(
  status: IndustrialFulfillmentServiceStatus,
) {
  return [...SERVICE_TRANSITIONS[status]];
}

type ServiceSnapshot = {
  serviceType: IndustrialFulfillmentServiceType;
  status: IndustrialFulfillmentServiceStatus;
  providerReference?: string | null;
  externalReference?: string | null;
};

type EventSnapshot = {
  eventType: string;
  customerVisible?: boolean | null;
  evidence?: unknown;
  proof?: unknown;
};

export type FulfillmentTransitionBlock = {
  code: string;
  message: string;
};

function serviceFor(
  services: readonly ServiceSnapshot[],
  serviceType: IndustrialFulfillmentServiceType,
) {
  return services.find((service) => service.serviceType === serviceType);
}

function serviceIs(
  services: readonly ServiceSnapshot[],
  serviceType: IndustrialFulfillmentServiceType,
  statuses: readonly IndustrialFulfillmentServiceStatus[],
) {
  const service = serviceFor(services, serviceType);
  return Boolean(service && statuses.includes(service.status));
}

function hasNonEmptyRecord(value: unknown) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value as Record<string, unknown>).length,
  );
}

function hasEvidence(value: unknown) {
  return Array.isArray(value) && value.length > 0;
}

/**
 * Validates operational evidence for the requested fulfillment transition.
 * It does not execute supplier outreach, provider booking, customs filing, or
 * money movement; those remain separate governed actions.
 */
export function industrialFulfillmentTransitionBlock(input: {
  from: IndustrialFulfillmentStatus;
  to: IndustrialFulfillmentStatus;
  paymentStatus: string;
  services: readonly ServiceSnapshot[];
  events: readonly EventSnapshot[];
}): FulfillmentTransitionBlock | null {
  if (!canTransitionIndustrialFulfillment(input.from, input.to)) {
    return {
      code: "industrial_fulfillment_transition_invalid",
      message: "The fulfillment plan cannot move to that status from its current state.",
    };
  }
  if (input.from === input.to || input.to === "exception" || input.to === "cancelled") {
    return null;
  }
  if (String(input.paymentStatus || "").toLowerCase() !== "paid") {
    return {
      code: "industrial_fulfillment_payment_required",
      message: "Verified customer payment is required before fulfillment can advance.",
    };
  }

  if (
    input.to === "procurement" &&
    !serviceIs(input.services, "procurement", ["approved", "in_progress", "completed"])
  ) {
    return {
      code: "industrial_fulfillment_procurement_approval_required",
      message: "Approve the accountable procurement service before releasing procurement.",
    };
  }
  if (
    input.to === "procurement" &&
    !input.events.some(
      (event) =>
        event.eventType === "procurement_released" && hasEvidence(event.evidence),
    )
  ) {
    return {
      code: "industrial_fulfillment_procurement_authorization_required",
      message:
        "Approve the exact paid-order procurement authorization before releasing procurement.",
    };
  }
  if (
    input.to === "inspection" &&
    !serviceIs(input.services, "procurement", ["completed"])
  ) {
    return {
      code: "industrial_fulfillment_procurement_incomplete",
      message: "Procurement must be recorded as completed before inspection begins.",
    };
  }
  if (input.to === "ready_to_ship") {
    if (!serviceIs(input.services, "inspection", ["completed"])) {
      return {
        code: "industrial_fulfillment_inspection_incomplete",
        message: "The inspection service must be completed before the shipment is released.",
      };
    }
    const inspectionEvidence = input.events.some(
      (event) =>
        event.eventType === "inspection_passed" &&
        (hasEvidence(event.evidence) || hasNonEmptyRecord(event.proof)),
    );
    if (!inspectionEvidence) {
      return {
        code: "industrial_fulfillment_inspection_evidence_required",
        message: "Record inspection evidence before marking the order ready to ship.",
      };
    }
  }
  if (input.to === "in_transit") {
    const freight = serviceFor(input.services, "freight");
    if (
      !freight ||
      !["in_progress", "completed"].includes(freight.status) ||
      !(freight.externalReference || freight.providerReference)
    ) {
      return {
        code: "industrial_fulfillment_freight_reference_required",
        message: "An active freight service and carrier tracking reference are required.",
      };
    }
  }
  if (
    input.to === "customs" &&
    !serviceIs(input.services, "customs", ["approved", "in_progress", "completed"])
  ) {
    return {
      code: "industrial_fulfillment_customs_service_required",
      message: "Approve the accountable customs service before entering customs clearance.",
    };
  }
  if (input.to === "last_mile") {
    if (!serviceIs(input.services, "last_mile", ["in_progress", "completed"])) {
      return {
        code: "industrial_fulfillment_last_mile_required",
        message: "An active last-mile service is required before final delivery.",
      };
    }
    if (
      input.from === "customs" &&
      !serviceIs(input.services, "customs", ["completed"])
    ) {
      return {
        code: "industrial_fulfillment_customs_incomplete",
        message: "Customs clearance must be completed before last-mile delivery begins.",
      };
    }
  }
  if (input.to === "delivered") {
    if (!serviceIs(input.services, "last_mile", ["completed"])) {
      return {
        code: "industrial_fulfillment_last_mile_incomplete",
        message: "The last-mile service must be completed before delivery is closed.",
      };
    }
    const deliveryProof = input.events.some(
      (event) =>
        event.eventType === "delivery_proof_recorded" &&
        hasNonEmptyRecord(event.proof),
    );
    if (!deliveryProof) {
      return {
        code: "industrial_fulfillment_delivery_proof_required",
        message: "A delivery proof record is required before closing the order.",
      };
    }
  }
  return null;
}

export function fulfillmentServiceNeedsHumanApproval(input: {
  providerKind?: string | null;
  from: IndustrialFulfillmentServiceStatus;
  to: IndustrialFulfillmentServiceStatus;
}) {
  if (input.to !== "approved") return false;
  const providerKind = String(input.providerKind || "").trim().toLowerCase();
  return providerKind !== "internal_team" || input.from === "approval_required";
}
