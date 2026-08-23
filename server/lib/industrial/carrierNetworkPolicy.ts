import type {
  CarrierAdapterCapability,
  CarrierCargo,
  CarrierRouteAddress,
} from "./carrierAdapter";
import { sanitizeCarrierProviderContractEvidence } from "./carrierProviderRelease";

export const CARRIER_PROFILE_STATUSES = [
  "discovered",
  "contactable",
  "contacted",
  "prequalified",
  "verified",
  "contracted",
  "active",
  "suspended",
  "rejected",
  "archived",
] as const;

export const CARRIER_VERIFICATION_STATUSES = [
  "unverified",
  "source_verified",
  "contact_verified",
  "document_verified",
  "contract_verified",
  "transaction_verified",
] as const;

export const CARRIER_PARTNERSHIP_STATUSES = [
  "candidate",
  "verified_provider",
  "contracted_partner",
  "internal_network",
] as const;

export const CARRIER_COVERAGE_STATUSES = [
  "candidate",
  "evidence_pending",
  "verified",
  "active",
  "suspended",
  "unavailable",
  "expired",
] as const;

export const CARRIER_SERVICE_TYPES = ["freight", "customs", "last_mile"] as const;
export const CARRIER_QUOTE_SOURCE_TYPES = [
  "manual_evidence",
  "provider_callback",
  "approved_import",
] as const;

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? Array.from(new Set(value.map((item) => String(item || "").trim()).filter(Boolean)))
    : [];
}

function hasCredentialKey(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(hasCredentialKey);
  return Object.entries(value as JsonRecord).some(
    ([key, child]) =>
      /(?:password|passwd|secret|access.?token|refresh.?token|authorization|cookie|private.?key|api.?key)/i.test(
        key,
      ) || hasCredentialKey(child),
  );
}

function isoDate(value: unknown) {
  const date = new Date(String(value || ""));
  return Number.isFinite(date.getTime()) ? date : null;
}

function recentEnough(value: unknown, now: Date, maximumAgeDays: number) {
  const date = isoDate(value);
  if (!date) return false;
  const age = now.getTime() - date.getTime();
  return age >= -5 * 60 * 1000 && age <= maximumAgeDays * 24 * 60 * 60 * 1000;
}

function future(value: unknown, now: Date) {
  const date = isoDate(value);
  return Boolean(date && date.getTime() > now.getTime());
}

export function sanitizeCarrierVerificationEvidence(value: unknown, now = new Date()) {
  const source = asRecord(value);
  if (hasCredentialKey(source)) {
    throw new Error("Carrier evidence must not contain passwords, tokens, secrets, cookies, or API keys");
  }
  const verified = source.verified === true;
  const credentialsExcluded = source.credentialsExcluded === true;
  const sourceReferences = asStringArray(source.sourceReferences).slice(0, 20);
  const verifiedAt = isoDate(source.verifiedAt || now.toISOString());
  if (!verifiedAt) throw new Error("Carrier verification evidence requires a valid verifiedAt date");
  if (verifiedAt.getTime() > now.getTime() + 5 * 60 * 1000) {
    throw new Error("Carrier verification evidence cannot be future-dated");
  }
  const result = {
    verified,
    credentialsExcluded,
    verifiedAt: verifiedAt.toISOString(),
    authorityReference: String(source.authorityReference || "").trim().slice(0, 240) || null,
    registrationReference:
      String(source.registrationReference || "").trim().slice(0, 240) || null,
    contractReference: String(source.contractReference || "").trim().slice(0, 240) || null,
    externalAccountReference:
      String(source.externalAccountReference || "").trim().slice(0, 240) || null,
    sourceReferences,
    providerContract: sanitizeCarrierProviderContractEvidence(
      source.providerContract,
    ),
    notes: String(source.notes || "").trim().slice(0, 2000) || null,
  };
  if (!result.verified) throw new Error("Carrier verification evidence must explicitly be verified");
  if (!result.credentialsExcluded) {
    throw new Error("Carrier verification evidence must confirm credentials were excluded");
  }
  if (!result.authorityReference && !result.registrationReference && !result.contractReference) {
    throw new Error("Carrier verification requires an authority, registration, or contract reference");
  }
  if (!sourceReferences.length) throw new Error("Carrier verification requires at least one precise source reference");
  return result;
}

export type CarrierProfileSnapshot = {
  tenantId: number;
  status: string;
  verificationStatus: string;
  partnershipStatus: string;
  restrictionStatus: string;
  verificationEvidence: unknown;
  lastVerifiedAt: unknown;
  verificationExpiresAt?: unknown;
};

export function evaluateCarrierProfileReadiness(input: {
  tenantId: number;
  profile: CarrierProfileSnapshot | null;
  requireContractedPartner?: boolean;
  now?: Date;
}) {
  const now = input.now || new Date();
  const blockers: string[] = [];
  const profile = input.profile;
  if (!profile) blockers.push("carrier_profile_required");
  if (profile && profile.tenantId !== input.tenantId) blockers.push("cross_tenant_carrier_forbidden");
  if (profile && !["verified", "contracted", "active"].includes(profile.status)) {
    blockers.push("carrier_profile_not_verified");
  }
  if (profile && profile.verificationStatus === "unverified") {
    blockers.push("carrier_verification_required");
  }
  if (profile && input.requireContractedPartner && !["contracted_partner", "internal_network"].includes(profile.partnershipStatus)) {
    blockers.push("carrier_contract_required");
  }
  if (profile && String(profile.restrictionStatus || "none") !== "none") {
    blockers.push(`carrier_restricted:${profile.restrictionStatus}`);
  }
  const evidence = asRecord(profile?.verificationEvidence);
  if (profile && (evidence.verified !== true || evidence.credentialsExcluded !== true)) {
    blockers.push("carrier_verification_evidence_required");
  }
  if (profile && !recentEnough(profile.lastVerifiedAt, now, 180)) {
    blockers.push("carrier_verification_stale");
  }
  if (profile?.verificationExpiresAt && !future(profile.verificationExpiresAt, now)) {
    blockers.push("carrier_verification_expired");
  }
  return { ready: blockers.length === 0, blockers, externalCommitmentAuthorized: false };
}

export type CarrierCoverageSnapshot = {
  id: string;
  tenantId: number;
  carrierProfileId: string;
  originCountryCode: string;
  destinationCountryCode: string;
  serviceType: string;
  transportMode: string;
  productCategory?: string | null;
  capabilities: unknown;
  maxWeightKg?: unknown;
  maxVolumeM3?: unknown;
  hazardousGoodsSupported: boolean;
  coldChainSupported: boolean;
  status: string;
  evidence: unknown;
  sourceReference?: string | null;
  lastVerifiedAt: unknown;
  validUntil?: unknown;
};

export function evaluateCarrierCoverageMatch(input: {
  tenantId: number;
  carrierProfileId: string;
  coverage: CarrierCoverageSnapshot;
  serviceType: string;
  origin: CarrierRouteAddress;
  destination: CarrierRouteAddress;
  cargo: CarrierCargo;
  transportMode?: string | null;
  requiredCapabilities?: string[];
  now?: Date;
}) {
  const now = input.now || new Date();
  const blockers: string[] = [];
  const coverage = input.coverage;
  if (coverage.tenantId !== input.tenantId) blockers.push("cross_tenant_coverage_forbidden");
  if (coverage.carrierProfileId !== input.carrierProfileId) blockers.push("carrier_coverage_mismatch");
  if (!["verified", "active"].includes(coverage.status)) blockers.push("verified_coverage_required");
  if (coverage.originCountryCode !== input.origin.countryCode.toUpperCase()) {
    blockers.push("coverage_origin_country_mismatch");
  }
  if (coverage.destinationCountryCode !== input.destination.countryCode.toUpperCase()) {
    blockers.push("coverage_destination_country_mismatch");
  }
  if (coverage.serviceType !== input.serviceType) blockers.push("coverage_service_type_mismatch");
  if (input.transportMode && coverage.transportMode !== input.transportMode) {
    blockers.push("coverage_transport_mode_mismatch");
  }
  if (
    coverage.productCategory &&
    input.cargo.productCategory &&
    coverage.productCategory !== input.cargo.productCategory
  ) {
    blockers.push("coverage_product_category_mismatch");
  }
  const maxWeight = Number(coverage.maxWeightKg);
  if (input.cargo.weightKg && Number.isFinite(maxWeight) && maxWeight > 0 && input.cargo.weightKg > maxWeight) {
    blockers.push("coverage_weight_exceeded");
  }
  const maxVolume = Number(coverage.maxVolumeM3);
  if (input.cargo.volumeM3 && Number.isFinite(maxVolume) && maxVolume > 0 && input.cargo.volumeM3 > maxVolume) {
    blockers.push("coverage_volume_exceeded");
  }
  if (input.cargo.hazardousGoods && !coverage.hazardousGoodsSupported) {
    blockers.push("hazardous_goods_coverage_required");
  }
  if (input.cargo.coldChainRequired && !coverage.coldChainSupported) {
    blockers.push("cold_chain_coverage_required");
  }
  const capabilities = new Set(asStringArray(coverage.capabilities));
  for (const capability of input.requiredCapabilities || []) {
    if (!capabilities.has(capability)) blockers.push(`coverage_capability_missing:${capability}`);
  }
  if (!Array.isArray(coverage.evidence) || !coverage.evidence.length || !coverage.sourceReference) {
    blockers.push("coverage_evidence_required");
  }
  if (!recentEnough(coverage.lastVerifiedAt, now, 120)) blockers.push("coverage_verification_stale");
  if (coverage.validUntil && !future(coverage.validUntil, now)) blockers.push("coverage_expired");
  return { matched: blockers.length === 0, blockers, providerServiceabilityConfirmed: false };
}

export type CarrierConnectionSnapshot = {
  tenantId: number;
  status: string;
  restrictionStatus: string;
  capabilities: unknown;
  callbackStatus: string;
  verificationEvidence: unknown;
  lastVerifiedAt: unknown;
  exportunityIntegrationConnectionId?: string | null;
  credentialReference?: string | null;
};

export function evaluateCarrierConnectionReadiness(input: {
  tenantId: number;
  connection: CarrierConnectionSnapshot | null;
  requiredCapability: CarrierAdapterCapability;
  requireCallback?: boolean;
  now?: Date;
}) {
  const now = input.now || new Date();
  const blockers: string[] = [];
  const connection = input.connection;
  if (!connection) blockers.push("carrier_adapter_connection_required");
  if (connection && connection.tenantId !== input.tenantId) blockers.push("cross_tenant_connection_forbidden");
  if (connection && connection.status !== "verified") blockers.push("carrier_adapter_not_verified");
  if (connection && connection.restrictionStatus !== "none") {
    blockers.push(`carrier_adapter_restricted:${connection.restrictionStatus}`);
  }
  if (connection && !asStringArray(connection.capabilities).includes(input.requiredCapability)) {
    blockers.push(`carrier_adapter_capability_missing:${input.requiredCapability}`);
  }
  if (connection && input.requireCallback && connection.callbackStatus !== "verified") {
    blockers.push("carrier_callback_not_verified");
  }
  const evidence = asRecord(connection?.verificationEvidence);
  if (connection && (evidence.verified !== true || evidence.credentialsExcluded !== true)) {
    blockers.push("carrier_adapter_verification_evidence_required");
  }
  if (connection && !recentEnough(connection.lastVerifiedAt, now, 90)) {
    blockers.push("carrier_adapter_verification_stale");
  }
  if (
    connection &&
    !connection.exportunityIntegrationConnectionId &&
    !connection.credentialReference
  ) {
    blockers.push("carrier_credential_reference_required");
  }
  return { ready: blockers.length === 0, blockers, providerActionExecuted: false };
}

export function validateCarrierQuoteRequest(input: {
  serviceType: string;
  origin: CarrierRouteAddress;
  destination: CarrierRouteAddress;
  cargo: CarrierCargo;
  requiredCapabilities?: string[];
}) {
  const blockers: string[] = [];
  if (!CARRIER_SERVICE_TYPES.includes(input.serviceType as any)) blockers.push("carrier_service_type_invalid");
  if (!/^[A-Z]{2}$/.test(String(input.origin.countryCode || "").toUpperCase())) blockers.push("origin_country_required");
  if (!/^[A-Z]{2}$/.test(String(input.destination.countryCode || "").toUpperCase())) blockers.push("destination_country_required");
  if (!String(input.cargo.description || "").trim()) blockers.push("cargo_description_required");
  if (input.cargo.weightKg != null && (!Number.isFinite(input.cargo.weightKg) || input.cargo.weightKg <= 0)) {
    blockers.push("cargo_weight_invalid");
  }
  if (input.cargo.volumeM3 != null && (!Number.isFinite(input.cargo.volumeM3) || input.cargo.volumeM3 <= 0)) {
    blockers.push("cargo_volume_invalid");
  }
  if (input.cargo.declaredValueMinor != null && (!Number.isSafeInteger(input.cargo.declaredValueMinor) || input.cargo.declaredValueMinor < 0)) {
    blockers.push("cargo_declared_value_invalid");
  }
  if (input.cargo.hazardousGoods && !(input.requiredCapabilities || []).includes("hazardous_goods")) {
    blockers.push("hazardous_goods_capability_required");
  }
  if (input.cargo.coldChainRequired && !(input.requiredCapabilities || []).includes("cold_chain")) {
    blockers.push("cold_chain_capability_required");
  }
  return { valid: blockers.length === 0, blockers };
}

export function evaluateCarrierQuoteEvidence(input: {
  tenantId: number;
  profile: CarrierProfileSnapshot | null;
  sourceType: string;
  providerQuoteReference?: string | null;
  totalCostMinor: number;
  customerPriceMinor?: number | null;
  currencyCode: string;
  validUntil: unknown;
  evidence: unknown;
  now?: Date;
}) {
  const now = input.now || new Date();
  const profileReadiness = evaluateCarrierProfileReadiness({ tenantId: input.tenantId, profile: input.profile, now });
  const blockers = [...profileReadiness.blockers];
  if (!CARRIER_QUOTE_SOURCE_TYPES.includes(input.sourceType as any)) blockers.push("carrier_quote_source_invalid");
  if (input.sourceType === "provider_callback" && !String(input.providerQuoteReference || "").trim()) {
    blockers.push("provider_quote_reference_required");
  }
  if (!Number.isSafeInteger(input.totalCostMinor) || input.totalCostMinor < 0) blockers.push("carrier_quote_cost_invalid");
  if (input.customerPriceMinor != null && (!Number.isSafeInteger(input.customerPriceMinor) || input.customerPriceMinor < input.totalCostMinor)) {
    blockers.push("carrier_quote_customer_price_invalid");
  }
  if (!/^[A-Z]{3}$/.test(input.currencyCode)) blockers.push("carrier_quote_currency_invalid");
  if (!future(input.validUntil, now)) blockers.push("carrier_quote_expired");
  if (!Array.isArray(input.evidence) || !input.evidence.length || hasCredentialKey(input.evidence)) {
    blockers.push("carrier_quote_evidence_required");
  }
  return { verified: blockers.length === 0, blockers, bookingCreatedExternally: false };
}

export function evaluateCarrierBookingAuthorization(input: {
  tenantId: number;
  order: { tenantId: number; id: string; paymentStatus: string; currencyCode: string } | null;
  plan: { tenantId: number; id: string; orderId: string } | null;
  service: { tenantId: number; id: string; orderId: string; serviceType: string } | null;
  quote: {
    tenantId: number;
    industrialOrderId: string;
    status: string;
    totalCostMinor: number;
    currencyCode: string;
    validUntil: unknown;
  } | null;
  profile: CarrierProfileSnapshot | null;
  connection: CarrierConnectionSnapshot | null;
  openIncidents?: Array<{ severity: string; status: string }>;
  humanConfirmed: boolean;
  approvalReference?: string | null;
  approvalRationale?: string | null;
  now?: Date;
}) {
  const now = input.now || new Date();
  const blockers: string[] = [];
  if (!input.order || input.order.tenantId !== input.tenantId) blockers.push("tenant_order_required");
  if (input.order && input.order.paymentStatus !== "paid") blockers.push("verified_payment_required");
  if (!input.plan || input.plan.tenantId !== input.tenantId || input.plan.orderId !== input.order?.id) {
    blockers.push("tenant_fulfillment_plan_required");
  }
  if (!input.service || input.service.tenantId !== input.tenantId || input.service.orderId !== input.order?.id) {
    blockers.push("tenant_fulfillment_service_required");
  }
  if (!input.quote || input.quote.tenantId !== input.tenantId || input.quote.industrialOrderId !== input.order?.id) {
    blockers.push("tenant_delivery_quote_required");
  }
  if (input.quote && !["verified", "selected"].includes(input.quote.status)) blockers.push("verified_delivery_quote_required");
  if (input.quote && !future(input.quote.validUntil, now)) blockers.push("delivery_quote_expired");
  if (input.quote && input.order && input.quote.currencyCode !== input.order.currencyCode) {
    blockers.push("delivery_quote_currency_mismatch");
  }
  blockers.push(
    ...evaluateCarrierProfileReadiness({
      tenantId: input.tenantId,
      profile: input.profile,
      requireContractedPartner: true,
      now,
    }).blockers,
  );
  blockers.push(
    ...evaluateCarrierConnectionReadiness({
      tenantId: input.tenantId,
      connection: input.connection,
      requiredCapability: "booking_create",
      now,
    }).blockers,
  );
  if ((input.openIncidents || []).some((incident) => ["high", "critical"].includes(incident.severity) && !["resolved", "dismissed"].includes(incident.status))) {
    blockers.push("carrier_high_risk_incident_open");
  }
  if (!input.humanConfirmed) blockers.push("human_booking_approval_required");
  if (!String(input.approvalReference || "").trim()) blockers.push("booking_approval_reference_required");
  if (String(input.approvalRationale || "").trim().length < 8) blockers.push("booking_approval_rationale_required");
  return {
    readyForProviderSubmission: blockers.length === 0,
    blockers,
    externalBookingExecuted: false,
    providerBookingConfirmed: false,
  };
}

export function buildManualCarrierQuotePackage(input: {
  quoteRequestId: string;
  serviceType: string;
  origin: CarrierRouteAddress;
  destination: CarrierRouteAddress;
  cargo: CarrierCargo;
  requiredCapabilities: string[];
  incoterm?: string | null;
}) {
  return {
    status: "MANUAL_REQUIRED" as const,
    quoteRequestId: input.quoteRequestId,
    serviceType: input.serviceType,
    origin: input.origin,
    destination: input.destination,
    cargo: input.cargo,
    requiredCapabilities: [...input.requiredCapabilities],
    incoterm: input.incoterm || null,
    instructions: [
      "Send this package only through an approved provider or staff channel.",
      "Record the provider response, precise source reference, validity, and terms before verification.",
      "Do not represent a candidate carrier as a partner or a prepared request as submitted.",
    ],
    providerRequestExecuted: false,
    providerQuoteReceived: false,
    externalBookingExecuted: false,
  };
}
