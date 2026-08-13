export type CompanyBrainEvidenceReview = {
  supportType?: string | null;
  sourceStatus?: string | null;
  securityStatus?: string | null;
  extractionStatus?: string | null;
  excerpt?: string | null;
  extractedText?: string | null;
  hasSubstantiveContent?: boolean;
};

export type CompanyBrainClaimReviewInput = {
  evidence: CompanyBrainEvidenceReview[];
  openConflictCount: number;
  claimStatus?: string | null;
  approvedWording?: string | null;
  pendingExternalApprovalCount?: number;
};

export type CompanyBrainClaimReview = {
  eligibleSupportingEvidenceCount: number;
  canVerifyInternal: boolean;
  canRequestExternalApproval: boolean;
  canApproveExternal: boolean;
  blockers: string[];
};

const ELIGIBLE_EXTRACTION_STATUSES = new Set(["extracted", "metadata_only", "manual"]);

/**
 * Evidence must be active, security-cleared, and actually support the claim.
 * Quarantined, review-required, deleted, and tombstoned source material never
 * enters an agent context pack or an external publication approval.
 */
export function isCompanyBrainEvidenceEligible(evidence: CompanyBrainEvidenceReview) {
  const supportType = String(evidence.supportType || "supports").toLowerCase();
  const sourceStatus = String(evidence.sourceStatus || "active").toLowerCase();
  const securityStatus = String(evidence.securityStatus || "pending").toLowerCase();
  const extractionStatus = String(evidence.extractionStatus || "pending").toLowerCase();
  const hasSubstantiveContent =
    evidence.hasSubstantiveContent === true ||
    Boolean(String(evidence.excerpt || evidence.extractedText || "").trim());
  return (
    supportType === "supports" &&
    sourceStatus === "active" &&
    securityStatus === "clean" &&
    ELIGIBLE_EXTRACTION_STATUSES.has(extractionStatus) &&
    hasSubstantiveContent
  );
}

export function evaluateCompanyBrainClaimReview(
  input: CompanyBrainClaimReviewInput,
): CompanyBrainClaimReview {
  const eligibleSupportingEvidenceCount = input.evidence.filter(isCompanyBrainEvidenceEligible).length;
  const blockers: string[] = [];
  if (eligibleSupportingEvidenceCount < 1) blockers.push("clean_supporting_evidence_required");
  if (input.openConflictCount > 0) blockers.push("open_conflicts_must_be_resolved");

  const baseReady = blockers.length === 0;
  const claimStatus = String(input.claimStatus || "proposed").toLowerCase();
  const internallyVerified = new Set(["verified", "verified_internal_only", "approved_external"]).has(claimStatus);
  const hasApprovedWording = Boolean(String(input.approvedWording || "").trim());
  const hasPendingExternalApproval = Number(input.pendingExternalApprovalCount || 0) > 0;

  return {
    eligibleSupportingEvidenceCount,
    canVerifyInternal: baseReady,
    canRequestExternalApproval: baseReady && internallyVerified,
    canApproveExternal: baseReady && internallyVerified && hasApprovedWording && hasPendingExternalApproval,
    blockers: [
      ...blockers,
      ...(!internallyVerified ? ["internal_verification_required"] : []),
      ...(!hasApprovedWording ? ["approved_external_wording_required"] : []),
      ...(!hasPendingExternalApproval ? ["pending_human_approval_required"] : []),
    ],
  };
}
