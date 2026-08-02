export const INDUSTRIAL_PART_RECORD_STATUSES = [
  "captured",
  "digitization",
  "technical_review",
  "route_review",
  "route_selected",
  "prototype",
  "validated",
  "catalog_candidate",
  "archived",
] as const;

export type IndustrialPartRecordStatus =
  (typeof INDUSTRIAL_PART_RECORD_STATUSES)[number];

export const INDUSTRIAL_PART_ROUTE_DECISIONS = [
  "review_required",
  "stock",
  "distribute",
  "assemble",
  "manufacture_local",
  "import",
] as const;

export type IndustrialPartRouteDecision =
  (typeof INDUSTRIAL_PART_ROUTE_DECISIONS)[number];

export const INDUSTRIAL_PART_RECORD_DOCUMENT_TYPES = [
  "photo",
  "measurement",
  "drawing",
  "cad",
  "specification",
  "bom",
  "test_report",
  "other",
] as const;

export type IndustrialPartRecordDocumentType =
  (typeof INDUSTRIAL_PART_RECORD_DOCUMENT_TYPES)[number];

const TRANSITIONS: Record<
  IndustrialPartRecordStatus,
  readonly IndustrialPartRecordStatus[]
> = {
  captured: ["digitization", "archived"],
  digitization: ["technical_review", "archived"],
  technical_review: ["digitization", "route_review", "archived"],
  route_review: ["technical_review", "route_selected", "archived"],
  route_selected: ["route_review", "prototype", "validated", "catalog_candidate", "archived"],
  prototype: ["route_review", "validated", "archived"],
  validated: ["route_review", "catalog_candidate", "archived"],
  catalog_candidate: ["route_review", "archived"],
  archived: [],
};

export function canTransitionIndustrialPartRecord(
  current: IndustrialPartRecordStatus,
  next: IndustrialPartRecordStatus,
) {
  return current === next || TRANSITIONS[current].includes(next);
}

export function nextIndustrialPartRecordStatuses(
  status: IndustrialPartRecordStatus,
) {
  return [status, ...TRANSITIONS[status]];
}

export function canFinalizeIndustrialPartRoute(
  status: IndustrialPartRecordStatus,
  routeDecision: IndustrialPartRouteDecision,
) {
  if (routeDecision === "review_required") return false;
  return [
    "route_selected",
    "prototype",
    "validated",
    "catalog_candidate",
  ].includes(status);
}

export function industrialPartRecordNextAction(
  status: IndustrialPartRecordStatus,
  routeDecision: IndustrialPartRouteDecision,
) {
  if (status === "captured") return "Check the part record and begin technical digitization.";
  if (status === "digitization") return "Complete measurements, photos, drawings, and other private technical evidence.";
  if (status === "technical_review") return "Review fit, material, dimensions, and available technical evidence.";
  if (status === "route_review") return "Compare controlled stock, distribution, assembly, local manufacturing, or import routes.";
  if (status === "route_selected") {
    return routeDecision === "review_required"
      ? "Record a reviewed route decision before proceeding."
      : "Validate the selected route or prepare a controlled prototype review.";
  }
  if (status === "prototype") return "Record prototype evidence and technical validation before any next business decision.";
  if (status === "validated") return "Decide whether the internally validated part should be considered for a catalog review.";
  if (status === "catalog_candidate") return "Submit a separate catalog review if publication is appropriate.";
  return "Retain the archived technical record as evidence.";
}
