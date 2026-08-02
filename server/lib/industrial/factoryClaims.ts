export const INDUSTRIAL_FACTORY_CLAIM_STATUSES = [
  "submitted",
  "under_review",
  "approved",
  "rejected",
  "cancelled",
] as const;

export type IndustrialFactoryClaimStatus = (typeof INDUSTRIAL_FACTORY_CLAIM_STATUSES)[number];
export type IndustrialFactoryClaimReviewAction = "approve" | "request_information" | "reject";

export function canReviewFactoryClaim(status: IndustrialFactoryClaimStatus, action: IndustrialFactoryClaimReviewAction) {
  if (status !== "submitted" && status !== "under_review") return false;
  return action === "approve" || action === "request_information" || action === "reject";
}

export function nextFactoryClaimStatus(action: IndustrialFactoryClaimReviewAction): IndustrialFactoryClaimStatus {
  if (action === "approve") return "approved";
  if (action === "request_information") return "under_review";
  return "rejected";
}

export function canCancelFactoryClaim(status: IndustrialFactoryClaimStatus) {
  return status === "submitted" || status === "under_review";
}
