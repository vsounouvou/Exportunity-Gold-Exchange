import type { CarrierAdapterCapability } from "./carrierAdapter";

export type CarrierProviderReleaseAction = Extract<
  CarrierAdapterCapability,
  | "connection_check"
  | "quote_request"
  | "booking_create"
  | "booking_cancel"
  | "tracking_read"
  | "proof_of_delivery_read"
  | "webhook_receipts"
>;

type JsonRecord = Record<string, unknown>;

export const CARRIER_PROVIDER_CONTRACT_MANIFESTS = [
  {
    provider: "dhl_express_mydhl",
    label: "DHL Express MyDHL API",
    officialDocumentation:
      "https://developer.dhl.com/api-reference/dhl-express-mydhl-api?lang=en",
    termsReference:
      "https://developer.dhl.com/api-reference/dhl-express-mydhl-api?lang=en",
    releaseStatus: "written_agreement_required",
    dataUseBoundary: [
      "quote_response_persistence_requires_written_rights",
      "quote_response_transformation_requires_written_rights",
      "commercial_use_requires_written_rights",
    ],
    supportedCapabilities: [
      "connection_check",
      "quote_request",
      "booking_create",
      "booking_cancel",
      "tracking_read",
      "proof_of_delivery_read",
    ] as CarrierProviderReleaseAction[],
    requiresSandboxPilot: true,
  },
] as const;

export type CarrierProviderFeatureFlags = {
  connectionChecks: boolean;
  quoteRequests: boolean;
  bookings: boolean;
  cancellations: boolean;
  trackingReads: boolean;
  trackingCallbacks: boolean;
};

export type CarrierProviderReleaseConnection = {
  provider: string;
  environment: "sandbox" | "test" | "production" | string;
  status: string;
  restrictionStatus: string;
  callbackStatus?: string;
  capabilities: unknown;
  verificationEvidence: unknown;
  lastVerifiedAt?: unknown;
  credentialReferencePresent?: boolean;
  exportunityIntegrationConnectionPresent?: boolean;
};

export type RegisteredCarrierAdapter = {
  provider: string;
  capabilities: string[];
};

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function containsCredentialMaterial(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsCredentialMaterial);
  return Object.entries(value as JsonRecord).some(
    ([key, child]) =>
      /(?:password|passwd|secret|access.?token|refresh.?token|authorization|cookie|private.?key|api.?key)/i.test(
        key,
      ) || containsCredentialMaterial(child),
  );
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? Array.from(
        new Set(value.map((item) => String(item || "").trim()).filter(Boolean)),
      )
    : [];
}

function enabled(value: unknown) {
  return /^(?:1|true|yes|on)$/i.test(String(value || "").trim());
}

function approvedDate(value: unknown, now: Date) {
  const date = new Date(String(value || ""));
  return (
    Number.isFinite(date.getTime()) &&
    date.getTime() <= now.getTime() + 5 * 60_000
  );
}

function futureDate(value: unknown, now: Date) {
  const date = new Date(String(value || ""));
  return Number.isFinite(date.getTime()) && date.getTime() > now.getTime();
}

function recentDate(value: unknown, now: Date, maximumAgeDays: number) {
  const date = new Date(String(value || ""));
  if (!Number.isFinite(date.getTime())) return false;
  const age = now.getTime() - date.getTime();
  return (
    age >= -5 * 60_000 &&
    age <= maximumAgeDays * 24 * 60 * 60_000
  );
}

function optionalIsoDate(value: unknown) {
  const date = new Date(String(value || ""));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export function sanitizeCarrierProviderContractEvidence(value: unknown) {
  const source = asRecord(value);
  if (!Object.keys(source).length) return null;
  if (containsCredentialMaterial(source)) {
    throw new Error(
      "Carrier provider contract evidence must not contain passwords, tokens, secrets, cookies, or API keys",
    );
  }
  const dataRightsSource = asRecord(source.dataRights);
  const sandboxPilotSource = asRecord(source.sandboxPilot);
  return {
    provider: String(source.provider || "").trim().toLowerCase().slice(0, 80),
    writtenAgreementExecuted: source.writtenAgreementExecuted === true,
    agreementReference:
      String(source.agreementReference || "").trim().slice(0, 240) || null,
    agreementEffectiveAt: optionalIsoDate(source.agreementEffectiveAt),
    agreementExpiresAt: optionalIsoDate(source.agreementExpiresAt),
    termsSnapshotReference:
      String(source.termsSnapshotReference || "").trim().slice(0, 500) || null,
    legalApprovalReference:
      String(source.legalApprovalReference || "").trim().slice(0, 240) || null,
    legalApprovedAt: optionalIsoDate(source.legalApprovedAt),
    operationsApprovalReference:
      String(source.operationsApprovalReference || "").trim().slice(0, 240) ||
      null,
    operationsApprovedAt: optionalIsoDate(source.operationsApprovedAt),
    securityApprovalReference:
      String(source.securityApprovalReference || "").trim().slice(0, 240) ||
      null,
    securityApprovedAt: optionalIsoDate(source.securityApprovedAt),
    productionUseApproved: source.productionUseApproved === true,
    dataRights: {
      accountVerification: dataRightsSource.accountVerification === true,
      quoteSubmission: dataRightsSource.quoteSubmission === true,
      quoteResponsePersistence:
        dataRightsSource.quoteResponsePersistence === true,
      quoteResponseTransformation:
        dataRightsSource.quoteResponseTransformation === true,
      commercialUse: dataRightsSource.commercialUse === true,
      bookingCreation: dataRightsSource.bookingCreation === true,
      bookingCancellation: dataRightsSource.bookingCancellation === true,
      trackingPersistence: dataRightsSource.trackingPersistence === true,
      proofOfDeliveryPersistence:
        dataRightsSource.proofOfDeliveryPersistence === true,
      webhookProcessing: dataRightsSource.webhookProcessing === true,
    },
    sandboxPilot: {
      completed: sandboxPilotSource.completed === true,
      receiptReferences: stringArray(sandboxPilotSource.receiptReferences).slice(
        0,
        20,
      ),
    },
  };
}

export function readCarrierProviderFeatureFlags(
  env: Record<string, unknown> = process.env,
): CarrierProviderFeatureFlags {
  return {
    connectionChecks: enabled(env.FEATURE_CARRIER_PROVIDER_CONNECTION_CHECKS),
    quoteRequests: enabled(env.FEATURE_CARRIER_PROVIDER_QUOTE_REQUESTS),
    bookings: enabled(env.FEATURE_CARRIER_PROVIDER_BOOKINGS),
    cancellations: enabled(env.FEATURE_CARRIER_PROVIDER_CANCELLATIONS),
    trackingReads: enabled(env.FEATURE_CARRIER_PROVIDER_TRACKING_READS),
    trackingCallbacks: enabled(
      env.FEATURE_CARRIER_PROVIDER_TRACKING_CALLBACKS,
    ),
  };
}

function flagForAction(
  action: CarrierProviderReleaseAction,
  flags: CarrierProviderFeatureFlags,
) {
  if (action === "connection_check") return flags.connectionChecks;
  if (action === "quote_request") return flags.quoteRequests;
  if (action === "booking_create") return flags.bookings;
  if (action === "booking_cancel") return flags.cancellations;
  if (action === "webhook_receipts") return flags.trackingCallbacks;
  return flags.trackingReads;
}

function rightsForAction(action: CarrierProviderReleaseAction) {
  if (action === "connection_check") return ["accountVerification"];
  if (action === "quote_request") {
    return [
      "quoteSubmission",
      "quoteResponsePersistence",
      "quoteResponseTransformation",
      "commercialUse",
    ];
  }
  if (action === "booking_create") return ["bookingCreation"];
  if (action === "booking_cancel") return ["bookingCancellation"];
  if (action === "tracking_read") return ["trackingPersistence"];
  if (action === "proof_of_delivery_read") {
    return ["proofOfDeliveryPersistence"];
  }
  return ["webhookProcessing"];
}

export function evaluateCarrierProviderReleaseGate(input: {
  provider: string;
  action: CarrierProviderReleaseAction;
  environment: "sandbox" | "test" | "production" | string;
  connection: CarrierProviderReleaseConnection | null;
  registeredAdapters: RegisteredCarrierAdapter[];
  featureFlags?: CarrierProviderFeatureFlags;
  executionSurfacePresent?: boolean;
  now?: Date;
}) {
  const now = input.now || new Date();
  const provider = String(input.provider || "").trim().toLowerCase();
  const blockers: string[] = [];
  const manifest = CARRIER_PROVIDER_CONTRACT_MANIFESTS.find(
    (candidate) => candidate.provider === provider,
  );
  if (!manifest) blockers.push("carrier_provider_contract_manifest_required");
  if (
    manifest &&
    !manifest.supportedCapabilities.includes(input.action as never)
  ) {
    blockers.push(`carrier_provider_action_not_in_manifest:${input.action}`);
  }

  const adapter = input.registeredAdapters.find(
    (candidate) => candidate.provider.toLowerCase() === provider,
  );
  if (!adapter) blockers.push("carrier_official_adapter_not_registered");
  if (adapter && !adapter.capabilities.includes(input.action)) {
    blockers.push(`carrier_adapter_capability_missing:${input.action}`);
  }

  const flags = input.featureFlags || readCarrierProviderFeatureFlags();
  if (!flagForAction(input.action, flags)) {
    blockers.push(`carrier_provider_feature_disabled:${input.action}`);
  }
  if (input.executionSurfacePresent !== true) {
    blockers.push("carrier_execution_surface_not_implemented");
  }

  const connection = input.connection;
  if (!connection) blockers.push("carrier_provider_connection_required");
  if (connection && connection.provider.toLowerCase() !== provider) {
    blockers.push("carrier_provider_connection_mismatch");
  }
  if (connection && connection.environment !== input.environment) {
    blockers.push("carrier_provider_environment_mismatch");
  }
  if (connection && connection.status !== "verified") {
    blockers.push("carrier_provider_connection_not_verified");
  }
  if (connection && connection.restrictionStatus !== "none") {
    blockers.push(`carrier_provider_restricted:${connection.restrictionStatus}`);
  }
  if (
    connection &&
    !connection.credentialReferencePresent &&
    !connection.exportunityIntegrationConnectionPresent
  ) {
    blockers.push("carrier_exportunity_credential_boundary_required");
  }
  if (
    connection &&
    !stringArray(connection.capabilities).includes(input.action)
  ) {
    blockers.push(`carrier_connection_capability_missing:${input.action}`);
  }

  const verification = asRecord(connection?.verificationEvidence);
  const contract = asRecord(verification.providerContract);
  const dataRights = asRecord(contract.dataRights);
  const sandboxPilot = asRecord(contract.sandboxPilot);
  if (connection && verification.verified !== true) {
    blockers.push("carrier_provider_connection_verification_evidence_required");
  }
  if (verification.credentialsExcluded !== true) {
    blockers.push("carrier_provider_credentials_exclusion_unverified");
  }
  if (connection && !recentDate(connection.lastVerifiedAt, now, 90)) {
    blockers.push("carrier_provider_connection_verification_stale");
  }
  if (String(contract.provider || "").trim().toLowerCase() !== provider) {
    blockers.push("carrier_provider_contract_evidence_required");
  }
  if (contract.writtenAgreementExecuted !== true) {
    blockers.push("carrier_written_agreement_required");
  }
  if (!String(contract.agreementReference || "").trim()) {
    blockers.push("carrier_agreement_reference_required");
  }
  if (!String(contract.termsSnapshotReference || "").trim()) {
    blockers.push("carrier_terms_snapshot_required");
  }
  if (!approvedDate(contract.agreementEffectiveAt, now)) {
    blockers.push("carrier_agreement_effective_date_required");
  }
  if (!futureDate(contract.agreementExpiresAt, now)) {
    blockers.push("carrier_agreement_current_term_required");
  }
  if (!String(contract.legalApprovalReference || "").trim()) {
    blockers.push("carrier_legal_approval_reference_required");
  }
  if (!approvedDate(contract.legalApprovedAt, now)) {
    blockers.push("carrier_legal_approval_required");
  }
  if (!String(contract.operationsApprovalReference || "").trim()) {
    blockers.push("carrier_operations_approval_reference_required");
  }
  if (!approvedDate(contract.operationsApprovedAt, now)) {
    blockers.push("carrier_operations_approval_required");
  }
  for (const right of rightsForAction(input.action)) {
    if (dataRights[right] !== true) {
      blockers.push(`carrier_data_right_required:${right}`);
    }
  }
  if (input.action === "webhook_receipts") {
    if (connection?.callbackStatus !== "verified") {
      blockers.push("carrier_provider_callback_not_verified");
    }
    if (!String(contract.securityApprovalReference || "").trim()) {
      blockers.push("carrier_webhook_security_approval_reference_required");
    }
    if (!approvedDate(contract.securityApprovedAt, now)) {
      blockers.push("carrier_webhook_security_approval_required");
    }
  }
  if (
    input.environment === "production" &&
    contract.productionUseApproved !== true
  ) {
    blockers.push("carrier_production_use_approval_required");
  }
  if (
    input.environment === "production" &&
    manifest?.requiresSandboxPilot &&
    (sandboxPilot.completed !== true ||
      stringArray(sandboxPilot.receiptReferences).length === 0)
  ) {
    blockers.push("carrier_sandbox_pilot_evidence_required");
  }

  return {
    provider,
    action: input.action,
    environment: input.environment,
    ready: blockers.length === 0,
    blockers: Array.from(new Set(blockers)),
    manifest: manifest
      ? {
          label: manifest.label,
          officialDocumentation: manifest.officialDocumentation,
          termsReference: manifest.termsReference,
          releaseStatus: manifest.releaseStatus,
          dataUseBoundary: [...manifest.dataUseBoundary],
        }
      : null,
    providerActionExecuted: false as const,
    externalCommitmentCreated: false as const,
  };
}

export function buildCarrierProviderReleaseState(input: {
  connections: CarrierProviderReleaseConnection[];
  registeredAdapters: RegisteredCarrierAdapter[];
  featureFlags?: CarrierProviderFeatureFlags;
  now?: Date;
}) {
  const featureFlags = input.featureFlags || readCarrierProviderFeatureFlags();
  const providers = CARRIER_PROVIDER_CONTRACT_MANIFESTS.map((manifest) => {
    const connection =
      input.connections.find(
        (candidate) =>
          candidate.provider.toLowerCase() === manifest.provider &&
          candidate.environment === "production",
      ) ||
      input.connections.find(
        (candidate) => candidate.provider.toLowerCase() === manifest.provider,
      ) ||
      null;
    const environment = connection?.environment || "production";
    const evaluate = (action: CarrierProviderReleaseAction) =>
      evaluateCarrierProviderReleaseGate({
        provider: manifest.provider,
        action,
        environment,
        connection,
        registeredAdapters: input.registeredAdapters,
        featureFlags,
        executionSurfacePresent: false,
        now: input.now,
      });
    return {
      provider: manifest.provider,
      label: manifest.label,
      officialDocumentation: manifest.officialDocumentation,
      termsReference: manifest.termsReference,
      connectionStatus: connection?.status || "not_connected",
      adapterRegistered: input.registeredAdapters.some(
        (adapter) => adapter.provider.toLowerCase() === manifest.provider,
      ),
      gates: {
        quoteRequest: evaluate("quote_request"),
        bookingCreate: evaluate("booking_create"),
        trackingRead: evaluate("tracking_read"),
        webhookReceipts: evaluate("webhook_receipts"),
      },
    };
  });
  return {
    featureFlags,
    providers,
    controls: {
      providerQuoteRequestsEnabled: providers.some(
        (provider) => provider.gates.quoteRequest.ready,
      ),
      providerBookingsEnabled: providers.some(
        (provider) => provider.gates.bookingCreate.ready,
      ),
      providerTrackingReadsEnabled: providers.some(
        (provider) => provider.gates.trackingRead.ready,
      ),
      providerTrackingCallbacksEnabled: providers.some(
        (provider) => provider.gates.webhookReceipts.ready,
      ),
      executionSurfacePresent: false as const,
      providerActionExecuted: false as const,
      externalCommitmentCreated: false as const,
    },
  };
}
