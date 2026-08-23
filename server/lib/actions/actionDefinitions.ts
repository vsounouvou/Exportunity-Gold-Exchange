import { db } from "@db";
import { actionDefinitions } from "@db/schema";
import { and, eq } from "drizzle-orm";
import { ACTIONS_REGISTRY, type ActionRegistryEntry } from "./actionRegistry";

type ActionDefinitionTemplate = {
  actionKey: string;
  name: string;
  description: string;
  category: string;
  schema: Record<string, unknown>;
  defaultAssigneeRole?: string | null;
  metadata?: Record<string, unknown>;
};

const DEFAULT_ASSIGNEE_ROLE = "CHAIRMAN_ASSISTANT";

function normalizeActionKey(value: string) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function toTitleCase(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

const REQUIRED_ACTION_TEMPLATES: ActionDefinitionTemplate[] = [
  {
    actionKey: "NAVIGATE_OPEN_PAGE",
    name: "Navigate Open Page",
    description: "Open a page or route in the app.",
    category: "NAVIGATION",
    defaultAssigneeRole: DEFAULT_ASSIGNEE_ROLE,
    schema: {
      type: "object",
      required: ["path"],
      properties: {
        path: { type: "string" },
        label: { type: "string" },
        newTab: { type: "boolean" },
      },
    },
  },
  {
    actionKey: "AGENT_ASK",
    name: "Agent Ask",
    description: "Ask an agent to investigate or respond.",
    category: "EXECUTION",
    defaultAssigneeRole: DEFAULT_ASSIGNEE_ROLE,
    schema: {
      type: "object",
      required: ["question"],
      properties: {
        agentId: { type: "number" },
        question: { type: "string" },
        context: { type: "string" },
      },
    },
  },
  {
    actionKey: "OBJECTIVE_CREATE",
    name: "Objective Create",
    description: "Create a new objective.",
    category: "CREATION",
    defaultAssigneeRole: DEFAULT_ASSIGNEE_ROLE,
    schema: {
      type: "object",
      required: ["companyId", "title"],
      properties: {
        companyId: { type: "number" },
        title: { type: "string" },
        description: { type: "string" },
        ownerAgentId: { type: "number" },
        deadline: { type: "string" },
        priority: { type: "string" },
      },
    },
  },
  {
    actionKey: "REMINDER_CREATE",
    name: "Reminder Create",
    description: "Create a reminder.",
    category: "CREATION",
    defaultAssigneeRole: DEFAULT_ASSIGNEE_ROLE,
    schema: {
      type: "object",
      required: ["message"],
      properties: {
        message: { type: "string" },
        dueAt: { type: "string" },
      },
    },
  },
  {
    actionKey: "DAILY_BRIEFING_GENERATE",
    name: "Daily Briefing Generate",
    description: "Generate a daily briefing.",
    category: "EXECUTION",
    defaultAssigneeRole: DEFAULT_ASSIGNEE_ROLE,
    schema: {
      type: "object",
      required: [],
      properties: {
        date: { type: "string" },
        focus: { type: "string" },
      },
    },
  },
  {
    actionKey: "TERRITORY_ACTIVATION_PREPARE",
    name: "Prepare Territory Activation",
    description: "Prepare a neighborhood operating profile, evidence gaps, team plan, and paused work package.",
    category: "TERRITORY_OPERATIONS",
    defaultAssigneeRole: "CHAIRMAN_ASSISTANT",
    schema: {
      type: "object",
      required: ["territoryId", "idempotencyKey"],
      properties: {
        territoryId: { type: "number" },
        idempotencyKey: { type: "string" },
        operatingMode: { type: "string" },
      },
    },
    metadata: {
      stableKey: "territory.activation.prepare",
      riskClass: "medium",
      autonomyPolicy: "approval_required",
      sideEffects: ["database_mutation", "paused_task_creation"],
      externalSideEffects: false,
      budgetEffect: "none_until_approved",
      evidenceRequired: true,
    },
  },
  {
    actionKey: "TERRITORY_ACTIVATE",
    name: "Activate Territory",
    description: "Activate an evidence-backed neighborhood operating profile after accountable approval.",
    category: "TERRITORY_OPERATIONS",
    defaultAssigneeRole: "CHAIRMAN_ASSISTANT",
    schema: {
      type: "object",
      required: ["territoryId", "activationId"],
      properties: {
        territoryId: { type: "number" },
        activationId: { type: "number" },
      },
    },
    metadata: {
      stableKey: "territory.activate",
      riskClass: "high",
      autonomyPolicy: "approval_required",
      sideEffects: ["database_mutation", "operational_state_transition"],
      externalSideEffects: false,
      budgetEffect: "bounded_by_existing_territory_budget",
      evidenceRequired: true,
    },
  },
  {
    actionKey: "TERRITORY_SCORECARD_RECORD",
    name: "Record Territory Scorecard Evidence",
    description: "Record a credential-free, evidence-backed monthly media-to-commerce scorecard in the canonical territory KPI row.",
    category: "TERRITORY_OPERATIONS",
    defaultAssigneeRole: "CHAIRMAN_ASSISTANT",
    schema: {
      type: "object",
      required: ["territoryId", "month", "metricKeys", "evidenceStatus", "confirmed"],
      properties: {
        territoryId: { type: "number" },
        month: { type: "string" },
        metricKeys: { type: "array" },
        evidenceStatus: { type: "string" },
        confirmed: { type: "boolean" },
      },
    },
    metadata: {
      stableKey: "territory.scorecard.record",
      riskClass: "medium",
      autonomyPolicy: "approval_required",
      sideEffects: ["database_mutation", "scorecard_evidence_update"],
      externalSideEffects: false,
      backgroundExecution: false,
      budgetEffect: "none",
      evidenceRequired: true,
    },
  },
  {
    actionKey: "COMMERCE_ATTRIBUTION_RECONCILE",
    name: "Reconcile Canonical Fulfilled-Commerce Attribution",
    description:
      "Bind one completed industrial order, its exact succeeded payment and delivered fulfillment plan to one verified, rights-cleared media touchpoint.",
    category: "ADVERTISING_GOVERNANCE",
    defaultAssigneeRole: "CHAIRMAN_ASSISTANT",
    schema: {
      type: "object",
      required: [
        "orderId",
        "paymentId",
        "fulfillmentPlanId",
        "sourceKind",
        "territoryId",
        "confirmed",
      ],
      properties: {
        orderId: { type: "string" },
        paymentId: { type: "string" },
        fulfillmentPlanId: { type: "string" },
        sourceKind: { type: "string" },
        campaignId: { type: "string" },
        creativeId: { type: "string" },
        publicationAttemptId: { type: "string" },
        territoryId: { type: "number" },
        confirmed: { type: "boolean" },
      },
    },
    metadata: {
      stableKey: "commerce.attribution.reconcile",
      riskClass: "high",
      autonomyPolicy: "human_approval_required",
      sideEffects: ["database_mutation", "canonical_conversion_binding", "territory_attribution_update"],
      externalSideEffects: false,
      externalSpendPerformed: false,
      externalPublicationPerformed: false,
      backgroundExecution: false,
      credentialsStored: false,
      evidenceRequired: true,
    },
  },
  {
    actionKey: "RIGHTS_GRANT",
    name: "Grant Media Rights",
    description: "Record an accountable, evidenced media usage grant for a source content reference.",
    category: "MEDIA_RIGHTS",
    defaultAssigneeRole: "CHAIRMAN_ASSISTANT",
    schema: {
      type: "object",
      required: ["mediaItemId", "rightsHolderName", "rightsBasis"],
      properties: {
        mediaItemId: { type: "string" },
        rightsHolderName: { type: "string" },
        rightsBasis: { type: "string" },
      },
    },
    metadata: {
      stableKey: "rights.grant",
      riskClass: "high",
      autonomyPolicy: "approval_required",
      sideEffects: ["database_mutation", "publication_eligibility_change"],
      externalSideEffects: false,
      evidenceRequired: true,
    },
  },
  {
    actionKey: "RIGHTS_REVOKE",
    name: "Revoke Media Rights",
    description: "Revoke a media usage grant and immediately block future publication attempts.",
    category: "MEDIA_RIGHTS",
    defaultAssigneeRole: "CHAIRMAN_ASSISTANT",
    schema: {
      type: "object",
      required: ["mediaItemId", "grantId", "reason"],
      properties: {
        mediaItemId: { type: "string" },
        grantId: { type: "number" },
        reason: { type: "string" },
      },
    },
    metadata: {
      stableKey: "rights.revoke",
      riskClass: "high",
      autonomyPolicy: "approval_required",
      sideEffects: ["database_mutation", "publication_eligibility_change"],
      externalSideEffects: false,
      evidenceRequired: true,
    },
  },
  {
    actionKey: "RIGHTS_TAKEDOWN",
    name: "Update Source Takedown State",
    description: "Update source content takedown/restriction state for governed media reuse and publication eligibility.",
    category: "MEDIA_RIGHTS",
    defaultAssigneeRole: "CHAIRMAN_ASSISTANT",
    schema: {
      type: "object",
      required: ["mediaItemId", "action"],
      properties: {
        mediaItemId: { type: "string" },
        action: { type: "string" },
        reason: { type: "string" },
        evidence: { type: "object" },
      },
    },
    metadata: {
      stableKey: "rights.takedown",
      riskClass: "high",
      autonomyPolicy: "approval_required",
      sideEffects: ["database_mutation", "publication_eligibility_change"],
      externalSideEffects: false,
      evidenceRequired: true,
    },
  },
  {
    actionKey: "CONTENT_PUBLISH",
    name: "Publish Content",
    description: "Move a CMS media item to published only after the rights and consent gate passes.",
    category: "MEDIA_PUBLICATION",
    defaultAssigneeRole: "CHAIRMAN_ASSISTANT",
    schema: {
      type: "object",
      required: ["mediaItemId", "channel", "usageType"],
      properties: {
        mediaItemId: { type: "string" },
        channel: { type: "string" },
        usageType: { type: "string" },
      },
    },
    metadata: {
      stableKey: "content.publish",
      riskClass: "high",
      autonomyPolicy: "approval_required",
      sideEffects: ["database_mutation", "public_visibility_change"],
      externalSideEffects: false,
      evidenceRequired: true,
    },
  },
  {
    actionKey: "SOCIAL_PUBLICATION_PREPARE",
    name: "Prepare Social Publication",
    description: "Prepare a rights-cleared provider handoff or manual publication package without claiming external publication.",
    category: "MEDIA_PUBLICATION",
    defaultAssigneeRole: "CHAIRMAN_ASSISTANT",
    schema: {
      type: "object",
      required: ["mediaItemId", "platform", "idempotencyKey", "confirmed"],
      properties: {
        mediaItemId: { type: "string" },
        platform: { type: "string" },
        channel: { type: "string" },
        territoryId: { type: "number" },
        idempotencyKey: { type: "string" },
        confirmed: { type: "boolean" },
      },
    },
    metadata: {
      stableKey: "content.social_publication.prepare",
      riskClass: "medium",
      autonomyPolicy: "approval_required",
      sideEffects: ["database_mutation", "manual_handoff_package_creation"],
      externalSideEffects: false,
      publicationClaimed: false,
      evidenceRequired: true,
    },
  },
  {
    actionKey: "SOCIAL_PUBLICATION_EXECUTE",
    name: "Execute Confirmed Meta Social Publication",
    description:
      "Execute one explicitly confirmed, rights-cleared Facebook Page or Instagram professional-account publication and retain the provider receipt.",
    category: "MEDIA_PUBLICATION",
    defaultAssigneeRole: "CHAIRMAN_ASSISTANT",
    schema: {
      type: "object",
      required: ["mediaItemId", "platform", "targetId", "integrationConnectionId", "confirmed"],
      properties: {
        mediaItemId: { type: "string" },
        platform: { type: "string" },
        targetId: { type: "number" },
        integrationConnectionId: { type: "string" },
        requestChecksum: { type: "string" },
        attemptId: { type: "string" },
        operation: { type: "string" },
        confirmed: { type: "boolean" },
      },
    },
    metadata: {
      stableKey: "content.social_publication.execute",
      riskClass: "high",
      autonomyPolicy: "action_time_human_confirmation_required",
      sideEffects: ["provider_mutation", "external_publication", "database_mutation"],
      externalSideEffects: true,
      externalPublicationPotential: true,
      advertisingSpendPerformed: false,
      outboundMessagePerformed: false,
      automaticRetry: false,
      backgroundExecution: false,
      credentialsStoredInAction: false,
      evidenceRequired: true,
    },
  },
  {
    actionKey: "SOCIAL_TARGET_DISCOVER",
    name: "Discover Social Publication Targets",
    description: "Read the authorized provider account catalogue and record non-secret target candidates without provider mutation or publication.",
    category: "MEDIA_PUBLICATION",
    defaultAssigneeRole: "CHAIRMAN_ASSISTANT",
    schema: {
      type: "object",
      required: ["connectionId", "platform", "confirmed"],
      properties: {
        connectionId: { type: "string" },
        platform: { type: "string" },
        confirmed: { type: "boolean" },
      },
    },
    metadata: {
      stableKey: "content.social_target.discover",
      riskClass: "medium",
      autonomyPolicy: "approval_required",
      sideEffects: ["provider_read", "action_evidence_creation"],
      externalSideEffects: false,
      providerReadPerformed: true,
      providerMutationPerformed: false,
      credentialsStoredInAction: false,
      externalPublicationPerformed: false,
      evidenceRequired: true,
    },
  },
  {
    actionKey: "SOCIAL_TARGET_SELECT",
    name: "Select Verified Social Publication Target",
    description: "Select a target from a successful discovery receipt and store its non-secret tenant binding without provider mutation or publication.",
    category: "MEDIA_PUBLICATION",
    defaultAssigneeRole: "CHAIRMAN_ASSISTANT",
    schema: {
      type: "object",
      required: [
        "discoveryActionRunId",
        "candidateKey",
        "authorityReference",
        "confirmed",
      ],
      properties: {
        discoveryActionRunId: { type: "number" },
        candidateKey: { type: "string" },
        authorityReference: { type: "string" },
        confirmed: { type: "boolean" },
      },
    },
    metadata: {
      stableKey: "content.social_target.select",
      riskClass: "medium",
      autonomyPolicy: "human_approval_required",
      sideEffects: ["database_mutation", "internal_target_binding"],
      externalSideEffects: false,
      providerReadPerformed: false,
      providerMutationPerformed: false,
      credentialsStoredInAction: false,
      externalPublicationPerformed: false,
      evidenceRequired: true,
    },
  },
  {
    actionKey: "AD_ACCOUNT_VERIFICATION_RECORD",
    name: "Record Advertising Account Verification",
    description: "Record non-secret provider evidence for tenant business and billing ownership, permissions, health, and restrictions.",
    category: "ADVERTISING_GOVERNANCE",
    defaultAssigneeRole: "CHAIRMAN_ASSISTANT",
    schema: {
      type: "object",
      required: ["provider", "platform", "externalAdAccountId", "confirmed"],
      properties: {
        provider: { type: "string" },
        platform: { type: "string" },
        externalAdAccountId: { type: "string" },
        confirmed: { type: "boolean" },
      },
    },
    metadata: {
      stableKey: "advertising.account_verification.record",
      riskClass: "high",
      autonomyPolicy: "human_approval_required",
      sideEffects: ["database_mutation", "account_readiness_change"],
      externalSideEffects: false,
      credentialsStored: false,
      evidenceRequired: true,
    },
  },
  {
    actionKey: "AD_BUDGET_ENVELOPE_PREPARE",
    name: "Prepare Advertising Budget Envelope",
    description: "Prepare a bounded, hierarchical advertising budget envelope without approving or spending funds.",
    category: "ADVERTISING_GOVERNANCE",
    defaultAssigneeRole: "CHAIRMAN_ASSISTANT",
    schema: {
      type: "object",
      required: ["idempotencyKey", "scopeType", "currencyCode", "totalCapMinor", "confirmed"],
      properties: {
        idempotencyKey: { type: "string" },
        scopeType: { type: "string" },
        currencyCode: { type: "string" },
        totalCapMinor: { type: "number" },
        confirmed: { type: "boolean" },
      },
    },
    metadata: {
      stableKey: "advertising.budget_envelope.prepare",
      riskClass: "high",
      autonomyPolicy: "approval_required",
      sideEffects: ["database_mutation", "budget_envelope_draft"],
      externalSideEffects: false,
      spendAuthorized: false,
      evidenceRequired: true,
    },
  },
  {
    actionKey: "AD_BUDGET_ENVELOPE_APPROVE",
    name: "Approve Advertising Budget Envelope",
    description: "Activate an internal advertising budget boundary after accountable approval; no provider spend occurs.",
    category: "ADVERTISING_GOVERNANCE",
    defaultAssigneeRole: "CHAIRMAN_ASSISTANT",
    schema: {
      type: "object",
      required: ["envelopeId", "confirmed", "authorityReference"],
      properties: {
        envelopeId: { type: "string" },
        confirmed: { type: "boolean" },
        authorityReference: { type: "string" },
      },
    },
    metadata: {
      stableKey: "advertising.budget_envelope.approve",
      riskClass: "high",
      autonomyPolicy: "human_approval_required",
      sideEffects: ["database_mutation", "internal_budget_authority_change"],
      externalSideEffects: false,
      spendAuthorized: false,
      evidenceRequired: true,
    },
  },
  {
    actionKey: "AD_MEDIA_PLAN_PREPARE",
    name: "Prepare Advertising Media Plan",
    description: "Evaluate every pre-spend gate and prepare a campaign record without provider submission.",
    category: "ADVERTISING_GOVERNANCE",
    defaultAssigneeRole: "CHAIRMAN_ASSISTANT",
    schema: {
      type: "object",
      required: ["idempotencyKey", "envelopeId", "territoryId", "mediaItemId", "confirmed"],
      properties: {
        idempotencyKey: { type: "string" },
        envelopeId: { type: "string" },
        territoryId: { type: "number" },
        mediaItemId: { type: "string" },
        confirmed: { type: "boolean" },
      },
    },
    metadata: {
      stableKey: "advertising.media_plan.prepare",
      riskClass: "high",
      autonomyPolicy: "approval_required",
      sideEffects: ["database_mutation", "campaign_draft", "creative_draft"],
      externalSideEffects: false,
      campaignCreatedExternally: false,
      spendAuthorized: false,
      evidenceRequired: true,
    },
  },
  {
    actionKey: "AD_MEDIA_PLAN_APPROVE",
    name: "Approve Advertising Media Plan",
    description: "Approve a blocker-free media plan and creative internally without provider submission or spend.",
    category: "ADVERTISING_GOVERNANCE",
    defaultAssigneeRole: "CHAIRMAN_ASSISTANT",
    schema: {
      type: "object",
      required: ["mediaPlanId", "confirmed", "factsStillCurrent", "creativeApproved"],
      properties: {
        mediaPlanId: { type: "string" },
        confirmed: { type: "boolean" },
        factsStillCurrent: { type: "boolean" },
        creativeApproved: { type: "boolean" },
      },
    },
    metadata: {
      stableKey: "advertising.media_plan.approve",
      riskClass: "high",
      autonomyPolicy: "human_approval_required",
      sideEffects: ["database_mutation", "internal_plan_approval"],
      externalSideEffects: false,
      campaignCreatedExternally: false,
      spendAuthorized: false,
      evidenceRequired: true,
    },
  },
  {
    actionKey: "AD_SPEND_AUTHORIZATION_PREPARE",
    name: "Prepare Advertising Spend Authorization",
    description: "Prepare a bounded spend-authorization request without granting provider authority or spending funds.",
    category: "ADVERTISING_GOVERNANCE",
    defaultAssigneeRole: "CHAIRMAN_ASSISTANT",
    schema: {
      type: "object",
      required: ["idempotencyKey", "mediaPlanId", "campaignId", "amountMinor", "confirmed"],
      properties: {
        idempotencyKey: { type: "string" },
        mediaPlanId: { type: "string" },
        campaignId: { type: "string" },
        amountMinor: { type: "number" },
        confirmed: { type: "boolean" },
      },
    },
    metadata: {
      stableKey: "advertising.spend_authorization.prepare",
      riskClass: "high",
      autonomyPolicy: "approval_required",
      sideEffects: ["database_mutation", "spend_authorization_request"],
      externalSideEffects: false,
      spendAuthorized: false,
      evidenceRequired: true,
    },
  },
  {
    actionKey: "AD_SPEND_AUTHORIZATION_APPROVE",
    name: "Approve Advertising Spend Authorization",
    description: "Reserve an approved internal envelope amount; provider submission and spend remain separate and disabled.",
    category: "ADVERTISING_GOVERNANCE",
    defaultAssigneeRole: "CHAIRMAN_ASSISTANT",
    schema: {
      type: "object",
      required: ["authorizationId", "confirmed", "approvalReference"],
      properties: {
        authorizationId: { type: "string" },
        confirmed: { type: "boolean" },
        approvalReference: { type: "string" },
      },
    },
    metadata: {
      stableKey: "advertising.spend_authorization.approve",
      riskClass: "critical",
      autonomyPolicy: "human_approval_required",
      sideEffects: ["database_mutation", "internal_budget_reservation"],
      externalSideEffects: false,
      providerSubmissionRequiredSeparately: true,
      externalSpendPerformed: false,
      evidenceRequired: true,
    },
  },
  {
    actionKey: "CARRIER_PROFILE_RECORD",
    name: "Record Carrier Candidate",
    description:
      "Record a source-backed carrier candidate without claiming verification, partnership, or external contact.",
    category: "LOGISTICS_GOVERNANCE",
    defaultAssigneeRole: "CHAIRMAN_ASSISTANT",
    schema: {
      type: "object",
      required: ["referenceCode", "legalName", "confirmed"],
      properties: {
        referenceCode: { type: "string" },
        legalName: { type: "string" },
        confirmed: { type: "boolean" },
      },
    },
    metadata: {
      stableKey: "carrier.profile.record",
      riskClass: "medium",
      autonomyPolicy: "approval_required",
      sideEffects: ["database_mutation", "candidate_registry_record"],
      externalSideEffects: false,
      partnerClaimCreated: false,
      evidenceRequired: true,
    },
  },
  {
    actionKey: "CARRIER_PROFILE_VERIFY",
    name: "Verify Carrier Profile",
    description:
      "Promote a carrier only from explicit source, document, contract, and accountable human evidence.",
    category: "LOGISTICS_GOVERNANCE",
    defaultAssigneeRole: "CHAIRMAN_ASSISTANT",
    schema: {
      type: "object",
      required: ["carrierProfileId", "verificationStatus", "partnershipStatus", "confirmed"],
      properties: {
        carrierProfileId: { type: "string" },
        verificationStatus: { type: "string" },
        partnershipStatus: { type: "string" },
        confirmed: { type: "boolean" },
      },
    },
    metadata: {
      stableKey: "carrier.profile.verify",
      riskClass: "high",
      autonomyPolicy: "human_approval_required",
      sideEffects: ["database_mutation", "carrier_verification_state"],
      externalSideEffects: false,
      evidenceRequired: true,
    },
  },
  {
    actionKey: "CARRIER_COVERAGE_RECORD",
    name: "Record Carrier Coverage",
    description:
      "Record an evidence-backed origin, destination, mode, capability, and validity coverage claim.",
    category: "LOGISTICS_GOVERNANCE",
    defaultAssigneeRole: "CHAIRMAN_ASSISTANT",
    schema: {
      type: "object",
      required: ["carrierProfileId", "idempotencyKey", "serviceType", "status"],
      properties: {
        carrierProfileId: { type: "string" },
        idempotencyKey: { type: "string" },
        serviceType: { type: "string" },
        status: { type: "string" },
      },
    },
    metadata: {
      stableKey: "carrier.coverage.record",
      riskClass: "high",
      autonomyPolicy: "approval_required",
      sideEffects: ["database_mutation", "carrier_coverage_record"],
      externalSideEffects: false,
      serviceabilityConfirmedExternally: false,
      evidenceRequired: true,
    },
  },
  {
    actionKey: "CARRIER_CONNECTION_VERIFY",
    name: "Verify Carrier Adapter Connection",
    description:
      "Record non-secret account, capability, callback, restriction, and credential-reference evidence.",
    category: "LOGISTICS_GOVERNANCE",
    defaultAssigneeRole: "CHAIRMAN_ASSISTANT",
    schema: {
      type: "object",
      required: ["carrierProfileId", "provider", "environment", "confirmed"],
      properties: {
        carrierProfileId: { type: "string" },
        provider: { type: "string" },
        environment: { type: "string" },
        confirmed: { type: "boolean" },
      },
    },
    metadata: {
      stableKey: "carrier.connection.verify",
      riskClass: "critical",
      autonomyPolicy: "human_approval_required",
      sideEffects: ["database_mutation", "adapter_readiness_record"],
      externalSideEffects: false,
      credentialsStoredInAction: false,
      evidenceRequired: true,
    },
  },
  {
    actionKey: "DELIVERY_QUOTE_PREPARE",
    name: "Prepare Delivery Quote Request",
    description:
      "Prepare an exact carrier quote request and coverage matches without contacting a provider.",
    category: "LOGISTICS_GOVERNANCE",
    defaultAssigneeRole: "CHAIRMAN_ASSISTANT",
    schema: {
      type: "object",
      required: ["industrialOrderId", "idempotencyKey", "serviceType", "confirmed"],
      properties: {
        industrialOrderId: { type: "string" },
        idempotencyKey: { type: "string" },
        serviceType: { type: "string" },
        confirmed: { type: "boolean" },
      },
    },
    metadata: {
      stableKey: "delivery.quote.prepare",
      riskClass: "medium",
      autonomyPolicy: "approval_required",
      sideEffects: ["database_mutation", "quote_request_preparation"],
      externalSideEffects: false,
      providerRequestExecuted: false,
      evidenceRequired: true,
    },
  },
  {
    actionKey: "DELIVERY_QUOTE_RECORD",
    name: "Record Verified Delivery Quote",
    description:
      "Convert a provider or human source receipt into a structured verified carrier quote without booking.",
    category: "LOGISTICS_GOVERNANCE",
    defaultAssigneeRole: "CHAIRMAN_ASSISTANT",
    schema: {
      type: "object",
      required: ["quoteRequestId", "carrierProfileId", "idempotencyKey", "confirmed"],
      properties: {
        quoteRequestId: { type: "string" },
        carrierProfileId: { type: "string" },
        idempotencyKey: { type: "string" },
        confirmed: { type: "boolean" },
      },
    },
    metadata: {
      stableKey: "delivery.quote.record",
      riskClass: "high",
      autonomyPolicy: "human_approval_required",
      sideEffects: ["database_mutation", "verified_quote_record"],
      externalSideEffects: false,
      bookingCreatedExternally: false,
      evidenceRequired: true,
    },
  },
  {
    actionKey: "DELIVERY_BOOK_PREPARE",
    name: "Prepare Carrier Booking",
    description:
      "Select a verified, current carrier quote and prepare an approval record without booking the carrier.",
    category: "LOGISTICS_GOVERNANCE",
    defaultAssigneeRole: "CHAIRMAN_ASSISTANT",
    schema: {
      type: "object",
      required: ["deliveryQuoteId", "idempotencyKey", "confirmed"],
      properties: {
        deliveryQuoteId: { type: "string" },
        idempotencyKey: { type: "string" },
        confirmed: { type: "boolean" },
      },
    },
    metadata: {
      stableKey: "delivery.book.prepare",
      riskClass: "high",
      autonomyPolicy: "human_approval_required",
      sideEffects: ["database_mutation", "booking_authorization_request"],
      externalSideEffects: false,
      externalBookingExecuted: false,
      evidenceRequired: true,
    },
  },
  {
    actionKey: "DELIVERY_BOOK_AUTHORIZE",
    name: "Authorize Carrier Booking Submission",
    description:
      "Approve an exact paid-order carrier booking for separate official-adapter submission; do not submit it.",
    category: "LOGISTICS_GOVERNANCE",
    defaultAssigneeRole: "CHAIRMAN_ASSISTANT",
    schema: {
      type: "object",
      required: ["bookingAuthorizationId", "approvalReference", "confirmed"],
      properties: {
        bookingAuthorizationId: { type: "string" },
        approvalReference: { type: "string" },
        confirmed: { type: "boolean" },
      },
    },
    metadata: {
      stableKey: "delivery.book.authorize",
      riskClass: "critical",
      autonomyPolicy: "human_approval_required",
      sideEffects: ["database_mutation", "internal_booking_authority"],
      externalSideEffects: false,
      providerSubmissionRequiredSeparately: true,
      externalBookingExecuted: false,
      providerBookingConfirmed: false,
      evidenceRequired: true,
    },
  },
  {
    actionKey: "GROUP_BUYING_CAMPAIGN_PREPARE",
    name: "Prepare Group-Purchase Campaign",
    description:
      "Prepare an evidence-backed product preorder or group-purchase campaign without collecting payment or creating an investment instrument.",
    category: "GROUP_COMMERCE_GOVERNANCE",
    defaultAssigneeRole: "CHAIRMAN_ASSISTANT",
    schema: {
      type: "object",
      required: ["referenceCode", "campaignType", "catalogItemId", "producerFactoryId", "territoryId"],
      properties: {
        referenceCode: { type: "string" },
        campaignType: { type: "string" },
        catalogItemId: { type: "string" },
        producerFactoryId: { type: "string" },
        territoryId: { type: "number" },
      },
    },
    metadata: {
      stableKey: "group_buying.campaign.prepare",
      riskClass: "high",
      autonomyPolicy: "human_approval_required",
      sideEffects: ["database_mutation", "campaign_preparation"],
      externalSideEffects: false,
      externalPaymentCollectionExecuted: false,
      regulatedCapitalEnabled: false,
      evidenceRequired: true,
    },
  },
  {
    actionKey: "GROUP_BUYING_CAMPAIGN_AUTHORIZE",
    name: "Authorize Group-Purchase Campaign",
    description:
      "Authorize a verified product-commerce campaign for non-binding interest; do not collect funds or offer securities.",
    category: "GROUP_COMMERCE_GOVERNANCE",
    defaultAssigneeRole: "CHAIRMAN_ASSISTANT",
    schema: {
      type: "object",
      required: ["campaignId", "rationale"],
      properties: {
        campaignId: { type: "string" },
        rationale: { type: "string" },
      },
    },
    metadata: {
      stableKey: "group_buying.campaign.authorize",
      riskClass: "high",
      autonomyPolicy: "human_approval_required",
      sideEffects: ["database_mutation", "public_campaign_state"],
      externalSideEffects: false,
      externalPaymentCollectionExecuted: false,
      regulatedCapitalEnabled: false,
      evidenceRequired: true,
    },
  },
  {
    actionKey: "GROUP_BUYING_INTEREST_RECORD",
    name: "Record Non-Binding Buying Interest",
    description:
      "Record buyer interest at a verified price tier without charging, reserving inventory, or creating a binding order.",
    category: "GROUP_COMMERCE_GOVERNANCE",
    defaultAssigneeRole: "CHAIRMAN_ASSISTANT",
    schema: {
      type: "object",
      required: ["campaignId", "quantity", "deliveryOptionId"],
      properties: {
        campaignId: { type: "string" },
        quantity: { type: "number" },
        deliveryOptionId: { type: "string" },
      },
    },
    metadata: {
      stableKey: "group_buying.interest.record",
      riskClass: "medium",
      autonomyPolicy: "user_confirmed",
      sideEffects: ["database_mutation", "non_binding_interest_record"],
      externalSideEffects: false,
      bindingCommitmentCreated: false,
      paymentCollected: false,
      inventoryReserved: false,
      evidenceRequired: true,
    },
  },
  {
    actionKey: "GROUP_BUYING_PAYMENT_BIND",
    name: "Bind Canonical Paid Order",
    description:
      "Make group-purchase quantity binding only after exact industrial-order and provider-payment reconciliation.",
    category: "GROUP_COMMERCE_GOVERNANCE",
    defaultAssigneeRole: "CHAIRMAN_ASSISTANT",
    schema: {
      type: "object",
      required: ["commitmentId", "industrialOrderId", "paymentId"],
      properties: {
        commitmentId: { type: "string" },
        industrialOrderId: { type: "string" },
        paymentId: { type: "string" },
      },
    },
    metadata: {
      stableKey: "group_buying.payment.bind",
      riskClass: "critical",
      autonomyPolicy: "human_approval_required",
      sideEffects: ["database_mutation", "canonical_payment_binding", "threshold_derivation"],
      externalSideEffects: false,
      duplicateCheckoutCreated: false,
      evidenceRequired: true,
    },
  },
  {
    actionKey: "PRODUCTION_BATCH_PREPARE",
    name: "Prepare Production Batch",
    description:
      "Allocate a production batch exactly to provider-confirmed paid industrial orders without starting production.",
    category: "GROUP_COMMERCE_GOVERNANCE",
    defaultAssigneeRole: "CHAIRMAN_ASSISTANT",
    schema: {
      type: "object",
      required: ["campaignId", "referenceCode", "commitmentCount"],
      properties: {
        campaignId: { type: "string" },
        referenceCode: { type: "string" },
        commitmentCount: { type: "number" },
      },
    },
    metadata: {
      stableKey: "production_batch.prepare",
      riskClass: "high",
      autonomyPolicy: "human_approval_required",
      sideEffects: ["database_mutation", "paid_order_allocation"],
      externalSideEffects: false,
      externalProductionExecuted: false,
      evidenceRequired: true,
    },
  },
  {
    actionKey: "PRODUCTION_BATCH_RECORD_EVENT",
    name: "Record Production Batch Event",
    description:
      "Record a verified production, inspection, carrier-handoff, delivery, or settlement state without calling a provider.",
    category: "GROUP_COMMERCE_GOVERNANCE",
    defaultAssigneeRole: "CHAIRMAN_ASSISTANT",
    schema: {
      type: "object",
      required: ["productionBatchId", "nextStatus"],
      properties: {
        productionBatchId: { type: "string" },
        nextStatus: { type: "string" },
      },
    },
    metadata: {
      stableKey: "production_batch.event.record",
      riskClass: "critical",
      autonomyPolicy: "human_approval_required",
      sideEffects: ["database_mutation", "evidence_backed_state_transition"],
      externalSideEffects: false,
      providerExecutionPerformed: false,
      evidenceRequired: true,
    },
  },
  {
    actionKey: "GROUP_BUYING_UPDATE_PUBLISH",
    name: "Publish Group-Purchase Update",
    description:
      "Publish an evidence-backed campaign update on the owned Producer Exchange surface without posting to an external platform.",
    category: "GROUP_COMMERCE_GOVERNANCE",
    defaultAssigneeRole: "CHAIRMAN_ASSISTANT",
    schema: {
      type: "object",
      required: ["campaignId", "audience", "title"],
      properties: {
        campaignId: { type: "string" },
        audience: { type: "string" },
        title: { type: "string" },
      },
    },
    metadata: {
      stableKey: "group_buying.update.publish",
      riskClass: "high",
      autonomyPolicy: "human_approval_required",
      sideEffects: ["database_mutation", "owned_surface_publication"],
      externalSideEffects: false,
      externalPlatformPublicationExecuted: false,
      evidenceRequired: true,
    },
  },
  {
    actionKey: "GROUP_SETTLEMENT_PREPARE",
    name: "Prepare Group Settlement Plan",
    description:
      "Prepare a balanced, explainable allocation plan from canonical paid orders without submitting settlement.",
    category: "GROUP_COMMERCE_GOVERNANCE",
    defaultAssigneeRole: "CHAIRMAN_ASSISTANT",
    schema: {
      type: "object",
      required: ["productionBatchId", "grossCollectedMinor", "refundExposureMinor", "currencyCode"],
      properties: {
        productionBatchId: { type: "string" },
        grossCollectedMinor: { type: "number" },
        refundExposureMinor: { type: "number" },
        currencyCode: { type: "string" },
      },
    },
    metadata: {
      stableKey: "group_settlement.prepare",
      riskClass: "critical",
      autonomyPolicy: "human_approval_required",
      sideEffects: ["database_mutation", "settlement_plan_preparation"],
      externalSideEffects: false,
      externalSettlementExecuted: false,
      evidenceRequired: true,
    },
  },
  {
    actionKey: "GROUP_SETTLEMENT_AUTHORIZE",
    name: "Authorize Group Settlement Plan",
    description:
      "Approve an exact settlement plan for a separate provider submission step; do not submit or claim settlement.",
    category: "GROUP_COMMERCE_GOVERNANCE",
    defaultAssigneeRole: "CHAIRMAN_ASSISTANT",
    schema: {
      type: "object",
      required: ["settlementPlanId", "approvalReference"],
      properties: {
        settlementPlanId: { type: "string" },
        approvalReference: { type: "string" },
      },
    },
    metadata: {
      stableKey: "group_settlement.authorize",
      riskClass: "critical",
      autonomyPolicy: "human_approval_required",
      sideEffects: ["database_mutation", "internal_settlement_authority"],
      externalSideEffects: false,
      providerSubmissionRequiredSeparately: true,
      externalSettlementExecuted: false,
      providerSettlementConfirmed: false,
      evidenceRequired: true,
    },
  },
  {
    actionKey: "MEDIA_INTERVIEW_PREPARE",
    name: "Prepare Media Interview",
    description:
      "Create a consent-aware interview workspace and question plan without contacting or recording anyone.",
    category: "MEDIA_GOVERNANCE",
    defaultAssigneeRole: "CHAIRMAN_ASSISTANT",
    schema: {
      type: "object",
      required: ["idempotencyKey", "mode", "confirmed"],
      properties: {
        idempotencyKey: { type: "string" },
        mode: { type: "string" },
        confirmed: { type: "boolean" },
      },
    },
    metadata: {
      stableKey: "media.interview.prepare",
      riskClass: "high",
      autonomyPolicy: "human_approval_required",
      sideEffects: ["database_mutation", "interview_workspace_preparation"],
      externalSideEffects: false,
      externalContactPerformed: false,
      recordingStarted: false,
      credentialsStoredInAction: false,
      evidenceRequired: true,
    },
  },
  {
    actionKey: "MEDIA_INTERVIEW_REVIEW",
    name: "Review Media Interview",
    description:
      "Evaluate consent, provenance, and fact tags, creating paused zero-budget evidence tasks when gaps remain.",
    category: "MEDIA_GOVERNANCE",
    defaultAssigneeRole: "CHAIRMAN_ASSISTANT",
    schema: {
      type: "object",
      required: ["sessionId", "operation", "confirmed"],
      properties: {
        sessionId: { type: "string" },
        operation: { type: "string" },
        confirmed: { type: "boolean" },
      },
    },
    metadata: {
      stableKey: "media.interview.review",
      riskClass: "high",
      autonomyPolicy: "human_approval_required",
      sideEffects: ["database_mutation", "fact_and_consent_review"],
      externalSideEffects: false,
      publicationPerformed: false,
      tasksPausedByDefault: true,
      evidenceRequired: true,
    },
  },
  {
    actionKey: "MEDIA_STUDIO_PROJECT_PREPARE",
    name: "Prepare Media Studio Project",
    description:
      "Prepare a provider-neutral editing project from an approved interview, source, and rights grant.",
    category: "MEDIA_GOVERNANCE",
    defaultAssigneeRole: "CHAIRMAN_ASSISTANT",
    schema: {
      type: "object",
      required: ["idempotencyKey", "interviewSessionId", "confirmed"],
      properties: {
        idempotencyKey: { type: "string" },
        interviewSessionId: { type: "string" },
        confirmed: { type: "boolean" },
      },
    },
    metadata: {
      stableKey: "media.studio.project.prepare",
      riskClass: "high",
      autonomyPolicy: "human_approval_required",
      sideEffects: ["database_mutation", "studio_project_preparation"],
      externalSideEffects: false,
      externalRenderExecuted: false,
      externalPublicationExecuted: false,
      evidenceRequired: true,
    },
  },
  {
    actionKey: "MEDIA_RENDER_PREPARE",
    name: "Prepare Media Render",
    description:
      "Freeze an approved version and hashed input manifest for rendering without submitting a provider job.",
    category: "MEDIA_GOVERNANCE",
    defaultAssigneeRole: "CHAIRMAN_ASSISTANT",
    schema: {
      type: "object",
      required: ["projectId", "versionId", "outputFormat", "confirmed"],
      properties: {
        projectId: { type: "string" },
        versionId: { type: "string" },
        outputFormat: { type: "string" },
        confirmed: { type: "boolean" },
      },
    },
    metadata: {
      stableKey: "media.render.prepare",
      riskClass: "critical",
      autonomyPolicy: "human_approval_required",
      sideEffects: ["database_mutation", "render_manifest_preparation"],
      externalSideEffects: false,
      providerSubmissionRequiredSeparately: true,
      providerSubmissionExecuted: false,
      externalRenderExecuted: false,
      renderClaimed: false,
      evidenceRequired: true,
    },
  },
];

function fromRegistry(entry: ActionRegistryEntry): ActionDefinitionTemplate {
  const key = normalizeActionKey(entry.actionKey);
  return {
    actionKey: key,
    name: toTitleCase(key),
    description: entry.description,
    category: entry.category,
    schema: {},
    defaultAssigneeRole: null,
    metadata: {},
  };
}

function buildTemplates() {
  const templates = new Map<string, ActionDefinitionTemplate>();

  for (const entry of ACTIONS_REGISTRY) {
    const template = fromRegistry(entry);
    templates.set(template.actionKey, template);
  }

  for (const template of REQUIRED_ACTION_TEMPLATES) {
    templates.set(normalizeActionKey(template.actionKey), {
      ...template,
      actionKey: normalizeActionKey(template.actionKey),
    });
  }

  return Array.from(templates.values());
}

const ACTION_TEMPLATES = buildTemplates();

export function getActionDefinitionTemplates() {
  return ACTION_TEMPLATES;
}

export async function ensureActionDefinitionsForTenant(tenantId: number) {
  const now = new Date();
  for (const def of ACTION_TEMPLATES) {
    await db
      .insert(actionDefinitions)
      .values({
        tenantId,
        actionKey: def.actionKey,
        name: def.name,
        description: def.description,
        category: def.category,
        schema: def.schema ?? {},
        defaultAssigneeRole: def.defaultAssigneeRole ?? null,
        isActive: true,
        version: 1,
        metadata: def.metadata ?? {},
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [actionDefinitions.tenantId, actionDefinitions.actionKey],
        set: {
          name: def.name,
          description: def.description,
          category: def.category,
          schema: def.schema ?? {},
          defaultAssigneeRole: def.defaultAssigneeRole ?? null,
          metadata: def.metadata ?? {},
          isActive: true,
          updatedAt: now,
        },
      });
  }
}

export async function ensureActionDefinitions() {
  const tenantRows = await db.query.tenants.findMany({ columns: { id: true } });
  for (const tenant of tenantRows) {
    const tenantId = Number(tenant.id);
    if (!Number.isFinite(tenantId) || tenantId <= 0) continue;
    await ensureActionDefinitionsForTenant(tenantId);
  }
}

export async function getActionDefinitionForTenant(tenantId: number, actionKey: string) {
  const key = normalizeActionKey(actionKey);
  return db.query.actionDefinitions.findFirst({
    where: and(eq(actionDefinitions.tenantId, tenantId), eq(actionDefinitions.actionKey, key)),
  });
}
