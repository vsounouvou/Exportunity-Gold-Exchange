export const INDUSTRIAL_OUTREACH_CHANNELS = [
  "email",
  "phone",
  "whatsapp",
  "warm_introduction",
] as const;

export type IndustrialOutreachChannel =
  (typeof INDUSTRIAL_OUTREACH_CHANNELS)[number];

export const INDUSTRIAL_OUTREACH_BASES = [
  "public_b2b_relevance",
  "existing_business_relationship",
  "explicit_opt_in",
  "institutional_introduction",
] as const;

export type IndustrialOutreachBasis =
  (typeof INDUSTRIAL_OUTREACH_BASES)[number];

export type IndustrialContactReadinessInput = {
  contactName: string;
  contactRole: string;
  channel: IndustrialOutreachChannel;
  contactPoint: string;
  contactSourceUrl: string;
  businessReason: string;
  complianceBasis: IndustrialOutreachBasis;
  senderIdentity: string;
  senderVerified: boolean;
  approvalOwner: string;
  language: "fr" | "en";
  draftMessage: string;
  suppressionChecked: boolean;
  quietHoursChecked: boolean;
  whatsappOptInEvidence?: string | null;
};

export type IndustrialContactReadinessAssessment = {
  readyForHumanApproval: boolean;
  missing: string[];
  warnings: string[];
};

export type StoredIndustrialContactPlan = IndustrialContactReadinessInput & {
  readinessStatus: "ready_for_human_approval" | "needs_review";
  approvalStatus: "pending";
  outboundExecutionAllowed: false;
  savedByUserId: number | null;
  savedAt: string;
};

function hasLength(value: unknown, minimum: number) {
  return String(value || "").trim().length >= minimum;
}

function digitCount(value: unknown) {
  return String(value || "").replace(/\D/g, "").length;
}

export function assessIndustrialContactReadiness(
  input: IndustrialContactReadinessInput | null | undefined,
): IndustrialContactReadinessAssessment {
  const missing: string[] = [];
  const warnings: string[] = [];

  if (!input) {
    return {
      readyForHumanApproval: false,
      missing: ["contact dossier"],
      warnings,
    };
  }

  if (!hasLength(input.contactName, 2)) missing.push("contact name");
  if (!hasLength(input.contactRole, 2)) missing.push("contact role");
  if (!hasLength(input.contactPoint, 4)) missing.push("contact route");
  if (!/^https:\/\//i.test(String(input.contactSourceUrl || "").trim())) {
    missing.push("public contact source URL");
  }
  if (!hasLength(input.businessReason, 20)) {
    missing.push("company-specific business reason");
  }
  if (!hasLength(input.senderIdentity, 3)) {
    missing.push("sender identity");
  }
  if (!input.senderVerified) missing.push("verified sender confirmation");
  if (!hasLength(input.approvalOwner, 2)) missing.push("approval owner");
  if (!hasLength(input.draftMessage, 40)) missing.push("reviewable draft message");
  if (!input.suppressionChecked) missing.push("suppression-list check");
  if (!input.quietHoursChecked) missing.push("quiet-hours check");

  if (input.channel === "email") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.contactPoint.trim())) {
      missing.push("valid work email");
    }
  }

  if (input.channel === "phone" && digitCount(input.contactPoint) < 8) {
    missing.push("valid business telephone number");
  }

  if (input.channel === "whatsapp") {
    if (digitCount(input.contactPoint) < 8) {
      missing.push("valid WhatsApp number");
    }
    if (input.complianceBasis !== "explicit_opt_in") {
      missing.push("explicit WhatsApp opt-in basis");
    }
    if (!hasLength(input.whatsappOptInEvidence, 12)) {
      missing.push("WhatsApp opt-in evidence");
    }
  }

  if (
    input.channel === "warm_introduction" &&
    input.complianceBasis !== "institutional_introduction" &&
    input.complianceBasis !== "existing_business_relationship"
  ) {
    missing.push("introduction relationship basis");
  }

  if (
    input.channel !== "whatsapp" &&
    input.complianceBasis === "explicit_opt_in" &&
    !hasLength(input.whatsappOptInEvidence, 12)
  ) {
    warnings.push(
      "Explicit opt-in was selected without supporting evidence; compliance should review the basis.",
    );
  }

  return {
    readyForHumanApproval: missing.length === 0,
    missing: Array.from(new Set(missing)),
    warnings,
  };
}

export function storeIndustrialContactPlan(input: {
  plan: IndustrialContactReadinessInput;
  actorUserId: number | null;
  savedAt?: Date;
}): StoredIndustrialContactPlan {
  const assessment = assessIndustrialContactReadiness(input.plan);
  if (!assessment.readyForHumanApproval) {
    throw new Error(`contact_plan_incomplete:${assessment.missing.join("|")}`);
  }

  return {
    ...input.plan,
    contactName: input.plan.contactName.trim(),
    contactRole: input.plan.contactRole.trim(),
    contactPoint: input.plan.contactPoint.trim(),
    contactSourceUrl: input.plan.contactSourceUrl.trim(),
    businessReason: input.plan.businessReason.trim(),
    senderIdentity: input.plan.senderIdentity.trim(),
    approvalOwner: input.plan.approvalOwner.trim(),
    draftMessage: input.plan.draftMessage.trim(),
    whatsappOptInEvidence:
      String(input.plan.whatsappOptInEvidence || "").trim() || null,
    readinessStatus: "ready_for_human_approval",
    approvalStatus: "pending",
    outboundExecutionAllowed: false,
    savedByUserId: input.actorUserId,
    savedAt: (input.savedAt || new Date()).toISOString(),
  };
}

export function markIndustrialContactPlanForReview(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return {
    ...(value as Record<string, unknown>),
    readinessStatus: "needs_review",
    approvalStatus: "pending",
    outboundExecutionAllowed: false,
  };
}
