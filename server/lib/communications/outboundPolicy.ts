export const OUTBOUND_COMMUNICATION_POLICY_VERSION =
  "exportunity-outbound-communications-v1";

export const OUTBOUND_COMMUNICATION_DECISIONS = [
  "ALLOW_AUTO_SEND",
  "REQUIRE_APPROVAL",
  "BLOCK",
] as const;

export type OutboundCommunicationDecision =
  (typeof OUTBOUND_COMMUNICATION_DECISIONS)[number];

export type OutboundCommunicationChannel =
  | "email"
  | "sms"
  | "whatsapp"
  | "voice";

export type OutboundCommunicationPurpose =
  | "authentication"
  | "support_response"
  | "transactional_update"
  | "service_update"
  | "supplier_rfq"
  | "customer_offer"
  | "negotiation"
  | "relationship_follow_up"
  | "regulatory_alert"
  | "meeting_invite"
  | "marketing"
  | "unspecified";

export type OutboundContactBasis =
  | "explicit_opt_in"
  | "service_requested"
  | "existing_business_relationship"
  | "public_b2b_relevance"
  | "institutional_introduction"
  | "legal_obligation"
  | "unknown";

export type OutboundCommitmentRisk =
  | "none"
  | "commercial_discussion"
  | "pricing"
  | "payment"
  | "contractual"
  | "legal"
  | "regulatory"
  | "sanctions";

export type OutboundCommunicationPolicyInput = {
  tenantKey?: string | null;
  strictGovernance?: boolean;
  channel: OutboundCommunicationChannel;
  purpose?: OutboundCommunicationPurpose;
  contactBasis?: OutboundContactBasis;
  commitmentRisk?: OutboundCommitmentRisk;
  actorType?: "human" | "agent" | "system";
  executionRequested: boolean;
  approvalGranted?: boolean;
  autonomousLowRiskAuthorized?: boolean;
  externalCommunicationsEnabled: boolean;
  providerConfigured?: boolean;
  channelEnabled?: boolean;
  senderVerified?: boolean;
  recipientAddressPresent?: boolean;
  recipientVerified?: boolean;
  consentStatus?: "unknown" | "opt_in" | "opt_out";
  doNotContact?: boolean;
  suppressionChecked?: boolean;
  suppressed?: boolean;
  contactPreference?: "preferred" | "allowed" | "unknown" | "not_allowed";
  explicitOptInEvidence?: boolean;
  businessHoursKnown?: boolean;
  withinBusinessHours?: boolean;
  quietHoursExempt?: boolean;
  sentToday?: number;
  dailyLimit?: number | null;
  whatsappTemplateApproved?: boolean;
  whatsappSessionActive?: boolean;
};

export type OutboundCommunicationPolicyResult = {
  policyVersion: typeof OUTBOUND_COMMUNICATION_POLICY_VERSION;
  decision: OutboundCommunicationDecision;
  mayExecute: boolean;
  strictGovernance: boolean;
  channel: OutboundCommunicationChannel;
  purpose: OutboundCommunicationPurpose;
  reasons: string[];
  blockers: string[];
  requirements: string[];
  controls: {
    executionRequested: boolean;
    approvalGranted: boolean;
    externalCommunicationsEnabled: boolean;
    suppressionChecked: boolean;
    businessHoursKnown: boolean;
    withinBusinessHours: boolean;
    consentStatus: "unknown" | "opt_in" | "opt_out";
    contactBasis: OutboundContactBasis;
    commitmentRisk: OutboundCommitmentRisk;
  };
};

const HUMAN_REVIEW_PURPOSES = new Set<OutboundCommunicationPurpose>([
  "supplier_rfq",
  "customer_offer",
  "negotiation",
  "relationship_follow_up",
  "regulatory_alert",
  "meeting_invite",
  "marketing",
]);

const LOW_RISK_AUTONOMOUS_PURPOSES = new Set<OutboundCommunicationPurpose>([
  "authentication",
  "support_response",
  "transactional_update",
  "service_update",
]);

const HIGH_COMMITMENT_RISKS = new Set<OutboundCommitmentRisk>([
  "pricing",
  "payment",
  "contractual",
  "legal",
  "regulatory",
]);

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function normalizeTenantKey(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function positiveInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

export function evaluateOutboundCommunicationPolicy(
  input: OutboundCommunicationPolicyInput,
): OutboundCommunicationPolicyResult {
  const tenantKey = normalizeTenantKey(input.tenantKey);
  const strictGovernance =
    input.strictGovernance ?? tenantKey === "exportunity";
  const purpose = input.purpose || "unspecified";
  const contactBasis = input.contactBasis || "unknown";
  const commitmentRisk = input.commitmentRisk || "none";
  const consentStatus = input.consentStatus || "unknown";
  const contactPreference = input.contactPreference || "unknown";
  const approvalGranted = Boolean(input.approvalGranted);
  const executionRequested = Boolean(input.executionRequested);
  const blockers: string[] = [];
  const requirements: string[] = [];
  const reasons: string[] = [];

  const addExecutionGate = (code: string) => {
    if (executionRequested) blockers.push(code);
    else requirements.push(code);
  };

  if (!strictGovernance) {
    return {
      policyVersion: OUTBOUND_COMMUNICATION_POLICY_VERSION,
      decision: "ALLOW_AUTO_SEND",
      mayExecute: true,
      strictGovernance: false,
      channel: input.channel,
      purpose,
      reasons: ["tenant_uses_legacy_outbound_governance"],
      blockers: [],
      requirements: [],
      controls: {
        executionRequested,
        approvalGranted,
        externalCommunicationsEnabled: Boolean(
          input.externalCommunicationsEnabled,
        ),
        suppressionChecked: Boolean(input.suppressionChecked),
        businessHoursKnown: Boolean(input.businessHoursKnown),
        withinBusinessHours: Boolean(input.withinBusinessHours),
        consentStatus,
        contactBasis,
        commitmentRisk,
      },
    };
  }

  if (!input.recipientAddressPresent) blockers.push("recipient_address_missing");
  if (input.doNotContact) blockers.push("recipient_do_not_contact");
  if (consentStatus === "opt_out") blockers.push("recipient_opted_out");
  if (input.suppressed) blockers.push("recipient_suppressed");
  if (contactPreference === "not_allowed") {
    blockers.push("channel_not_allowed_by_recipient");
  }
  if (commitmentRisk === "sanctions") blockers.push("sanctions_risk");

  if (!input.externalCommunicationsEnabled) {
    addExecutionGate("external_communications_kill_switch_disabled");
  }
  if (input.providerConfigured === false) {
    addExecutionGate("provider_not_configured");
  }
  if (input.channelEnabled === false) addExecutionGate("channel_disabled");
  if (input.senderVerified === false) addExecutionGate("sender_not_verified");
  if (!input.suppressionChecked) addExecutionGate("suppression_check_required");

  const dailyLimit =
    input.dailyLimit == null ? null : positiveInteger(input.dailyLimit);
  const sentToday = positiveInteger(input.sentToday);
  if (dailyLimit != null && dailyLimit > 0 && sentToday >= dailyLimit) {
    addExecutionGate("daily_channel_quota_reached");
  }

  if (!input.quietHoursExempt) {
    if (!input.businessHoursKnown) {
      requirements.push("recipient_business_hours_require_review");
    } else if (!input.withinBusinessHours) {
      addExecutionGate("outside_recipient_business_hours");
    }
  }

  const hasExplicitConsent =
    consentStatus === "opt_in" || Boolean(input.explicitOptInEvidence);
  const hasRelationshipBasis =
    contactBasis === "service_requested" ||
    contactBasis === "existing_business_relationship";
  const hasReviewableEmailBasis =
    hasExplicitConsent ||
    hasRelationshipBasis ||
    contactBasis === "public_b2b_relevance" ||
    contactBasis === "institutional_introduction" ||
    contactBasis === "legal_obligation";

  if (purpose === "marketing" && !hasExplicitConsent) {
    blockers.push("marketing_requires_explicit_opt_in");
  }

  if (input.channel === "email") {
    if (!hasReviewableEmailBasis) {
      if (executionRequested) blockers.push("email_contact_basis_missing");
      else requirements.push("email_contact_basis_required");
    } else if (!hasExplicitConsent) {
      requirements.push("non_opt_in_email_requires_human_review");
    }
  }

  if (purpose === "supplier_rfq" && !input.recipientVerified) {
    if (executionRequested) blockers.push("supplier_recipient_not_verified");
    else requirements.push("verified_supplier_recipient_required");
  }

  if (input.channel === "sms" || input.channel === "whatsapp") {
    if (!hasExplicitConsent) {
      if (executionRequested) blockers.push("explicit_channel_opt_in_missing");
      else requirements.push("explicit_channel_opt_in_required");
    }
  }

  if (input.channel === "whatsapp") {
    const sessionOrTemplate =
      Boolean(input.whatsappSessionActive) ||
      Boolean(input.whatsappTemplateApproved);
    if (!sessionOrTemplate) {
      addExecutionGate("whatsapp_template_or_active_session_required");
    }
  }

  if (input.channel === "voice") {
    if (!hasExplicitConsent && !hasRelationshipBasis) {
      if (executionRequested) blockers.push("voice_contact_basis_missing");
      else requirements.push("voice_contact_basis_required");
    }
    if (!approvalGranted) requirements.push("voice_requires_human_approval");
  }

  if (HIGH_COMMITMENT_RISKS.has(commitmentRisk) && !approvalGranted) {
    requirements.push(`human_approval_required_for_${commitmentRisk}`);
  }
  if (HUMAN_REVIEW_PURPOSES.has(purpose) && !approvalGranted) {
    requirements.push(`human_approval_required_for_${purpose}`);
  }

  const eligibleForAutonomy =
    Boolean(input.autonomousLowRiskAuthorized) &&
    LOW_RISK_AUTONOMOUS_PURPOSES.has(purpose) &&
    commitmentRisk === "none" &&
    (hasExplicitConsent || hasRelationshipBasis) &&
    (input.actorType === "agent" || input.actorType === "system");

  if (!approvalGranted && !eligibleForAutonomy) {
    requirements.push("visible_human_approval_receipt_required");
  }

  const uniqueBlockers = unique(blockers);
  const uniqueRequirements = unique(requirements);
  let decision: OutboundCommunicationDecision;
  if (uniqueBlockers.length) decision = "BLOCK";
  else if (uniqueRequirements.length && !approvalGranted) {
    decision = "REQUIRE_APPROVAL";
  } else {
    decision = "ALLOW_AUTO_SEND";
  }

  if (decision === "BLOCK") reasons.push(...uniqueBlockers);
  else if (decision === "REQUIRE_APPROVAL") reasons.push(...uniqueRequirements);
  else if (approvalGranted) reasons.push("visible_human_approval_receipt_satisfied");
  else reasons.push("authorized_low_risk_communication");

  return {
    policyVersion: OUTBOUND_COMMUNICATION_POLICY_VERSION,
    decision,
    mayExecute: decision === "ALLOW_AUTO_SEND",
    strictGovernance,
    channel: input.channel,
    purpose,
    reasons: unique(reasons),
    blockers: uniqueBlockers,
    requirements: uniqueRequirements,
    controls: {
      executionRequested,
      approvalGranted,
      externalCommunicationsEnabled: Boolean(
        input.externalCommunicationsEnabled,
      ),
      suppressionChecked: Boolean(input.suppressionChecked),
      businessHoursKnown: Boolean(input.businessHoursKnown),
      withinBusinessHours: Boolean(input.withinBusinessHours),
      consentStatus,
      contactBasis,
      commitmentRisk,
    },
  };
}
