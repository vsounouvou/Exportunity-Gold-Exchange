import { INDUSTRIAL_REQUIREMENT_TYPES } from "./taxonomy";

export const INDUSTRIAL_CATALOG_STATUSES = ["draft", "under_review", "approved", "archived"] as const;
export const INDUSTRIAL_REQUIREMENT_MATCH_STATUSES = ["candidate", "shortlisted", "selected", "rejected"] as const;
export const INDUSTRIAL_QUOTE_STATUSES = [
  "draft",
  "under_review",
  "ready_for_account_manager",
  "issued",
  "accepted",
  "declined",
  "expired",
  "cancelled",
] as const;

export type IndustrialCatalogStatus = (typeof INDUSTRIAL_CATALOG_STATUSES)[number];
export type IndustrialRequirementMatchStatus = (typeof INDUSTRIAL_REQUIREMENT_MATCH_STATUSES)[number];
export type IndustrialQuoteStatus = (typeof INDUSTRIAL_QUOTE_STATUSES)[number];
export type IndustrialRequirementType = (typeof INDUSTRIAL_REQUIREMENT_TYPES)[number];

const QUOTE_TRANSITIONS: Record<IndustrialQuoteStatus, readonly IndustrialQuoteStatus[]> = {
  draft: ["under_review", "ready_for_account_manager", "cancelled"],
  under_review: ["draft", "ready_for_account_manager", "cancelled"],
  ready_for_account_manager: ["draft", "under_review", "issued", "cancelled"],
  issued: ["accepted", "declined", "expired", "cancelled"],
  accepted: [],
  declined: ["draft", "under_review", "cancelled"],
  expired: ["draft", "under_review", "cancelled"],
  cancelled: [],
};

export function classificationForRequirementType(requirementType: IndustrialRequirementType) {
  if (requirementType === "custom_manufacturing") return "spare_part" as const;
  if (requirementType === "export_quotation") return "export_ready_factory_product" as const;
  return requirementType;
}

export function canTransitionIndustrialQuote(from: IndustrialQuoteStatus, to: IndustrialQuoteStatus) {
  return from === to || QUOTE_TRANSITIONS[from].includes(to);
}

export function isTerminalIndustrialQuoteStatus(status: IndustrialQuoteStatus) {
  return QUOTE_TRANSITIONS[status].length === 0;
}
