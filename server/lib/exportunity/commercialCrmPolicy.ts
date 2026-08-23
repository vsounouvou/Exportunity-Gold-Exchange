import type { CommercialIntentResult } from "../commercialIntentEngine";

export type CommercialCrmLeadStatus = "new" | "warm" | "qualified";

export interface CommercialCrmProjection {
  leadName: string;
  leadStatus: CommercialCrmLeadStatus;
  opportunityName: string;
  opportunityReferenceCode: string | null;
  shouldOpenOpportunity: boolean;
  value: null;
  currency: null;
}

function cleanLabel(value: unknown) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

export function projectCommercialCrmState(input: {
  commercial: CommercialIntentResult;
  contactName?: string | null;
  hasContact: boolean;
  requirementId?: string | null;
  requirementReferenceCode?: string | null;
}): CommercialCrmProjection {
  const productLabel =
    cleanLabel(input.commercial.product?.name) ||
    cleanLabel(input.commercial.product?.category) ||
    "trade request";
  const contactName = cleanLabel(input.contactName);
  const qualificationComplete =
    input.commercial.suggestedAction === "ACT" &&
    input.commercial.missingFields.length === 0 &&
    Boolean(input.requirementId);
  const shouldOpenOpportunity = qualificationComplete && input.hasContact;
  const leadStatus: CommercialCrmLeadStatus = shouldOpenOpportunity
    ? "qualified"
    : input.hasContact
      ? "warm"
      : "new";
  const requirementReferenceCode = cleanLabel(input.requirementReferenceCode)
    .replace(/[^A-Za-z0-9_-]/g, "")
    .slice(0, 90);

  return {
    leadName: contactName || `Buyer inquiry • ${productLabel}`,
    leadStatus,
    opportunityName: `Trade opportunity • ${productLabel}`,
    opportunityReferenceCode: requirementReferenceCode
      ? `OPP-${requirementReferenceCode}`
      : null,
    shouldOpenOpportunity,
    // A target unit price is not a total deal value. Keep both fields unknown
    // until a quote or explicit budget supplies authoritative values.
    value: null,
    currency: null,
  };
}
