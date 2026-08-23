import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCarrierProviderReleaseState,
  evaluateCarrierProviderReleaseGate,
  readCarrierProviderFeatureFlags,
  sanitizeCarrierProviderContractEvidence,
  type CarrierProviderFeatureFlags,
} from "../server/lib/industrial/carrierProviderRelease";

const now = new Date("2026-08-21T18:30:00.000Z");
const allFlags: CarrierProviderFeatureFlags = {
  connectionChecks: true,
  quoteRequests: true,
  bookings: true,
  cancellations: true,
  trackingReads: true,
  trackingCallbacks: true,
};
const registeredAdapters = [
  {
    provider: "dhl_express_mydhl",
    capabilities: [
      "connection_check",
      "quote_request",
      "booking_create",
      "booking_cancel",
      "tracking_read",
      "proof_of_delivery_read",
    ],
  },
];
const completeContract = {
  provider: "dhl_express_mydhl",
  writtenAgreementExecuted: true,
  agreementReference: "agreement:carrier:2026-08",
  agreementEffectiveAt: "2026-08-20T09:00:00.000Z",
  agreementExpiresAt: "2027-08-20T09:00:00.000Z",
  termsSnapshotReference: "evidence:terms:sha256:example",
  legalApprovalReference: "legal:approval:44",
  legalApprovedAt: "2026-08-20T10:00:00.000Z",
  operationsApprovalReference: "operations:approval:45",
  operationsApprovedAt: "2026-08-20T11:00:00.000Z",
  securityApprovalReference: "security:approval:46",
  securityApprovedAt: "2026-08-20T12:00:00.000Z",
  productionUseApproved: true,
  dataRights: {
    accountVerification: true,
    quoteSubmission: true,
    quoteResponsePersistence: true,
    quoteResponseTransformation: true,
    commercialUse: true,
    bookingCreation: true,
    bookingCancellation: true,
    trackingPersistence: true,
    proofOfDeliveryPersistence: true,
    webhookProcessing: true,
  },
  sandboxPilot: {
    completed: true,
    receiptReferences: ["sandbox-receipt:quote:1", "sandbox-receipt:booking:1"],
  },
};
const readyConnection = {
  provider: "dhl_express_mydhl",
  environment: "production",
  status: "verified",
  restrictionStatus: "none",
  callbackStatus: "verified",
  capabilities: registeredAdapters[0].capabilities,
  lastVerifiedAt: "2026-08-20T12:30:00.000Z",
  credentialReferencePresent: true,
  exportunityIntegrationConnectionPresent: false,
  verificationEvidence: {
    verified: true,
    credentialsExcluded: true,
    providerContract: completeContract,
  },
};

test("carrier provider feature flags are fail-closed by default", () => {
  assert.deepEqual(readCarrierProviderFeatureFlags({}), {
    connectionChecks: false,
    quoteRequests: false,
    bookings: false,
    cancellations: false,
    trackingReads: false,
    trackingCallbacks: false,
  });
});

test("provider contract evidence is bounded and rejects credential material", () => {
  const sanitized = sanitizeCarrierProviderContractEvidence(completeContract);
  assert.equal(sanitized?.provider, "dhl_express_mydhl");
  assert.equal(sanitized?.dataRights.quoteResponsePersistence, true);
  assert.deepEqual(sanitized?.sandboxPilot.receiptReferences, [
    "sandbox-receipt:quote:1",
    "sandbox-receipt:booking:1",
  ]);
  assert.throws(
    () =>
      sanitizeCarrierProviderContractEvidence({
        ...completeContract,
        apiKey: "forbidden",
      }),
    /must not contain passwords/i,
  );
});

test("DHL quote persistence stays blocked without explicit written data rights", () => {
  const blocked = evaluateCarrierProviderReleaseGate({
    provider: "dhl_express_mydhl",
    action: "quote_request",
    environment: "production",
    connection: {
      ...readyConnection,
      verificationEvidence: {
        verified: true,
        credentialsExcluded: true,
        providerContract: {
          ...completeContract,
          writtenAgreementExecuted: false,
          dataRights: {
            ...completeContract.dataRights,
            quoteResponsePersistence: false,
            quoteResponseTransformation: false,
          },
        },
      },
    },
    registeredAdapters,
    featureFlags: allFlags,
    executionSurfacePresent: true,
    now,
  });
  assert.equal(blocked.ready, false);
  assert.ok(blocked.blockers.includes("carrier_written_agreement_required"));
  assert.ok(
    blocked.blockers.includes(
      "carrier_data_right_required:quoteResponsePersistence",
    ),
  );
  assert.ok(
    blocked.blockers.includes(
      "carrier_data_right_required:quoteResponseTransformation",
    ),
  );
  assert.equal(blocked.providerActionExecuted, false);
});

test("all evidence still cannot release an action without its flag and execution surface", () => {
  const blocked = evaluateCarrierProviderReleaseGate({
    provider: "dhl_express_mydhl",
    action: "booking_create",
    environment: "production",
    connection: readyConnection,
    registeredAdapters,
    featureFlags: { ...allFlags, bookings: false },
    executionSurfacePresent: false,
    now,
  });
  assert.equal(blocked.ready, false);
  assert.ok(
    blocked.blockers.includes(
      "carrier_provider_feature_disabled:booking_create",
    ),
  );
  assert.ok(
    blocked.blockers.includes("carrier_execution_surface_not_implemented"),
  );
});

test("approval timestamps without references and a current agreement term fail closed", () => {
  const blocked = evaluateCarrierProviderReleaseGate({
    provider: "dhl_express_mydhl",
    action: "booking_create",
    environment: "production",
    connection: {
      ...readyConnection,
      verificationEvidence: {
        verified: true,
        credentialsExcluded: true,
        providerContract: {
          ...completeContract,
          agreementExpiresAt: "2026-08-21T18:00:00.000Z",
          legalApprovalReference: null,
          operationsApprovalReference: null,
        },
      },
    },
    registeredAdapters,
    featureFlags: allFlags,
    executionSurfacePresent: true,
    now,
  });
  assert.equal(blocked.ready, false);
  assert.ok(
    blocked.blockers.includes("carrier_agreement_current_term_required"),
  );
  assert.ok(
    blocked.blockers.includes("carrier_legal_approval_reference_required"),
  );
  assert.ok(
    blocked.blockers.includes(
      "carrier_operations_approval_reference_required",
    ),
  );
});

test("stale connection evidence and an unverified callback remain independent blockers", () => {
  const blocked = evaluateCarrierProviderReleaseGate({
    provider: "dhl_express_mydhl",
    action: "webhook_receipts",
    environment: "production",
    connection: {
      ...readyConnection,
      callbackStatus: "pending",
      lastVerifiedAt: "2026-01-01T00:00:00.000Z",
    },
    registeredAdapters: [
      {
        provider: "dhl_express_mydhl",
        capabilities: [
          ...registeredAdapters[0].capabilities,
          "webhook_receipts",
        ],
      },
    ],
    featureFlags: allFlags,
    executionSurfacePresent: true,
    now,
  });
  assert.equal(blocked.ready, false);
  assert.ok(
    blocked.blockers.includes(
      "carrier_provider_connection_verification_stale",
    ),
  );
  assert.ok(
    blocked.blockers.includes("carrier_provider_callback_not_verified"),
  );
});

test("the pure gate becomes ready only when every independent boundary agrees", () => {
  const ready = evaluateCarrierProviderReleaseGate({
    provider: "dhl_express_mydhl",
    action: "quote_request",
    environment: "production",
    connection: readyConnection,
    registeredAdapters,
    featureFlags: allFlags,
    executionSurfacePresent: true,
    now,
  });
  assert.equal(ready.ready, true);
  assert.deepEqual(ready.blockers, []);
  assert.equal(ready.providerActionExecuted, false);
  assert.equal(ready.externalCommitmentCreated, false);
});

test("the current application release state remains disabled even with fabricated complete evidence", () => {
  const state = buildCarrierProviderReleaseState({
    connections: [readyConnection],
    registeredAdapters,
    featureFlags: allFlags,
    now,
  });
  assert.equal(state.controls.executionSurfacePresent, false);
  assert.equal(state.controls.providerQuoteRequestsEnabled, false);
  assert.equal(state.controls.providerBookingsEnabled, false);
  assert.equal(state.controls.providerTrackingReadsEnabled, false);
  assert.equal(state.controls.providerTrackingCallbacksEnabled, false);
  assert.ok(
    state.providers[0].gates.quoteRequest.blockers.includes(
      "carrier_execution_surface_not_implemented",
    ),
  );
});
