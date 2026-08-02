import type { IndustrialOrderStatus } from "./orders";
import type { IndustrialQuoteStatus } from "./workflow";

export const INDUSTRIAL_REQUIREMENT_STATUSES = [
  "draft",
  "submitted",
  "triaged",
  "under_review",
  "supplier_matching",
  "quote_preparation",
  "quoted",
  "closed",
  "cancelled",
] as const;

export const INDUSTRIAL_REQUIREMENT_PIPELINE_STAGES = [
  "new",
  "qualification_required",
  "technical_review",
  "supplier_sourcing",
  "costing",
  "quotation_preparation",
  "submitted",
  "negotiation",
  "approved",
  "procurement",
  "manufacturing",
  "quality_control",
  "delivery",
  "completed",
  "lost",
  "cancelled",
] as const;

export const INDUSTRIAL_REQUIREMENT_CLOSURE_OUTCOMES = [
  "completed",
  "lost",
] as const;

export const INDUSTRIAL_REQUIREMENT_COMMERCIAL_PHASES = [
  "negotiation",
] as const;

export type IndustrialRequirementStatus =
  (typeof INDUSTRIAL_REQUIREMENT_STATUSES)[number];
export type IndustrialRequirementPipelineStage =
  (typeof INDUSTRIAL_REQUIREMENT_PIPELINE_STAGES)[number];
export type IndustrialRequirementClosureOutcome =
  (typeof INDUSTRIAL_REQUIREMENT_CLOSURE_OUTCOMES)[number];
export type IndustrialRequirementCommercialPhase =
  (typeof INDUSTRIAL_REQUIREMENT_COMMERCIAL_PHASES)[number];

export type IndustrialRequirementLifecycleQuote = {
  id: string;
  referenceCode: string;
  status: IndustrialQuoteStatus;
  updatedAt?: Date | string | null;
  createdAt?: Date | string | null;
};

export type IndustrialRequirementLifecycleOrder = {
  id: string;
  quoteId: string;
  referenceCode: string;
  status: IndustrialOrderStatus;
  updatedAt?: Date | string | null;
  createdAt?: Date | string | null;
};

export type IndustrialRequirementLifecycle = {
  stage: IndustrialRequirementPipelineStage;
  label: string;
  source: "requirement" | "quotation" | "order" | "closure";
  sourceStatus: string;
  quote: Pick<
    IndustrialRequirementLifecycleQuote,
    "id" | "referenceCode" | "status"
  > | null;
  order: Pick<
    IndustrialRequirementLifecycleOrder,
    "id" | "referenceCode" | "status"
  > | null;
  quoteCount: number;
  orderCount: number;
  commercialPhase: IndustrialRequirementCommercialPhase | null;
  canRecordNegotiation: boolean;
  needsClosureClassification: boolean;
  isTerminal: boolean;
  recommendedAction: string;
};

const REQUIREMENT_TRANSITIONS: Record<
  IndustrialRequirementStatus,
  readonly IndustrialRequirementStatus[]
> = {
  draft: ["submitted", "cancelled"],
  submitted: ["triaged", "under_review", "supplier_matching", "cancelled"],
  triaged: ["under_review", "supplier_matching", "quote_preparation", "cancelled"],
  under_review: ["triaged", "supplier_matching", "quote_preparation", "cancelled"],
  supplier_matching: ["under_review", "quote_preparation", "cancelled"],
  quote_preparation: ["supplier_matching", "quoted", "cancelled"],
  quoted: ["supplier_matching", "closed", "cancelled"],
  closed: ["closed"],
  cancelled: ["cancelled"],
};

const STAGE_LABELS: Record<IndustrialRequirementPipelineStage, string> = {
  new: "Nouveau",
  qualification_required: "Qualification requise",
  technical_review: "Revue technique",
  supplier_sourcing: "Recherche fournisseur",
  costing: "Chiffrage",
  quotation_preparation: "Devis en preparation",
  submitted: "Proposition soumise",
  negotiation: "Negociation",
  approved: "Approuve",
  procurement: "Approvisionnement",
  manufacturing: "Fabrication",
  quality_control: "Controle qualite",
  delivery: "Livraison",
  completed: "Termine",
  lost: "Perdu",
  cancelled: "Annule",
};

function timestampValue(value?: Date | string | null) {
  if (!value) return 0;
  const parsed = value instanceof Date ? value.valueOf() : new Date(value).valueOf();
  return Number.isFinite(parsed) ? parsed : 0;
}

function mostRecent<T extends { updatedAt?: Date | string | null; createdAt?: Date | string | null }>(
  rows: readonly T[],
) {
  return [...rows].sort(
    (left, right) =>
      timestampValue(right.updatedAt || right.createdAt) -
      timestampValue(left.updatedAt || left.createdAt),
  )[0] || null;
}

function selectLifecycleOrder(
  orders: readonly IndustrialRequirementLifecycleOrder[],
) {
  const active = orders.filter(
    (order) => order.status !== "completed" && order.status !== "cancelled",
  );
  return mostRecent(active) || mostRecent(orders);
}

function stageForRequirementStatus(
  requirementStatus: IndustrialRequirementStatus,
  quote: IndustrialRequirementLifecycleQuote | null,
  commercialPhase: IndustrialRequirementCommercialPhase | null,
): IndustrialRequirementPipelineStage {
  switch (requirementStatus) {
    case "draft":
    case "submitted":
      return "new";
    case "triaged":
      return "qualification_required";
    case "under_review":
      return "technical_review";
    case "supplier_matching":
      return "supplier_sourcing";
    case "quote_preparation":
      return quote?.status === "draft" || quote?.status === "under_review"
        ? "costing"
        : "quotation_preparation";
    case "quoted":
      if (quote?.status === "accepted") return "approved";
      if (quote?.status === "declined" || quote?.status === "expired") {
        return "lost";
      }
      if (quote?.status === "cancelled") return "cancelled";
      if (quote?.status === "issued" && commercialPhase === "negotiation") {
        return "negotiation";
      }
      return "submitted";
    case "closed":
      return "completed";
    case "cancelled":
      return "cancelled";
  }
}

function actionForStage(stage: IndustrialRequirementPipelineStage) {
  switch (stage) {
    case "new":
      return "Qualify the technical and commercial need.";
    case "qualification_required":
      return "Confirm the requester, scope, quantity, destination, and urgency.";
    case "technical_review":
      return "Review technical specifications and missing evidence.";
    case "supplier_sourcing":
      return "Identify and assess eligible supplier or factory candidates.";
    case "costing":
      return "Record the cost basis and validate the quotation lines.";
    case "quotation_preparation":
      return "Prepare the quotation for account-manager review.";
    case "submitted":
      return "Record the requester response or next account-manager follow-up.";
    case "negotiation":
      return "Document the negotiated terms before acceptance or a new sourcing cycle.";
    case "approved":
      return "Create a tracked order only after human confirmation.";
    case "procurement":
      return "Track confirmed procurement activity and supplier commitments.";
    case "manufacturing":
      return "Record confirmed production progress only.";
    case "quality_control":
      return "Record the observed quality-control result.";
    case "delivery":
      return "Track the planned delivery and confirmed receipt.";
    case "completed":
      return "Confirm the final outcome and retain the audit trail.";
    case "lost":
      return "Record the loss reason or return to sourcing through a new review.";
    case "cancelled":
      return "Retain the cancellation rationale; no external action is created.";
  }
}

export function canTransitionIndustrialRequirement(
  from: IndustrialRequirementStatus,
  to: IndustrialRequirementStatus,
) {
  return from === to || REQUIREMENT_TRANSITIONS[from].includes(to);
}

export function nextIndustrialRequirementStatuses(
  status: IndustrialRequirementStatus,
) {
  return Array.from(new Set([status, ...REQUIREMENT_TRANSITIONS[status]]));
}

export function deriveIndustrialRequirementLifecycle(input: {
  requirementStatus: IndustrialRequirementStatus;
  quotes?: readonly IndustrialRequirementLifecycleQuote[];
  orders?: readonly IndustrialRequirementLifecycleOrder[];
  commercialPhase?: IndustrialRequirementCommercialPhase | null;
  closureOutcome?: IndustrialRequirementClosureOutcome | null;
}): IndustrialRequirementLifecycle {
  const quotes = input.quotes || [];
  const orders = input.orders || [];
  const selectedOrder = selectLifecycleOrder(orders);
  const selectedQuote = selectedOrder
    ? quotes.find((quote) => quote.id === selectedOrder.quoteId) || mostRecent(quotes)
    : mostRecent(quotes);
  const commercialPhase =
    input.commercialPhase === "negotiation" ? "negotiation" : null;
  const quote = selectedQuote
    ? {
        id: selectedQuote.id,
        referenceCode: selectedQuote.referenceCode,
        status: selectedQuote.status,
      }
    : null;
  const order = selectedOrder
    ? {
        id: selectedOrder.id,
        referenceCode: selectedOrder.referenceCode,
        status: selectedOrder.status,
      }
    : null;

  if (selectedOrder && selectedOrder.status !== "cancelled") {
    const stage: IndustrialRequirementPipelineStage =
      selectedOrder.status === "confirmed" || selectedOrder.status === "procurement"
        ? "procurement"
        : selectedOrder.status;
    return {
      stage,
      label: STAGE_LABELS[stage],
      source: "order",
      sourceStatus: selectedOrder.status,
      quote,
      order,
      quoteCount: quotes.length,
      orderCount: orders.length,
      commercialPhase: null,
      canRecordNegotiation: false,
      needsClosureClassification: false,
      isTerminal: stage === "completed",
      recommendedAction: actionForStage(stage),
    };
  }

  if (input.requirementStatus === "cancelled") {
    return {
      stage: "cancelled",
      label: STAGE_LABELS.cancelled,
      source: "requirement",
      sourceStatus: input.requirementStatus,
      quote,
      order,
      quoteCount: quotes.length,
      orderCount: orders.length,
      commercialPhase: null,
      canRecordNegotiation: false,
      needsClosureClassification: false,
      isTerminal: true,
      recommendedAction: actionForStage("cancelled"),
    };
  }

  if (input.requirementStatus === "closed") {
    let stage: IndustrialRequirementPipelineStage = "completed";
    let label = STAGE_LABELS.completed;
    let needsClosureClassification = false;

    if (selectedQuote?.status === "accepted") {
      stage = "approved";
      label = STAGE_LABELS.approved;
    } else if (
      selectedQuote?.status === "declined" ||
      selectedQuote?.status === "expired"
    ) {
      stage = "lost";
      label = STAGE_LABELS.lost;
    } else if (selectedQuote?.status === "cancelled") {
      stage = "cancelled";
      label = STAGE_LABELS.cancelled;
    } else if (input.closureOutcome === "lost") {
      stage = "lost";
      label = STAGE_LABELS.lost;
    } else if (input.closureOutcome === "completed") {
      stage = "completed";
      label = STAGE_LABELS.completed;
    } else {
      label = "Closed - outcome to classify";
      needsClosureClassification = true;
    }

    return {
      stage,
      label,
      source: selectedQuote ? "quotation" : "closure",
      sourceStatus: selectedQuote?.status || input.requirementStatus,
      quote,
      order,
      quoteCount: quotes.length,
      orderCount: orders.length,
      commercialPhase: null,
      canRecordNegotiation: false,
      needsClosureClassification,
      isTerminal: !needsClosureClassification && stage !== "approved",
      recommendedAction: needsClosureClassification
        ? "Classify the closure as completed or lost before treating the file as final."
        : actionForStage(stage),
    };
  }

  const stage = stageForRequirementStatus(
    input.requirementStatus,
    selectedQuote,
    commercialPhase,
  );
  const canRecordNegotiation =
    selectedQuote?.status === "issued" && input.requirementStatus === "quoted";

  return {
    stage,
    label: STAGE_LABELS[stage],
    source: selectedQuote ? "quotation" : "requirement",
    sourceStatus: selectedQuote?.status || input.requirementStatus,
    quote,
    order,
    quoteCount: quotes.length,
    orderCount: orders.length,
    commercialPhase: canRecordNegotiation ? commercialPhase : null,
    canRecordNegotiation,
    needsClosureClassification: false,
    isTerminal: stage === "lost" || stage === "cancelled",
    recommendedAction: actionForStage(stage),
  };
}
