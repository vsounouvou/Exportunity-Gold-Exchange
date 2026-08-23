import crypto from "node:crypto";

import { randomBytes } from "node:crypto";

import { db } from "@db";
import {
  carrierAdapterConnections,
  carrierBookingAuthorizations,
  carrierCoverages,
  carrierDeliveryQuotes,
  carrierIncidents,
  carrierProfiles,
  carrierProviderReceipts,
  carrierQuoteRequests,
  exportunityIntegrationConnections,
  industrialAuditLogs,
  industrialFulfillmentEvents,
  industrialFulfillmentPlans,
  industrialFulfillmentServices,
  industrialOrders,
} from "@db/schema";
import { and, asc, desc, eq, inArray, notInArray, or, sql } from "drizzle-orm";

import {
  completeRunFailure,
  completeRunSuccess,
  createActionRun,
} from "../actions/actionRuns";
import type { CarrierCargo, CarrierRouteAddress } from "./carrierAdapter";
import { listRegisteredCarrierAdapters } from "./carrierAdapter";
import { buildCarrierProviderReleaseState } from "./carrierProviderRelease";
import {
  buildManualCarrierQuotePackage,
  CARRIER_COVERAGE_STATUSES,
  CARRIER_PARTNERSHIP_STATUSES,
  CARRIER_PROFILE_STATUSES,
  CARRIER_QUOTE_SOURCE_TYPES,
  CARRIER_SERVICE_TYPES,
  CARRIER_VERIFICATION_STATUSES,
  evaluateCarrierBookingAuthorization,
  evaluateCarrierConnectionReadiness,
  evaluateCarrierCoverageMatch,
  evaluateCarrierProfileReadiness,
  evaluateCarrierQuoteEvidence,
  sanitizeCarrierVerificationEvidence,
  validateCarrierQuoteRequest,
} from "./carrierNetworkPolicy";

type JsonRecord = Record<string, unknown>;
type Executor = any;

export class CarrierNetworkError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 409,
  ) {
    super(message);
    this.name = "CarrierNetworkError";
  }
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function boundedText(value: unknown, field: string, max = 240) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new CarrierNetworkError("carrier_field_required", `${field} is required`, 400);
  if (normalized.length > max) {
    throw new CarrierNetworkError("carrier_field_too_long", `${field} exceeds ${max} characters`, 400);
  }
  return normalized;
}

function optionalText(value: unknown, max = 240) {
  const normalized = String(value || "").trim();
  return normalized ? normalized.slice(0, max) : null;
}

function stringArray(value: unknown, max = 50) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(value.map((item) => String(item || "").trim()).filter(Boolean)),
  ).slice(0, max);
}

function exactMajorUnitTextFromMinor(value: number) {
  if (!Number.isSafeInteger(value)) {
    throw new CarrierNetworkError(
      "carrier_money_minor_units_invalid",
      "Carrier money must be a safe integer number of minor units",
      400,
    );
  }
  const exact = BigInt(value);
  const negative = exact < 0n;
  const magnitude = negative ? -exact : exact;
  const whole = magnitude / 100n;
  const fraction = (magnitude % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

function assertNoCredentialMaterial(value: unknown, path = "evidence") {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoCredentialMaterial(item, `${path}[${index}]`));
    return;
  }
  for (const [key, child] of Object.entries(value as JsonRecord)) {
    if (
      /(?:password|passwd|secret|access.?token|refresh.?token|authorization|cookie|private.?key|api.?key)/i.test(
        key,
      )
    ) {
      throw new CarrierNetworkError(
        "carrier_credentials_forbidden",
        `${path} must not contain credentials (${key})`,
        400,
      );
    }
    assertNoCredentialMaterial(child, `${path}.${key}`);
  }
}

function safeRecord(value: unknown, field: string) {
  const record = asRecord(value);
  assertNoCredentialMaterial(record, field);
  return record;
}

function safeEvidenceArray(value: unknown, field: string) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 40).map((item, index) => safeRecord(item, `${field}[${index}]`));
}

function countryCode(value: unknown, field: string) {
  const normalized = String(value || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) {
    throw new CarrierNetworkError("carrier_country_invalid", `${field} must be a two-letter country code`, 400);
  }
  return normalized;
}

function currencyCode(value: unknown) {
  const normalized = String(value || "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new CarrierNetworkError("carrier_currency_invalid", "currencyCode must contain three letters", 400);
  }
  return normalized;
}

function positiveInteger(value: unknown, field: string, allowZero = false) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || (!allowZero && parsed === 0)) {
    throw new CarrierNetworkError(
      "carrier_amount_invalid",
      `${field} must be ${allowZero ? "a non-negative" : "a positive"} integer`,
      400,
    );
  }
  return parsed;
}

function optionalPositiveNumber(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new CarrierNetworkError("carrier_measurement_invalid", `${field} must be positive`, 400);
  }
  return parsed;
}

function optionalNonNegativeInteger(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") return null;
  return positiveInteger(value, field, true);
}

function parseDate(value: unknown, field: string, required = false) {
  if (value === undefined || value === null || value === "") {
    if (required) throw new CarrierNetworkError("carrier_date_required", `${field} is required`, 400);
    return null;
  }
  const parsed = new Date(String(value));
  if (!Number.isFinite(parsed.getTime())) {
    throw new CarrierNetworkError("carrier_date_invalid", `${field} must be a valid date`, 400);
  }
  return parsed;
}

function idempotencyKey(value: unknown) {
  const normalized = boundedText(value, "idempotencyKey", 180);
  if (normalized.length < 8) {
    throw new CarrierNetworkError(
      "carrier_idempotency_key_short",
      "idempotencyKey must contain at least eight characters",
      400,
    );
  }
  return normalized;
}

function referenceCode(tenantId: number, input: string) {
  const normalized = String(input || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  if (normalized) return normalized;
  return `CAR-${tenantId}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

function routeAddress(value: unknown, field: string): CarrierRouteAddress {
  const record = safeRecord(value, field);
  return {
    countryCode: countryCode(record.countryCode, `${field}.countryCode`),
    city: optionalText(record.city, 120),
    territoryId:
      record.territoryId === undefined || record.territoryId === null
        ? null
        : positiveInteger(record.territoryId, `${field}.territoryId`),
    postalCode: optionalText(record.postalCode, 40),
    addressLine: optionalText(record.addressLine, 400),
    latitude:
      record.latitude === undefined || record.latitude === null
        ? null
        : Number(record.latitude),
    longitude:
      record.longitude === undefined || record.longitude === null
        ? null
        : Number(record.longitude),
  };
}

function cargo(value: unknown): CarrierCargo {
  const record = safeRecord(value, "cargo");
  const declaredValueMinor = optionalNonNegativeInteger(
    record.declaredValueMinor,
    "cargo.declaredValueMinor",
  );
  const currency = record.currencyCode ? currencyCode(record.currencyCode) : null;
  return {
    description: boundedText(record.description, "cargo.description", 600),
    productCategory: optionalText(record.productCategory, 120),
    quantity: optionalPositiveNumber(record.quantity, "cargo.quantity"),
    unit: optionalText(record.unit, 40),
    weightKg: optionalPositiveNumber(record.weightKg, "cargo.weightKg"),
    volumeM3: optionalPositiveNumber(record.volumeM3, "cargo.volumeM3"),
    declaredValueMinor,
    currencyCode: currency,
    hazardousGoods: record.hazardousGoods === true,
    coldChainRequired: record.coldChainRequired === true,
    fragile: record.fragile === true,
    packages: Array.isArray(record.packages)
      ? record.packages.slice(0, 100).map((item, index) => {
          const parcel = safeRecord(item, `cargo.packages[${index}]`);
          return {
            count: positiveInteger(parcel.count, `cargo.packages[${index}].count`),
            weightKg: optionalPositiveNumber(parcel.weightKg, `cargo.packages[${index}].weightKg`),
            lengthCm: optionalPositiveNumber(parcel.lengthCm, `cargo.packages[${index}].lengthCm`),
            widthCm: optionalPositiveNumber(parcel.widthCm, `cargo.packages[${index}].widthCm`),
            heightCm: optionalPositiveNumber(parcel.heightCm, `cargo.packages[${index}].heightCm`),
          };
        })
      : [],
  };
}

async function governedAction<T>(input: {
  tenantId: number;
  actorUserId: number | null;
  actionKey: string;
  correlationId: string;
  payload: JsonRecord;
  work: (actionRunId: number) => Promise<T>;
  evidence: (result: T) => Array<{ evidenceType: string; payload: JsonRecord }>;
}) {
  const run = await createActionRun({
    tenantId: input.tenantId,
    actionKey: input.actionKey,
    requestedByUserId: input.actorUserId,
    correlationId: input.correlationId,
    payload: input.payload,
  });
  try {
    const result = await input.work(run.id);
    await completeRunSuccess({
      tenantId: input.tenantId,
      runId: run.id,
      enforceEvidence: true,
      result: { actionKey: input.actionKey, externalProviderActionExecuted: false },
      evidence: input.evidence(result),
    });
    return { result, actionRunId: run.id };
  } catch (error: any) {
    await completeRunFailure({
      tenantId: input.tenantId,
      runId: run.id,
      error: String(error?.message || error),
    });
    throw error;
  }
}

async function advisoryLock(executor: Executor, key: string) {
  await executor.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
}

export async function listCarrierNetwork(tenantId: number) {
  const [
    profiles,
    coverages,
    connectionRows,
    quoteRequests,
    quotes,
    bookings,
    receipts,
    incidents,
  ] =
    await Promise.all([
      db.query.carrierProfiles.findMany({
        where: eq(carrierProfiles.tenantId, tenantId),
        orderBy: [desc(carrierProfiles.updatedAt)],
        limit: 200,
      }),
      db.query.carrierCoverages.findMany({
        where: eq(carrierCoverages.tenantId, tenantId),
        orderBy: [desc(carrierCoverages.updatedAt)],
        limit: 300,
      }),
      db
        .select({
          id: carrierAdapterConnections.id,
          tenantId: carrierAdapterConnections.tenantId,
          carrierProfileId: carrierAdapterConnections.carrierProfileId,
          exportunityIntegrationConnectionId:
            carrierAdapterConnections.exportunityIntegrationConnectionId,
          credentialReference: carrierAdapterConnections.credentialReference,
          provider: carrierAdapterConnections.provider,
          environment: carrierAdapterConnections.environment,
          status: carrierAdapterConnections.status,
          externalAccountReference: carrierAdapterConnections.externalAccountReference,
          capabilities: carrierAdapterConnections.capabilities,
          scopes: carrierAdapterConnections.scopes,
          callbackStatus: carrierAdapterConnections.callbackStatus,
          restrictionStatus: carrierAdapterConnections.restrictionStatus,
          verificationEvidence: carrierAdapterConnections.verificationEvidence,
          lastVerifiedAt: carrierAdapterConnections.lastVerifiedAt,
          updatedAt: carrierAdapterConnections.updatedAt,
        })
        .from(carrierAdapterConnections)
        .where(eq(carrierAdapterConnections.tenantId, tenantId))
        .orderBy(desc(carrierAdapterConnections.updatedAt))
        .limit(200),
      db.query.carrierQuoteRequests.findMany({
        where: eq(carrierQuoteRequests.tenantId, tenantId),
        orderBy: [desc(carrierQuoteRequests.updatedAt)],
        limit: 200,
      }),
      db.query.carrierDeliveryQuotes.findMany({
        where: eq(carrierDeliveryQuotes.tenantId, tenantId),
        orderBy: [desc(carrierDeliveryQuotes.receivedAt)],
        limit: 300,
      }),
      db.query.carrierBookingAuthorizations.findMany({
        where: eq(carrierBookingAuthorizations.tenantId, tenantId),
        orderBy: [desc(carrierBookingAuthorizations.updatedAt)],
        limit: 200,
      }),
      db.query.carrierProviderReceipts.findMany({
        where: eq(carrierProviderReceipts.tenantId, tenantId),
        orderBy: [desc(carrierProviderReceipts.receivedAt)],
        limit: 200,
      }),
      db.query.carrierIncidents.findMany({
        where: eq(carrierIncidents.tenantId, tenantId),
        orderBy: [desc(carrierIncidents.updatedAt)],
        limit: 200,
      }),
    ]);
  const registeredAdapters = listRegisteredCarrierAdapters();
  const releaseConnections = connectionRows.map((connection) => ({
    provider: connection.provider,
    environment: connection.environment,
    status: connection.status,
    restrictionStatus: connection.restrictionStatus,
    callbackStatus: connection.callbackStatus,
    capabilities: connection.capabilities,
    verificationEvidence: connection.verificationEvidence,
    lastVerifiedAt: connection.lastVerifiedAt,
    credentialReferencePresent: Boolean(connection.credentialReference),
    exportunityIntegrationConnectionPresent: Boolean(
      connection.exportunityIntegrationConnectionId,
    ),
  }));
  const providerRelease = buildCarrierProviderReleaseState({
    connections: releaseConnections,
    registeredAdapters,
  });
  const connections = connectionRows.map(
    ({ credentialReference, exportunityIntegrationConnectionId, ...connection }) => ({
      ...connection,
      credentialReferencePresent: Boolean(credentialReference),
      exportunityIntegrationConnectionPresent: Boolean(
        exportunityIntegrationConnectionId,
      ),
    }),
  );
  const readiness = profiles.map((profile) => ({
    carrierProfileId: profile.id,
    ...evaluateCarrierProfileReadiness({ tenantId, profile }),
  }));
  return {
    profiles,
    coverages,
    connections,
    quoteRequests,
    quotes,
    bookings,
    providerReceipts: receipts,
    incidents,
    readiness,
    registeredAdapters,
    providerRelease,
    controls: {
      ...providerRelease.controls,
      credentialsExposed: false,
      candidateCarriersArePartners: false,
    },
  };
}

export async function recordCarrierCandidate(input: {
  tenantId: number;
  actorUserId: number | null;
  referenceCode?: unknown;
  legalName: unknown;
  displayName?: unknown;
  carrierType: unknown;
  providerCode?: unknown;
  headquartersCountryCode?: unknown;
  websiteUrl?: unknown;
  supportEmail?: unknown;
  supportPhone?: unknown;
  operatingCountryCodes?: unknown;
  transportModes?: unknown;
  capabilities?: unknown;
  commodityCategories?: unknown;
  contactDetails?: unknown;
  sourceProvenance: unknown;
}) {
  const legalName = boundedText(input.legalName, "legalName", 240);
  const sourceProvenance = safeRecord(input.sourceProvenance, "sourceProvenance");
  const preciseSource = String(
    sourceProvenance.sourceUrl || sourceProvenance.reference || "",
  ).trim();
  if (!preciseSource) {
    throw new CarrierNetworkError(
      "carrier_source_required",
      "A precise source URL or reference is required for a discovered carrier",
      400,
    );
  }
  const code = referenceCode(input.tenantId, String(input.referenceCode || legalName));
  const governed = await governedAction({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    actionKey: "CARRIER_PROFILE_RECORD",
    correlationId: `carrier-profile:${code}`,
    payload: { referenceCode: code, legalName, confirmed: true },
    work: async (actionRunId) => {
      const [profile] = await db
        .insert(carrierProfiles)
        .values({
          tenantId: input.tenantId,
          referenceCode: code,
          legalName,
          displayName: optionalText(input.displayName, 240) || legalName,
          carrierType: boundedText(input.carrierType, "carrierType", 80).toLowerCase(),
          status: "discovered",
          verificationStatus: "unverified",
          partnershipStatus: "candidate",
          providerCode: optionalText(input.providerCode, 80)?.toLowerCase() || null,
          headquartersCountryCode: input.headquartersCountryCode
            ? countryCode(input.headquartersCountryCode, "headquartersCountryCode")
            : null,
          websiteUrl: optionalText(input.websiteUrl, 500),
          supportEmail: optionalText(input.supportEmail, 240),
          supportPhone: optionalText(input.supportPhone, 80),
          operatingCountryCodes: stringArray(input.operatingCountryCodes).map((item) =>
            countryCode(item, "operatingCountryCodes"),
          ),
          transportModes: stringArray(input.transportModes),
          capabilities: stringArray(input.capabilities),
          commodityCategories: stringArray(input.commodityCategories),
          contactDetails: safeRecord(input.contactDetails, "contactDetails"),
          sourceProvenance,
          verificationEvidence: {},
          restrictionStatus: "none",
          riskFlags: [],
          createdByUserId: input.actorUserId,
          updatedByUserId: input.actorUserId,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [carrierProfiles.tenantId, carrierProfiles.referenceCode],
          set: {
            legalName,
            displayName: optionalText(input.displayName, 240) || legalName,
            carrierType: boundedText(input.carrierType, "carrierType", 80).toLowerCase(),
            providerCode: optionalText(input.providerCode, 80)?.toLowerCase() || null,
            websiteUrl: optionalText(input.websiteUrl, 500),
            supportEmail: optionalText(input.supportEmail, 240),
            supportPhone: optionalText(input.supportPhone, 80),
            operatingCountryCodes: stringArray(input.operatingCountryCodes).map((item) =>
              countryCode(item, "operatingCountryCodes"),
            ),
            transportModes: stringArray(input.transportModes),
            capabilities: stringArray(input.capabilities),
            commodityCategories: stringArray(input.commodityCategories),
            contactDetails: safeRecord(input.contactDetails, "contactDetails"),
            sourceProvenance,
            updatedByUserId: input.actorUserId,
            updatedAt: new Date(),
          },
        })
        .returning();
      await db.insert(industrialAuditLogs).values({
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        action: "carrier.profile_recorded",
        entityType: "carrier_profile",
        entityId: profile.id,
        reason: "Recorded a source-backed carrier candidate without partner or verification claims.",
        nextValue: {
          referenceCode: code,
          status: profile.status,
          partnershipStatus: profile.partnershipStatus,
        },
        metadata: { actionRunId, externalProviderActionExecuted: false },
      });
      return profile;
    },
    evidence: (profile) => [
      {
        evidenceType: "carrier_candidate_source",
        payload: {
          carrierProfileId: profile.id,
          sourceReference: preciseSource,
          status: profile.status,
          partnershipStatus: profile.partnershipStatus,
        },
      },
    ],
  });
  return {
    profile: governed.result,
    actionRunId: governed.actionRunId,
    externalProviderActionExecuted: false,
  };
}

export async function verifyCarrierProfile(input: {
  tenantId: number;
  actorUserId: number | null;
  carrierProfileId: string;
  verificationStatus: unknown;
  partnershipStatus: unknown;
  verificationExpiresAt?: unknown;
  insuranceEvidence?: unknown;
  complianceEvidence?: unknown;
  verificationEvidence: unknown;
  rationale: unknown;
  confirmed: boolean;
}) {
  if (input.confirmed !== true || !input.actorUserId) {
    throw new CarrierNetworkError(
      "carrier_human_verification_required",
      "An authenticated human confirmation is required",
      400,
    );
  }
  const verificationStatus = boundedText(
    input.verificationStatus,
    "verificationStatus",
    80,
  ) as (typeof CARRIER_VERIFICATION_STATUSES)[number];
  const partnershipStatus = boundedText(
    input.partnershipStatus,
    "partnershipStatus",
    80,
  ) as (typeof CARRIER_PARTNERSHIP_STATUSES)[number];
  if (!CARRIER_VERIFICATION_STATUSES.includes(verificationStatus) || verificationStatus === "unverified") {
    throw new CarrierNetworkError(
      "carrier_verification_status_invalid",
      "A verified carrier state is required",
      400,
    );
  }
  if (!CARRIER_PARTNERSHIP_STATUSES.includes(partnershipStatus)) {
    throw new CarrierNetworkError(
      "carrier_partnership_status_invalid",
      "partnershipStatus is invalid",
      400,
    );
  }
  const evidence = sanitizeCarrierVerificationEvidence(input.verificationEvidence);
  if (partnershipStatus === "contracted_partner" && !evidence.contractReference) {
    throw new CarrierNetworkError(
      "carrier_contract_reference_required",
      "A contract reference is required before calling a carrier a contracted partner",
      400,
    );
  }
  const rationale = boundedText(input.rationale, "rationale", 1200);
  const expiresAt = parseDate(input.verificationExpiresAt, "verificationExpiresAt");
  const nextStatus =
    partnershipStatus === "contracted_partner"
      ? "contracted"
      : partnershipStatus === "internal_network"
        ? "active"
        : "verified";
  const governed = await governedAction({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    actionKey: "CARRIER_PROFILE_VERIFY",
    correlationId: `carrier-profile-verification:${input.carrierProfileId}`,
    payload: {
      carrierProfileId: input.carrierProfileId,
      verificationStatus,
      partnershipStatus,
      confirmed: true,
    },
    work: async (actionRunId) => {
      const [current] = await db
        .select()
        .from(carrierProfiles)
        .where(
          and(
            eq(carrierProfiles.tenantId, input.tenantId),
            eq(carrierProfiles.id, input.carrierProfileId),
          ),
        )
        .limit(1);
      if (!current) {
        throw new CarrierNetworkError("carrier_profile_not_found", "Carrier profile not found", 404);
      }
      const now = new Date();
      const [profile] = await db
        .update(carrierProfiles)
        .set({
          status: nextStatus,
          verificationStatus,
          partnershipStatus,
          insuranceEvidence: safeRecord(input.insuranceEvidence, "insuranceEvidence"),
          complianceEvidence: safeRecord(input.complianceEvidence, "complianceEvidence"),
          verificationEvidence: evidence,
          lastVerifiedAt: new Date(evidence.verifiedAt),
          verificationExpiresAt: expiresAt,
          verifiedByUserId: input.actorUserId,
          updatedByUserId: input.actorUserId,
          updatedAt: now,
        })
        .where(
          and(
            eq(carrierProfiles.tenantId, input.tenantId),
            eq(carrierProfiles.id, input.carrierProfileId),
          ),
        )
        .returning();
      await db.insert(industrialAuditLogs).values({
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        action: "carrier.profile_verified",
        entityType: "carrier_profile",
        entityId: profile.id,
        reason: rationale,
        previousValue: {
          status: current.status,
          verificationStatus: current.verificationStatus,
          partnershipStatus: current.partnershipStatus,
        },
        nextValue: { status: profile.status, verificationStatus, partnershipStatus },
        metadata: { actionRunId, evidence, externalProviderActionExecuted: false },
      });
      return profile;
    },
    evidence: (profile) => [
      {
        evidenceType: "carrier_verification",
        payload: {
          carrierProfileId: profile.id,
          verificationStatus,
          partnershipStatus,
          evidence,
          rationale,
        },
      },
    ],
  });
  return { profile: governed.result, actionRunId: governed.actionRunId };
}

export async function recordCarrierCoverage(input: {
  tenantId: number;
  actorUserId: number | null;
  carrierProfileId: string;
  idempotencyKey: unknown;
  originTerritoryId?: number | null;
  destinationTerritoryId?: number | null;
  originCountryCode: unknown;
  destinationCountryCode: unknown;
  serviceType: unknown;
  transportMode: unknown;
  serviceLevel?: unknown;
  productCategory?: unknown;
  vehicleTypes?: unknown;
  capabilities?: unknown;
  maxWeightKg?: unknown;
  maxVolumeM3?: unknown;
  minimumTransitDays?: unknown;
  maximumTransitDays?: unknown;
  hazardousGoodsSupported?: boolean;
  coldChainSupported?: boolean;
  customsSupported?: boolean;
  insuranceSupported?: boolean;
  status?: unknown;
  evidence?: unknown;
  sourceReference?: unknown;
  validUntil?: unknown;
}) {
  const key = idempotencyKey(input.idempotencyKey);
  const serviceType = boundedText(input.serviceType, "serviceType", 40) as
    (typeof CARRIER_SERVICE_TYPES)[number];
  if (!CARRIER_SERVICE_TYPES.includes(serviceType)) {
    throw new CarrierNetworkError("carrier_service_type_invalid", "serviceType is invalid", 400);
  }
  const status = boundedText(input.status || "candidate", "status", 40) as
    (typeof CARRIER_COVERAGE_STATUSES)[number];
  if (!CARRIER_COVERAGE_STATUSES.includes(status)) {
    throw new CarrierNetworkError("carrier_coverage_status_invalid", "Coverage status is invalid", 400);
  }
  if (["verified", "active"].includes(status) && !input.actorUserId) {
    throw new CarrierNetworkError(
      "carrier_coverage_verifier_required",
      "Verified coverage requires an authenticated verifier",
      400,
    );
  }
  const evidence = safeEvidenceArray(input.evidence, "coverageEvidence");
  const sourceReference = optionalText(input.sourceReference, 500);
  if (["verified", "active"].includes(status) && (!evidence.length || !sourceReference)) {
    throw new CarrierNetworkError(
      "carrier_coverage_evidence_required",
      "Verified coverage requires evidence and a precise source reference",
      400,
    );
  }
  const profile = await db.query.carrierProfiles.findFirst({
    where: and(
      eq(carrierProfiles.tenantId, input.tenantId),
      eq(carrierProfiles.id, input.carrierProfileId),
    ),
  });
  if (!profile) throw new CarrierNetworkError("carrier_profile_not_found", "Carrier profile not found", 404);
  if (["verified", "active"].includes(status)) {
    const readiness = evaluateCarrierProfileReadiness({ tenantId: input.tenantId, profile });
    if (!readiness.ready) {
      throw new CarrierNetworkError(
        "carrier_profile_not_ready",
        `Carrier profile is not ready: ${readiness.blockers.join(", ")}`,
      );
    }
  }
  const governed = await governedAction({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    actionKey: "CARRIER_COVERAGE_RECORD",
    correlationId: `carrier-coverage:${key}`,
    payload: { carrierProfileId: input.carrierProfileId, idempotencyKey: key, serviceType, status },
    work: async (actionRunId) => {
      const now = new Date();
      const [coverage] = await db
        .insert(carrierCoverages)
        .values({
          tenantId: input.tenantId,
          carrierProfileId: input.carrierProfileId,
          idempotencyKey: key,
          originTerritoryId: input.originTerritoryId || null,
          destinationTerritoryId: input.destinationTerritoryId || null,
          originCountryCode: countryCode(input.originCountryCode, "originCountryCode"),
          destinationCountryCode: countryCode(
            input.destinationCountryCode,
            "destinationCountryCode",
          ),
          serviceType,
          transportMode: boundedText(input.transportMode, "transportMode", 80).toLowerCase(),
          serviceLevel: optionalText(input.serviceLevel, 120),
          productCategory: optionalText(input.productCategory, 120),
          vehicleTypes: stringArray(input.vehicleTypes),
          capabilities: stringArray(input.capabilities),
          maxWeightKg:
            optionalPositiveNumber(input.maxWeightKg, "maxWeightKg")?.toString() || null,
          maxVolumeM3:
            optionalPositiveNumber(input.maxVolumeM3, "maxVolumeM3")?.toString() || null,
          minimumTransitDays: optionalNonNegativeInteger(
            input.minimumTransitDays,
            "minimumTransitDays",
          ),
          maximumTransitDays: optionalNonNegativeInteger(
            input.maximumTransitDays,
            "maximumTransitDays",
          ),
          hazardousGoodsSupported: input.hazardousGoodsSupported === true,
          coldChainSupported: input.coldChainSupported === true,
          customsSupported: input.customsSupported === true,
          insuranceSupported: input.insuranceSupported === true,
          status,
          evidence,
          sourceReference,
          lastVerifiedAt: ["verified", "active"].includes(status) ? now : null,
          validUntil: parseDate(input.validUntil, "validUntil"),
          verifiedByUserId: ["verified", "active"].includes(status)
            ? input.actorUserId
            : null,
          createdByUserId: input.actorUserId,
          updatedByUserId: input.actorUserId,
          metadata: { externalServiceabilityCheckExecuted: false },
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [carrierCoverages.tenantId, carrierCoverages.idempotencyKey],
          set: {
            status,
            evidence,
            sourceReference,
            lastVerifiedAt: ["verified", "active"].includes(status) ? now : null,
            validUntil: parseDate(input.validUntil, "validUntil"),
            verifiedByUserId: ["verified", "active"].includes(status)
              ? input.actorUserId
              : null,
            updatedByUserId: input.actorUserId,
            updatedAt: now,
          },
        })
        .returning();
      await db.insert(industrialAuditLogs).values({
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        action: "carrier.coverage_recorded",
        entityType: "carrier_coverage",
        entityId: coverage.id,
        reason: `Recorded ${status} carrier coverage without external serviceability execution.`,
        nextValue: {
          carrierProfileId: input.carrierProfileId,
          originCountryCode: coverage.originCountryCode,
          destinationCountryCode: coverage.destinationCountryCode,
          status,
        },
        metadata: { actionRunId, externalProviderActionExecuted: false },
      });
      return coverage;
    },
    evidence: (coverage) => [
      {
        evidenceType: "carrier_coverage",
        payload: {
          carrierCoverageId: coverage.id,
          carrierProfileId: coverage.carrierProfileId,
          status: coverage.status,
          sourceReference,
          evidenceCount: evidence.length,
        },
      },
    ],
  });
  return { coverage: governed.result, actionRunId: governed.actionRunId };
}

export async function recordCarrierConnectionVerification(input: {
  tenantId: number;
  actorUserId: number | null;
  carrierProfileId: string;
  exportunityIntegrationConnectionId?: string | null;
  provider: unknown;
  environment?: unknown;
  externalAccountReference?: unknown;
  credentialReference?: unknown;
  capabilities?: unknown;
  scopes?: unknown;
  callbackStatus?: unknown;
  restrictionStatus?: unknown;
  verificationEvidence: unknown;
  confirmed: boolean;
}) {
  if (input.confirmed !== true || !input.actorUserId) {
    throw new CarrierNetworkError(
      "carrier_connection_confirmation_required",
      "An authenticated human verification is required",
      400,
    );
  }
  const provider = boundedText(input.provider, "provider", 80).toLowerCase();
  const environment = boundedText(input.environment || "production", "environment", 20).toLowerCase();
  if (!["sandbox", "test", "production"].includes(environment)) {
    throw new CarrierNetworkError(
      "carrier_connection_environment_invalid",
      "environment must be sandbox, test, or production",
      400,
    );
  }
  const credentialReference = optionalText(input.credentialReference, 240);
  if (!input.exportunityIntegrationConnectionId && !credentialReference) {
    throw new CarrierNetworkError(
      "carrier_credential_reference_required",
      "Reference an Exportunity-native integration connection or secret-manager entry; do not submit the secret value",
      400,
    );
  }
  const evidence = sanitizeCarrierVerificationEvidence(input.verificationEvidence);
  const restrictionStatus = boundedText(
    input.restrictionStatus || "none",
    "restrictionStatus",
    80,
  ).toLowerCase();
  const callbackStatus = boundedText(
    input.callbackStatus || "not_configured",
    "callbackStatus",
    80,
  ).toLowerCase();
  const capabilities = stringArray(input.capabilities);
  if (!capabilities.includes("connection_check")) capabilities.unshift("connection_check");
  const [profile, integration] = await Promise.all([
    db.query.carrierProfiles.findFirst({
      where: and(
        eq(carrierProfiles.tenantId, input.tenantId),
        eq(carrierProfiles.id, input.carrierProfileId),
      ),
    }),
    input.exportunityIntegrationConnectionId
      ? db
          .select({
            id: exportunityIntegrationConnections.id,
            tenantId: exportunityIntegrationConnections.tenantId,
            provider: exportunityIntegrationConnections.provider,
            status: exportunityIntegrationConnections.status,
            revokedAt: exportunityIntegrationConnections.revokedAt,
          })
          .from(exportunityIntegrationConnections)
          .where(
            and(
              eq(exportunityIntegrationConnections.tenantId, input.tenantId),
              eq(
                exportunityIntegrationConnections.id,
                input.exportunityIntegrationConnectionId,
              ),
            ),
          )
          .limit(1)
          .then((rows) => rows[0] || null)
      : Promise.resolve(null),
  ]);
  if (!profile) throw new CarrierNetworkError("carrier_profile_not_found", "Carrier profile not found", 404);
  const profileReadiness = evaluateCarrierProfileReadiness({ tenantId: input.tenantId, profile });
  if (!profileReadiness.ready) {
    throw new CarrierNetworkError(
      "carrier_profile_not_ready",
      `Carrier profile is not ready: ${profileReadiness.blockers.join(", ")}`,
    );
  }
  if (input.exportunityIntegrationConnectionId && !integration) {
    throw new CarrierNetworkError(
      "carrier_integration_connection_invalid",
      "Exportunity integration connection is missing or belongs to another tenant",
      404,
    );
  }
  if (
    integration &&
    (integration.status !== "connected" ||
      integration.revokedAt ||
      integration.provider.toLowerCase() !== provider)
  ) {
    throw new CarrierNetworkError(
      "carrier_integration_connection_not_ready",
      "The Exportunity integration connection is revoked, disconnected, or belongs to another provider",
    );
  }
  const status = restrictionStatus === "none" ? "verified" : "restricted";
  const governed = await governedAction({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    actionKey: "CARRIER_CONNECTION_VERIFY",
    correlationId: `carrier-connection:${input.carrierProfileId}:${provider}:${environment}`,
    payload: {
      carrierProfileId: input.carrierProfileId,
      provider,
      environment,
      confirmed: true,
    },
    work: async (actionRunId) => {
      const now = new Date();
      const [connection] = await db
        .insert(carrierAdapterConnections)
        .values({
          tenantId: input.tenantId,
          carrierProfileId: input.carrierProfileId,
          exportunityIntegrationConnectionId:
            input.exportunityIntegrationConnectionId || null,
          provider,
          environment,
          status: status as "verified" | "restricted",
          externalAccountReference:
            optionalText(input.externalAccountReference, 240) || evidence.externalAccountReference,
          credentialReference,
          capabilities,
          scopes: stringArray(input.scopes),
          callbackStatus,
          restrictionStatus,
          verificationEvidence: evidence,
          lastVerifiedAt: new Date(evidence.verifiedAt),
          verifiedByUserId: input.actorUserId,
          createdByUserId: input.actorUserId,
          updatedByUserId: input.actorUserId,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [
            carrierAdapterConnections.tenantId,
            carrierAdapterConnections.carrierProfileId,
            carrierAdapterConnections.provider,
            carrierAdapterConnections.environment,
          ],
          set: {
            exportunityIntegrationConnectionId:
              input.exportunityIntegrationConnectionId || null,
            status: status as "verified" | "restricted",
            externalAccountReference:
              optionalText(input.externalAccountReference, 240) ||
              evidence.externalAccountReference,
            credentialReference,
            capabilities,
            scopes: stringArray(input.scopes),
            callbackStatus,
            restrictionStatus,
            verificationEvidence: evidence,
            lastVerifiedAt: new Date(evidence.verifiedAt),
            verifiedByUserId: input.actorUserId,
            updatedByUserId: input.actorUserId,
            updatedAt: now,
          },
        })
        .returning();
      await db.insert(industrialAuditLogs).values({
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        action: "carrier.connection_verified",
        entityType: "carrier_adapter_connection",
        entityId: connection.id,
        reason: "Recorded non-secret adapter readiness evidence; no provider call was executed.",
        nextValue: {
          carrierProfileId: input.carrierProfileId,
          provider,
          environment,
          status: connection.status,
          capabilities,
          callbackStatus,
        },
        metadata: {
          actionRunId,
          credentialsExcluded: true,
          externalProviderActionExecuted: false,
        },
      });
      return connection;
    },
    evidence: (connection) => [
      {
        evidenceType: "carrier_connection_verification",
        payload: {
          connectionId: connection.id,
          carrierProfileId: input.carrierProfileId,
          provider,
          environment,
          status: connection.status,
          capabilities,
          callbackStatus,
          credentialsExcluded: true,
        },
      },
    ],
  });
  const connection = governed.result;
  return {
    connection: {
      id: connection.id,
      carrierProfileId: connection.carrierProfileId,
      provider: connection.provider,
      environment: connection.environment,
      status: connection.status,
      capabilities: connection.capabilities,
      callbackStatus: connection.callbackStatus,
      restrictionStatus: connection.restrictionStatus,
      lastVerifiedAt: connection.lastVerifiedAt,
    },
    actionRunId: governed.actionRunId,
    credentialsExposed: false,
    externalProviderActionExecuted: false,
  };
}

export async function prepareCarrierQuoteRequest(input: {
  tenantId: number;
  actorUserId: number | null;
  industrialOrderId: string;
  idempotencyKey: unknown;
  serviceType: unknown;
  origin: unknown;
  destination: unknown;
  cargo: unknown;
  incoterm?: unknown;
  requestedPickupAt?: unknown;
  requiredDeliveryAt?: unknown;
  requiredCapabilities?: unknown;
  transportMode?: unknown;
}) {
  const key = idempotencyKey(input.idempotencyKey);
  const existing = await db.query.carrierQuoteRequests.findFirst({
    where: and(
      eq(carrierQuoteRequests.tenantId, input.tenantId),
      eq(carrierQuoteRequests.idempotencyKey, key),
    ),
  });
  if (existing) {
    return {
      quoteRequest: existing,
      idempotentReplay: true,
      providerRequestExecuted: existing.providerRequestExecuted,
    };
  }
  const serviceType = boundedText(input.serviceType, "serviceType", 40) as
    (typeof CARRIER_SERVICE_TYPES)[number];
  const origin = routeAddress(input.origin, "origin");
  const destination = routeAddress(input.destination, "destination");
  const cargoSnapshot = cargo(input.cargo);
  const requiredCapabilities = stringArray(input.requiredCapabilities);
  const validation = validateCarrierQuoteRequest({
    serviceType,
    origin,
    destination,
    cargo: cargoSnapshot,
    requiredCapabilities,
  });
  if (!validation.valid) {
    throw new CarrierNetworkError(
      "carrier_quote_request_invalid",
      `Carrier quote request is incomplete: ${validation.blockers.join(", ")}`,
      400,
    );
  }
  const order = await db.query.industrialOrders.findFirst({
    where: and(
      eq(industrialOrders.tenantId, input.tenantId),
      eq(industrialOrders.id, input.industrialOrderId),
    ),
  });
  if (!order) throw new CarrierNetworkError("industrial_order_not_found", "Industrial order not found", 404);
  const fulfillment = await db.query.industrialFulfillmentPlans.findFirst({
    where: and(
      eq(industrialFulfillmentPlans.tenantId, input.tenantId),
      eq(industrialFulfillmentPlans.orderId, order.id),
    ),
  });
  const service = fulfillment
    ? await db.query.industrialFulfillmentServices.findFirst({
        where: and(
          eq(industrialFulfillmentServices.tenantId, input.tenantId),
          eq(industrialFulfillmentServices.planId, fulfillment.id),
          eq(industrialFulfillmentServices.serviceType, serviceType),
        ),
      })
    : null;
  const coverageRows = await db.query.carrierCoverages.findMany({
    where: and(
      eq(carrierCoverages.tenantId, input.tenantId),
      eq(carrierCoverages.originCountryCode, origin.countryCode),
      eq(carrierCoverages.destinationCountryCode, destination.countryCode),
      eq(carrierCoverages.serviceType, serviceType),
      inArray(carrierCoverages.status, ["verified", "active"]),
    ),
    orderBy: [desc(carrierCoverages.lastVerifiedAt)],
    limit: 100,
  });
  const carrierIds = Array.from(new Set(coverageRows.map((coverage) => coverage.carrierProfileId)));
  const [profiles, connections] = await Promise.all([
    carrierIds.length
      ? db.query.carrierProfiles.findMany({
          where: and(
            eq(carrierProfiles.tenantId, input.tenantId),
            inArray(carrierProfiles.id, carrierIds),
          ),
        })
      : Promise.resolve([]),
    carrierIds.length
      ? db.query.carrierAdapterConnections.findMany({
          where: and(
            eq(carrierAdapterConnections.tenantId, input.tenantId),
            inArray(carrierAdapterConnections.carrierProfileId, carrierIds),
          ),
        })
      : Promise.resolve([]),
  ]);
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const matchedCoverageIds = coverageRows
    .filter((coverage) => {
      const profile = profileById.get(coverage.carrierProfileId);
      if (!profile) return false;
      const profileReady = evaluateCarrierProfileReadiness({ tenantId: input.tenantId, profile });
      if (!profileReady.ready) return false;
      return evaluateCarrierCoverageMatch({
        tenantId: input.tenantId,
        carrierProfileId: profile.id,
        coverage,
        serviceType,
        origin,
        destination,
        cargo: cargoSnapshot,
        transportMode: optionalText(input.transportMode, 80),
        requiredCapabilities,
      }).matched;
    })
    .map((coverage) => coverage.id);
  const matchedCarrierIds = new Set(
    coverageRows
      .filter((coverage) => matchedCoverageIds.includes(coverage.id))
      .map((coverage) => coverage.carrierProfileId),
  );
  const readyConnections = connections.filter(
    (connection) =>
      matchedCarrierIds.has(connection.carrierProfileId) &&
      evaluateCarrierConnectionReadiness({
        tenantId: input.tenantId,
        connection,
        requiredCapability: "quote_request",
      }).ready,
  );
  const status = readyConnections.length ? "submission_ready" : "manual_required";
  const manualPackage = buildManualCarrierQuotePackage({
    quoteRequestId: `pending:${key}`,
    serviceType,
    origin,
    destination,
    cargo: cargoSnapshot,
    requiredCapabilities,
    incoterm: optionalText(input.incoterm, 40),
  });
  const governed = await governedAction({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    actionKey: "DELIVERY_QUOTE_PREPARE",
    correlationId: `carrier-quote-request:${key}`,
    payload: {
      industrialOrderId: order.id,
      idempotencyKey: key,
      serviceType,
      confirmed: true,
    },
    work: async (actionRunId) => {
      const [request] = await db
        .insert(carrierQuoteRequests)
        .values({
          tenantId: input.tenantId,
          industrialOrderId: order.id,
          fulfillmentPlanId: fulfillment?.id || null,
          fulfillmentServiceId: service?.id || null,
          idempotencyKey: key,
          serviceType,
          status,
          originSnapshot: origin,
          destinationSnapshot: destination,
          cargoSnapshot,
          incoterm: optionalText(input.incoterm, 40),
          requestedPickupAt: parseDate(input.requestedPickupAt, "requestedPickupAt"),
          requiredDeliveryAt: parseDate(input.requiredDeliveryAt, "requiredDeliveryAt"),
          requiredCapabilities,
          matchedCoverageIds,
          manualPackage,
          preparationActionRunId: actionRunId,
          preparedByUserId: input.actorUserId,
          providerRequestExecuted: false,
          providerRequestReceipt: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      const packageWithId = buildManualCarrierQuotePackage({
        quoteRequestId: request.id,
        serviceType,
        origin,
        destination,
        cargo: cargoSnapshot,
        requiredCapabilities,
        incoterm: optionalText(input.incoterm, 40),
      });
      const [updated] = await db
        .update(carrierQuoteRequests)
        .set({ manualPackage: packageWithId, updatedAt: new Date() })
        .where(eq(carrierQuoteRequests.id, request.id))
        .returning();
      await db.insert(industrialAuditLogs).values({
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        action: "delivery.quote_prepared",
        entityType: "carrier_quote_request",
        entityId: request.id,
        reason:
          status === "submission_ready"
            ? "Prepared an adapter-ready carrier quote request; provider submission remains disabled."
            : "Prepared a complete manual carrier quote package; it was not sent.",
        nextValue: {
          orderId: order.id,
          serviceType,
          status,
          matchedCoverageIds,
          readyConnectionCount: readyConnections.length,
        },
        metadata: {
          actionRunId,
          providerRequestExecuted: false,
          externalBookingExecuted: false,
        },
      });
      return updated;
    },
    evidence: (request) => [
      {
        evidenceType: "carrier_quote_request",
        payload: {
          quoteRequestId: request.id,
          industrialOrderId: request.industrialOrderId,
          status: request.status,
          matchedCoverageIds,
          providerRequestExecuted: false,
        },
      },
    ],
  });
  return {
    quoteRequest: governed.result,
    actionRunId: governed.actionRunId,
    idempotentReplay: false,
    providerRequestExecuted: false,
    externalBookingExecuted: false,
  };
}

export async function recordVerifiedCarrierQuote(input: {
  tenantId: number;
  actorUserId: number | null;
  quoteRequestId: string;
  carrierProfileId: string;
  carrierCoverageId?: string | null;
  adapterConnectionId?: string | null;
  idempotencyKey: unknown;
  sourceType: unknown;
  providerQuoteReference?: unknown;
  totalCostMinor: unknown;
  customerPriceMinor?: unknown;
  currencyCode: unknown;
  costBreakdown?: unknown;
  minimumTransitDays?: unknown;
  maximumTransitDays?: unknown;
  pickupWindowStart?: unknown;
  pickupWindowEnd?: unknown;
  estimatedDeliveryAt?: unknown;
  validUntil: unknown;
  terms?: unknown;
  evidence: unknown;
  confirmed: boolean;
}) {
  if (input.confirmed !== true || !input.actorUserId) {
    throw new CarrierNetworkError(
      "carrier_quote_verification_required",
      "An authenticated human confirmation is required to record a verified quote",
      400,
    );
  }
  const key = idempotencyKey(input.idempotencyKey);
  const sourceType = boundedText(input.sourceType, "sourceType", 40) as
    (typeof CARRIER_QUOTE_SOURCE_TYPES)[number];
  if (!CARRIER_QUOTE_SOURCE_TYPES.includes(sourceType)) {
    throw new CarrierNetworkError("carrier_quote_source_invalid", "sourceType is invalid", 400);
  }
  const totalCostMinor = positiveInteger(input.totalCostMinor, "totalCostMinor", true);
  const customerPriceMinor = optionalNonNegativeInteger(
    input.customerPriceMinor,
    "customerPriceMinor",
  );
  const code = currencyCode(input.currencyCode);
  const evidence = safeEvidenceArray(input.evidence, "quoteEvidence");
  const validUntil = parseDate(input.validUntil, "validUntil", true)!;
  const [request, profile, coverage, connection] = await Promise.all([
    db.query.carrierQuoteRequests.findFirst({
      where: and(
        eq(carrierQuoteRequests.tenantId, input.tenantId),
        eq(carrierQuoteRequests.id, input.quoteRequestId),
      ),
    }),
    db.query.carrierProfiles.findFirst({
      where: and(
        eq(carrierProfiles.tenantId, input.tenantId),
        eq(carrierProfiles.id, input.carrierProfileId),
      ),
    }),
    input.carrierCoverageId
      ? db.query.carrierCoverages.findFirst({
          where: and(
            eq(carrierCoverages.tenantId, input.tenantId),
            eq(carrierCoverages.id, input.carrierCoverageId),
            eq(carrierCoverages.carrierProfileId, input.carrierProfileId),
          ),
        })
      : Promise.resolve(null),
    input.adapterConnectionId
      ? db.query.carrierAdapterConnections.findFirst({
          where: and(
            eq(carrierAdapterConnections.tenantId, input.tenantId),
            eq(carrierAdapterConnections.id, input.adapterConnectionId),
            eq(carrierAdapterConnections.carrierProfileId, input.carrierProfileId),
          ),
        })
      : Promise.resolve(null),
  ]);
  if (!request) throw new CarrierNetworkError("carrier_quote_request_not_found", "Quote request not found", 404);
  if (!profile) throw new CarrierNetworkError("carrier_profile_not_found", "Carrier profile not found", 404);
  if (input.carrierCoverageId && !coverage) {
    throw new CarrierNetworkError("carrier_coverage_not_found", "Carrier coverage not found", 404);
  }
  if (input.adapterConnectionId && !connection) {
    throw new CarrierNetworkError("carrier_connection_not_found", "Carrier connection not found", 404);
  }
  const quoteReadiness = evaluateCarrierQuoteEvidence({
    tenantId: input.tenantId,
    profile,
    sourceType,
    providerQuoteReference: optionalText(input.providerQuoteReference, 240),
    totalCostMinor,
    customerPriceMinor,
    currencyCode: code,
    validUntil,
    evidence,
  });
  if (!quoteReadiness.verified) {
    throw new CarrierNetworkError(
      "carrier_quote_not_verifiable",
      `Carrier quote is blocked: ${quoteReadiness.blockers.join(", ")}`,
      400,
    );
  }
  const governed = await governedAction({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    actionKey: "DELIVERY_QUOTE_RECORD",
    correlationId: `carrier-delivery-quote:${key}`,
    payload: {
      quoteRequestId: request.id,
      carrierProfileId: profile.id,
      idempotencyKey: key,
      confirmed: true,
    },
    work: async (actionRunId) => {
      const now = new Date();
      const [quote] = await db
        .insert(carrierDeliveryQuotes)
        .values({
          tenantId: input.tenantId,
          quoteRequestId: request.id,
          industrialOrderId: request.industrialOrderId,
          carrierProfileId: profile.id,
          carrierCoverageId: coverage?.id || null,
          adapterConnectionId: connection?.id || null,
          idempotencyKey: key,
          status: "verified",
          sourceType,
          providerQuoteReference: optionalText(input.providerQuoteReference, 240),
          totalCostMinor,
          customerPriceMinor,
          currencyCode: code,
          costBreakdown: safeEvidenceArray(input.costBreakdown, "costBreakdown"),
          minimumTransitDays: optionalNonNegativeInteger(
            input.minimumTransitDays,
            "minimumTransitDays",
          ),
          maximumTransitDays: optionalNonNegativeInteger(
            input.maximumTransitDays,
            "maximumTransitDays",
          ),
          pickupWindowStart: parseDate(input.pickupWindowStart, "pickupWindowStart"),
          pickupWindowEnd: parseDate(input.pickupWindowEnd, "pickupWindowEnd"),
          estimatedDeliveryAt: parseDate(input.estimatedDeliveryAt, "estimatedDeliveryAt"),
          validUntil,
          terms: safeRecord(input.terms, "terms"),
          evidence,
          receivedAt: now,
          verifiedAt: now,
          verifiedByUserId: input.actorUserId,
          recordedByUserId: input.actorUserId,
          actionRunId,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing({
          target: [carrierDeliveryQuotes.tenantId, carrierDeliveryQuotes.idempotencyKey],
        })
        .returning();
      const existingQuote =
        quote ||
        (await db.query.carrierDeliveryQuotes.findFirst({
          where: and(
            eq(carrierDeliveryQuotes.tenantId, input.tenantId),
            eq(carrierDeliveryQuotes.idempotencyKey, key),
          ),
        }));
      if (!existingQuote) {
        throw new CarrierNetworkError("carrier_quote_record_failed", "Carrier quote could not be recorded", 500);
      }
      await db
        .update(carrierQuoteRequests)
        .set({ status: "quotes_received", updatedAt: now })
        .where(
          and(
            eq(carrierQuoteRequests.tenantId, input.tenantId),
            eq(carrierQuoteRequests.id, request.id),
            notInArray(carrierQuoteRequests.status, ["selected", "expired", "cancelled"]),
          ),
        );
      await db.insert(industrialAuditLogs).values({
        tenantId: input.tenantId,
        actorUserId: input.actorUserId,
        action: "delivery.quote_recorded",
        entityType: "carrier_delivery_quote",
        entityId: existingQuote.id,
        reason: "Recorded an evidence-backed carrier quote without booking the carrier.",
        nextValue: {
          quoteRequestId: request.id,
          carrierProfileId: profile.id,
          sourceType,
          status: existingQuote.status,
          totalCostMinor,
          currencyCode: code,
        },
        metadata: {
          actionRunId,
          providerRequestExecuted: request.providerRequestExecuted,
          externalBookingExecuted: false,
        },
      });
      return existingQuote;
    },
    evidence: (quote) => [
      {
        evidenceType: "carrier_delivery_quote",
        payload: {
          deliveryQuoteId: quote.id,
          quoteRequestId: quote.quoteRequestId,
          carrierProfileId: quote.carrierProfileId,
          status: quote.status,
          sourceType,
          evidenceCount: evidence.length,
          externalBookingExecuted: false,
        },
      },
    ],
  });
  return {
    deliveryQuote: governed.result,
    actionRunId: governed.actionRunId,
    externalBookingExecuted: false,
  };
}

export async function prepareCarrierBookingAuthorization(input: {
  tenantId: number;
  actorUserId: number | null;
  deliveryQuoteId: string;
  idempotencyKey: unknown;
  selectionRationale: unknown;
  confirmed: boolean;
}) {
  if (input.confirmed !== true || !input.actorUserId) {
    throw new CarrierNetworkError(
      "carrier_quote_selection_confirmation_required",
      "An authenticated human must confirm the quote selection",
      400,
    );
  }
  const key = idempotencyKey(input.idempotencyKey);
  const rationale = boundedText(input.selectionRationale, "selectionRationale", 1200);
  const governed = await governedAction({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    actionKey: "DELIVERY_BOOK_PREPARE",
    correlationId: `carrier-booking-preparation:${key}`,
    payload: { deliveryQuoteId: input.deliveryQuoteId, idempotencyKey: key, confirmed: true },
    work: async (actionRunId) =>
      db.transaction(async (tx) => {
        await advisoryLock(tx, `carrier-booking-prepare:${input.tenantId}:${input.deliveryQuoteId}`);
        const [quote] = await tx
          .select()
          .from(carrierDeliveryQuotes)
          .where(
            and(
              eq(carrierDeliveryQuotes.tenantId, input.tenantId),
              eq(carrierDeliveryQuotes.id, input.deliveryQuoteId),
            ),
          )
          .limit(1);
        if (!quote) throw new CarrierNetworkError("carrier_quote_not_found", "Carrier quote not found", 404);
        if (quote.status !== "verified" && quote.status !== "selected") {
          throw new CarrierNetworkError(
            "carrier_quote_not_verified",
            "Only a verified carrier quote can be selected",
          );
        }
        if (new Date(quote.validUntil).getTime() <= Date.now()) {
          throw new CarrierNetworkError("carrier_quote_expired", "Carrier quote has expired");
        }
        const [request, order, plan] = await Promise.all([
          tx.query.carrierQuoteRequests.findFirst({
            where: and(
              eq(carrierQuoteRequests.tenantId, input.tenantId),
              eq(carrierQuoteRequests.id, quote.quoteRequestId),
            ),
          }),
          tx.query.industrialOrders.findFirst({
            where: and(
              eq(industrialOrders.tenantId, input.tenantId),
              eq(industrialOrders.id, quote.industrialOrderId),
            ),
          }),
          tx.query.industrialFulfillmentPlans.findFirst({
            where: and(
              eq(industrialFulfillmentPlans.tenantId, input.tenantId),
              eq(industrialFulfillmentPlans.orderId, quote.industrialOrderId),
            ),
          }),
        ]);
        if (!request || !order) {
          throw new CarrierNetworkError(
            "carrier_quote_context_missing",
            "Carrier quote request or industrial order is missing",
            404,
          );
        }
        if (order.paymentStatus !== "paid") {
          throw new CarrierNetworkError(
            "verified_payment_required",
            "Verified payment is required before preparing a carrier booking",
          );
        }
        if (!plan) {
          throw new CarrierNetworkError(
            "industrial_fulfillment_plan_required",
            "Initialize the paid order's fulfillment plan before preparing a carrier booking",
          );
        }
        const service = await tx.query.industrialFulfillmentServices.findFirst({
          where: and(
            eq(industrialFulfillmentServices.tenantId, input.tenantId),
            eq(industrialFulfillmentServices.planId, plan.id),
            eq(industrialFulfillmentServices.serviceType, request.serviceType as any),
          ),
        });
        if (!service) {
          throw new CarrierNetworkError(
            "industrial_fulfillment_service_required",
            "The matching fulfillment service slot is missing",
          );
        }
        const [existing] = await tx
          .select()
          .from(carrierBookingAuthorizations)
          .where(
            and(
              eq(carrierBookingAuthorizations.tenantId, input.tenantId),
              or(
                eq(carrierBookingAuthorizations.idempotencyKey, key),
                eq(carrierBookingAuthorizations.deliveryQuoteId, quote.id),
              ),
            ),
          )
          .limit(1);
        if (existing) return existing;
        const now = new Date();
        await tx
          .update(carrierDeliveryQuotes)
          .set({ status: "selected", selectedAt: now, updatedAt: now })
          .where(
            and(
              eq(carrierDeliveryQuotes.tenantId, input.tenantId),
              eq(carrierDeliveryQuotes.id, quote.id),
            ),
          );
        await tx
          .update(carrierQuoteRequests)
          .set({ status: "selected", selectedQuoteId: quote.id, updatedAt: now })
          .where(
            and(
              eq(carrierQuoteRequests.tenantId, input.tenantId),
              eq(carrierQuoteRequests.id, request.id),
            ),
          );
        const [authorization] = await tx
          .insert(carrierBookingAuthorizations)
          .values({
            tenantId: input.tenantId,
            quoteRequestId: request.id,
            deliveryQuoteId: quote.id,
            industrialOrderId: order.id,
            fulfillmentPlanId: plan.id,
            fulfillmentServiceId: service.id,
            carrierProfileId: quote.carrierProfileId,
            adapterConnectionId: quote.adapterConnectionId,
            idempotencyKey: key,
            status: "approval_required",
            authorizedCostMinor: quote.totalCostMinor,
            currencyCode: quote.currencyCode,
            approvalRationale: rationale,
            preparationActionRunId: actionRunId,
            preparedByUserId: input.actorUserId,
            preparedAt: now,
            externalBookingExecuted: false,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        await tx
          .update(industrialFulfillmentServices)
          .set({
            providerKind: "verified_carrier",
            providerName: null,
            carrierProfileId: quote.carrierProfileId,
            carrierDeliveryQuoteId: quote.id,
            carrierBookingAuthorizationId: authorization.id,
            quotedCost: exactMajorUnitTextFromMinor(quote.totalCostMinor),
            currencyCode: quote.currencyCode,
            metadata: {
              ...(asRecord(service.metadata)),
              carrierSelectionRationale: rationale,
              providerBookingExecuted: false,
              externalActionExecuted: false,
            },
            updatedByUserId: input.actorUserId,
            updatedAt: now,
          })
          .where(eq(industrialFulfillmentServices.id, service.id));
        await tx.insert(industrialAuditLogs).values({
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          action: "delivery.booking_prepared",
          entityType: "carrier_booking_authorization",
          entityId: authorization.id,
          reason: rationale,
          nextValue: {
            deliveryQuoteId: quote.id,
            carrierProfileId: quote.carrierProfileId,
            status: authorization.status,
            authorizedCostMinor: authorization.authorizedCostMinor,
            currencyCode: authorization.currencyCode,
          },
          metadata: {
            actionRunId,
            fulfillmentPlanId: plan.id,
            fulfillmentServiceId: service.id,
            externalBookingExecuted: false,
          },
        });
        return authorization;
      }),
    evidence: (authorization) => [
      {
        evidenceType: "carrier_booking_preparation",
        payload: {
          bookingAuthorizationId: authorization.id,
          deliveryQuoteId: authorization.deliveryQuoteId,
          status: authorization.status,
          selectionRationale: rationale,
          externalBookingExecuted: false,
        },
      },
    ],
  });
  return {
    bookingAuthorization: governed.result,
    actionRunId: governed.actionRunId,
    externalBookingExecuted: false,
    providerBookingConfirmed: false,
  };
}

export async function approveCarrierBookingAuthorization(input: {
  tenantId: number;
  actorUserId: number | null;
  bookingAuthorizationId: string;
  approvalReference: unknown;
  approvalRationale: unknown;
  confirmed: boolean;
}) {
  if (input.confirmed !== true || !input.actorUserId) {
    throw new CarrierNetworkError(
      "carrier_booking_human_approval_required",
      "An authenticated human approval is required",
      400,
    );
  }
  const approvalReference = boundedText(input.approvalReference, "approvalReference", 240);
  const approvalRationale = boundedText(input.approvalRationale, "approvalRationale", 1200);
  const governed = await governedAction({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    actionKey: "DELIVERY_BOOK_AUTHORIZE",
    correlationId: `carrier-booking-approval:${input.bookingAuthorizationId}`,
    payload: {
      bookingAuthorizationId: input.bookingAuthorizationId,
      approvalReference,
      confirmed: true,
    },
    work: async (actionRunId) =>
      db.transaction(async (tx) => {
        await advisoryLock(
          tx,
          `carrier-booking-approval:${input.tenantId}:${input.bookingAuthorizationId}`,
        );
        const [authorization] = await tx
          .select()
          .from(carrierBookingAuthorizations)
          .where(
            and(
              eq(carrierBookingAuthorizations.tenantId, input.tenantId),
              eq(carrierBookingAuthorizations.id, input.bookingAuthorizationId),
            ),
          )
          .limit(1);
        if (!authorization) {
          throw new CarrierNetworkError(
            "carrier_booking_authorization_not_found",
            "Carrier booking authorization not found",
            404,
          );
        }
        if (authorization.status === "approved_submission_ready") return authorization;
        if (authorization.status !== "approval_required") {
          throw new CarrierNetworkError(
            "carrier_booking_authorization_not_approvable",
            "Carrier booking authorization is not awaiting approval",
          );
        }
        const [order, plan, service, quote, profile, connection, incidents] = await Promise.all([
          tx.query.industrialOrders.findFirst({
            where: and(
              eq(industrialOrders.tenantId, input.tenantId),
              eq(industrialOrders.id, authorization.industrialOrderId),
            ),
          }),
          tx.query.industrialFulfillmentPlans.findFirst({
            where: and(
              eq(industrialFulfillmentPlans.tenantId, input.tenantId),
              eq(industrialFulfillmentPlans.id, authorization.fulfillmentPlanId),
            ),
          }),
          tx.query.industrialFulfillmentServices.findFirst({
            where: and(
              eq(industrialFulfillmentServices.tenantId, input.tenantId),
              eq(industrialFulfillmentServices.id, authorization.fulfillmentServiceId),
            ),
          }),
          tx.query.carrierDeliveryQuotes.findFirst({
            where: and(
              eq(carrierDeliveryQuotes.tenantId, input.tenantId),
              eq(carrierDeliveryQuotes.id, authorization.deliveryQuoteId),
            ),
          }),
          tx.query.carrierProfiles.findFirst({
            where: and(
              eq(carrierProfiles.tenantId, input.tenantId),
              eq(carrierProfiles.id, authorization.carrierProfileId),
            ),
          }),
          authorization.adapterConnectionId
            ? tx.query.carrierAdapterConnections.findFirst({
                where: and(
                  eq(carrierAdapterConnections.tenantId, input.tenantId),
                  eq(carrierAdapterConnections.id, authorization.adapterConnectionId),
                ),
              })
            : Promise.resolve(null),
          tx.query.carrierIncidents.findMany({
            where: and(
              eq(carrierIncidents.tenantId, input.tenantId),
              eq(carrierIncidents.carrierProfileId, authorization.carrierProfileId),
              inArray(carrierIncidents.status, ["open", "investigating", "action_required"]),
            ),
          }),
        ]);
        const readiness = evaluateCarrierBookingAuthorization({
          tenantId: input.tenantId,
          order: order
            ? {
                tenantId: order.tenantId,
                id: order.id,
                paymentStatus: order.paymentStatus,
                currencyCode: order.currencyCode,
              }
            : null,
          plan: plan ?? null,
          service: service ?? null,
          quote: quote ?? null,
          profile: profile ?? null,
          connection: connection ?? null,
          openIncidents: incidents,
          humanConfirmed: true,
          approvalReference,
          approvalRationale,
        });
        if (!readiness.readyForProviderSubmission) {
          throw new CarrierNetworkError(
            "carrier_booking_not_ready",
            `Carrier booking is blocked: ${readiness.blockers.join(", ")}`,
          );
        }
        const now = new Date();
        const approvalEvidence = {
          humanApproved: true,
          approvalReference,
          approvalRationale,
          approvedAt: now.toISOString(),
          readinessBlockers: [],
          providerSubmissionExecuted: false,
        };
        const [updated] = await tx
          .update(carrierBookingAuthorizations)
          .set({
            status: "approved_submission_ready",
            approvalReference,
            approvalRationale,
            approvalEvidence,
            approvalActionRunId: actionRunId,
            approvedByUserId: input.actorUserId,
            approvedAt: now,
            externalBookingExecuted: false,
            updatedAt: now,
          })
          .where(
            and(
              eq(carrierBookingAuthorizations.id, authorization.id),
              eq(carrierBookingAuthorizations.status, "approval_required"),
            ),
          )
          .returning();
        if (!updated) {
          throw new CarrierNetworkError(
            "carrier_booking_concurrent_update",
            "Carrier booking authorization changed while it was being approved",
          );
        }
        if (service && ["candidate", "approval_required"].includes(service.status)) {
          await tx
            .update(industrialFulfillmentServices)
            .set({
              status: "approved",
              providerKind: "verified_carrier",
              providerName: profile?.displayName || profile?.legalName || null,
              carrierProfileId: profile?.id || null,
              carrierDeliveryQuoteId: quote?.id || null,
              carrierBookingAuthorizationId: updated.id,
              approvalReason: approvalRationale,
              approvedByUserId: input.actorUserId,
              approvedAt: now,
              metadata: {
                ...asRecord(service.metadata),
                carrierApprovalReference: approvalReference,
                providerBookingExecuted: false,
                externalActionExecuted: false,
              },
              updatedByUserId: input.actorUserId,
              updatedAt: now,
            })
            .where(
              and(
                eq(industrialFulfillmentServices.id, service.id),
                eq(industrialFulfillmentServices.status, service.status),
              ),
            );
          const [sequenceRow] = await tx
            .select({
              value: sql<number>`coalesce(max(${industrialFulfillmentEvents.sequence}), 0)`,
            })
            .from(industrialFulfillmentEvents)
            .where(eq(industrialFulfillmentEvents.planId, authorization.fulfillmentPlanId));
          await tx
            .insert(industrialFulfillmentEvents)
            .values({
              tenantId: input.tenantId,
              planId: authorization.fulfillmentPlanId,
              orderId: authorization.industrialOrderId,
              sequence: Number(sequenceRow?.value || 0) + 1,
              idempotencyKey: `carrier-booking-approval:${updated.id}`,
              eventType: "service_status_changed",
              planStatus: plan?.status || null,
              title: `${service.serviceType.replaceAll("_", " ")} provider approved internally`,
              customerVisible: false,
              internalNotes:
                "Internal provider approval recorded. No carrier booking was submitted or confirmed.",
              evidence: [
                {
                  public: false,
                  reference: approvalReference,
                  bookingAuthorizationId: updated.id,
                },
              ],
              proof: {},
              source: "staff",
              actorUserId: input.actorUserId,
              occurredAt: now,
              recordedAt: now,
            })
            .onConflictDoNothing({
              target: [
                industrialFulfillmentEvents.tenantId,
                industrialFulfillmentEvents.idempotencyKey,
              ],
            });
        }
        await tx.insert(industrialAuditLogs).values({
          tenantId: input.tenantId,
          actorUserId: input.actorUserId,
          action: "delivery.booking_authorized",
          entityType: "carrier_booking_authorization",
          entityId: updated.id,
          reason: approvalRationale,
          previousValue: { status: authorization.status },
          nextValue: { status: updated.status, approvalReference },
          metadata: {
            actionRunId,
            fulfillmentServiceId: authorization.fulfillmentServiceId,
            externalBookingExecuted: false,
            providerBookingConfirmed: false,
          },
        });
        return updated;
      }),
    evidence: (authorization) => [
      {
        evidenceType: "carrier_booking_internal_approval",
        payload: {
          bookingAuthorizationId: authorization.id,
          status: authorization.status,
          approvalReference,
          externalBookingExecuted: false,
          providerBookingConfirmed: false,
        },
      },
    ],
  });
  return {
    bookingAuthorization: governed.result,
    actionRunId: governed.actionRunId,
    externalBookingExecuted: false,
    providerBookingConfirmed: false,
    nextStep:
      "A separately approved official adapter operation must submit the booking and retain a provider confirmation receipt.",
  };
}

export async function openCarrierIncident(input: {
  tenantId: number;
  actorUserId: number | null;
  carrierProfileId: string;
  adapterConnectionId?: string | null;
  bookingAuthorizationId?: string | null;
  severity: unknown;
  incidentType: unknown;
  title: unknown;
  description: unknown;
  operationalImpact?: unknown;
  evidence?: unknown;
}) {
  const severity = boundedText(input.severity, "severity", 20).toLowerCase();
  if (!["low", "medium", "high", "critical"].includes(severity)) {
    throw new CarrierNetworkError("carrier_incident_severity_invalid", "Incident severity is invalid", 400);
  }
  const profile = await db.query.carrierProfiles.findFirst({
    where: and(
      eq(carrierProfiles.tenantId, input.tenantId),
      eq(carrierProfiles.id, input.carrierProfileId),
    ),
  });
  if (!profile) throw new CarrierNetworkError("carrier_profile_not_found", "Carrier profile not found", 404);
  const now = new Date();
  return db.transaction(async (tx) => {
    const [incident] = await tx
      .insert(carrierIncidents)
      .values({
        tenantId: input.tenantId,
        carrierProfileId: profile.id,
        adapterConnectionId: input.adapterConnectionId || null,
        bookingAuthorizationId: input.bookingAuthorizationId || null,
        severity: severity as "low" | "medium" | "high" | "critical",
        status: severity === "critical" ? "action_required" : "open",
        incidentType: boundedText(input.incidentType, "incidentType", 120),
        title: boundedText(input.title, "title", 240),
        description: boundedText(input.description, "description", 3000),
        operationalImpact: safeRecord(input.operationalImpact, "operationalImpact"),
        evidence: safeEvidenceArray(input.evidence, "incidentEvidence"),
        openedByUserId: input.actorUserId,
        openedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    if (["high", "critical"].includes(severity)) {
      await tx
        .update(carrierProfiles)
        .set({
          restrictionStatus: `incident_${severity}`,
          updatedByUserId: input.actorUserId,
          updatedAt: now,
        })
        .where(
          and(
            eq(carrierProfiles.tenantId, input.tenantId),
            eq(carrierProfiles.id, profile.id),
          ),
        );
    }
    await tx.insert(industrialAuditLogs).values({
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      action: "carrier.incident_opened",
      entityType: "carrier_incident",
      entityId: incident.id,
      reason: incident.description,
      nextValue: { carrierProfileId: profile.id, severity, status: incident.status },
      metadata: { externalProviderActionExecuted: false },
    });
    return { incident, carrierRestricted: ["high", "critical"].includes(severity) };
  });
}
