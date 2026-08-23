import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildManualCarrierQuotePackage,
  CARRIER_PARTNERSHIP_STATUSES,
  CARRIER_SERVICE_TYPES,
  evaluateCarrierBookingAuthorization,
  evaluateCarrierConnectionReadiness,
  evaluateCarrierCoverageMatch,
  evaluateCarrierProfileReadiness,
  evaluateCarrierQuoteEvidence,
  sanitizeCarrierVerificationEvidence,
  validateCarrierQuoteRequest,
} from "../server/lib/industrial/carrierNetworkPolicy";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const now = new Date("2026-08-17T12:00:00.000Z");
const verifiedAt = "2026-08-17T11:00:00.000Z";
const validUntil = "2026-09-17T12:00:00.000Z";

const profile = {
  tenantId: 7,
  status: "active",
  verificationStatus: "contract_verified",
  partnershipStatus: "contracted_partner",
  restrictionStatus: "none",
  verificationEvidence: {
    verified: true,
    credentialsExcluded: true,
    sourceReferences: ["authority:carrier:7"],
  },
  lastVerifiedAt: verifiedAt,
  verificationExpiresAt: validUntil,
};

const cargo = {
  description: "Palletized industrial components",
  productCategory: "industrial_components",
  weightKg: 800,
  volumeM3: 4,
  declaredValueMinor: 2_500_000,
  currencyCode: "XOF",
  hazardousGoods: false,
  coldChainRequired: false,
  fragile: true,
};

const coverage = {
  id: "coverage-1",
  tenantId: 7,
  carrierProfileId: "carrier-1",
  originCountryCode: "BJ",
  destinationCountryCode: "CI",
  serviceType: "freight",
  transportMode: "road",
  productCategory: "industrial_components",
  capabilities: ["fragile", "customs"],
  maxWeightKg: 1_000,
  maxVolumeM3: 8,
  hazardousGoodsSupported: false,
  coldChainSupported: false,
  status: "active",
  evidence: [{ reference: "coverage-contract:2026" }],
  sourceReference: "coverage-contract:2026",
  lastVerifiedAt: verifiedAt,
  validUntil,
};

const connection = {
  tenantId: 7,
  status: "verified",
  restrictionStatus: "none",
  capabilities: ["connection_check", "quote_request", "booking_create"],
  callbackStatus: "verified",
  verificationEvidence: { verified: true, credentialsExcluded: true },
  lastVerifiedAt: verifiedAt,
  credentialReference: "secret-manager/carrier-production",
};

test("carrier truth vocabulary separates candidates, verified providers, and contracted partners", () => {
  assert.deepEqual(CARRIER_SERVICE_TYPES, ["freight", "customs", "last_mile"]);
  assert.deepEqual(CARRIER_PARTNERSHIP_STATUSES, [
    "candidate",
    "verified_provider",
    "contracted_partner",
    "internal_network",
  ]);

  const candidate = evaluateCarrierProfileReadiness({
    tenantId: 7,
    profile: {
      ...profile,
      status: "discovered",
      verificationStatus: "unverified",
      partnershipStatus: "candidate",
      verificationEvidence: {},
      lastVerifiedAt: null,
    },
    requireContractedPartner: true,
    now,
  });
  assert.equal(candidate.ready, false);
  assert.ok(candidate.blockers.includes("carrier_profile_not_verified"));
  assert.ok(candidate.blockers.includes("carrier_contract_required"));

  const contracted = evaluateCarrierProfileReadiness({
    tenantId: 7,
    profile,
    requireContractedPartner: true,
    now,
  });
  assert.equal(contracted.ready, true);
  assert.equal(contracted.externalCommitmentAuthorized, false);
});

test("carrier verification evidence rejects credential material and future-dated claims", () => {
  assert.throws(
    () =>
      sanitizeCarrierVerificationEvidence(
        {
          verified: true,
          credentialsExcluded: true,
          authorityReference: "authority:7",
          sourceReferences: ["registry:7"],
          apiKey: "must-never-enter-evidence",
        },
        now,
      ),
    /must not contain passwords/i,
  );
  assert.throws(
    () =>
      sanitizeCarrierVerificationEvidence(
        {
          verified: true,
          credentialsExcluded: true,
          authorityReference: "authority:7",
          sourceReferences: ["registry:7"],
          verifiedAt: "2026-08-18T12:00:00.000Z",
        },
        now,
      ),
    /future-dated/i,
  );

  const evidence = sanitizeCarrierVerificationEvidence(
    {
      verified: true,
      credentialsExcluded: true,
      contractReference: "contract:carrier:7",
      sourceReferences: ["registry:7", "contract:carrier:7"],
      verifiedAt,
    },
    now,
  );
  assert.equal(evidence.verified, true);
  assert.equal(evidence.credentialsExcluded, true);
  assert.equal(evidence.verifiedAt, verifiedAt);
});

test("coverage matching is exact across tenant, route, capacity, cargo, mode, and capability", () => {
  const matched = evaluateCarrierCoverageMatch({
    tenantId: 7,
    carrierProfileId: "carrier-1",
    coverage,
    serviceType: "freight",
    origin: { countryCode: "BJ", city: "Cotonou" },
    destination: { countryCode: "CI", city: "Abidjan" },
    cargo,
    transportMode: "road",
    requiredCapabilities: ["fragile", "customs"],
    now,
  });
  assert.equal(matched.matched, true);
  assert.equal(matched.providerServiceabilityConfirmed, false);

  const blocked = evaluateCarrierCoverageMatch({
    tenantId: 7,
    carrierProfileId: "carrier-1",
    coverage,
    serviceType: "freight",
    origin: { countryCode: "TG" },
    destination: { countryCode: "CI" },
    cargo: { ...cargo, weightKg: 1_500, hazardousGoods: true, coldChainRequired: true },
    transportMode: "air",
    requiredCapabilities: ["cold_chain"],
    now,
  });
  assert.equal(blocked.matched, false);
  assert.ok(blocked.blockers.includes("coverage_origin_country_mismatch"));
  assert.ok(blocked.blockers.includes("coverage_transport_mode_mismatch"));
  assert.ok(blocked.blockers.includes("coverage_weight_exceeded"));
  assert.ok(blocked.blockers.includes("hazardous_goods_coverage_required"));
  assert.ok(blocked.blockers.includes("cold_chain_coverage_required"));
  assert.ok(blocked.blockers.includes("coverage_capability_missing:cold_chain"));
});

test("connection and quote gates require current scoped evidence without claiming provider execution", () => {
  const readyConnection = evaluateCarrierConnectionReadiness({
    tenantId: 7,
    connection,
    requiredCapability: "booking_create",
    requireCallback: true,
    now,
  });
  assert.equal(readyConnection.ready, true);
  assert.equal(readyConnection.providerActionExecuted, false);

  const restricted = evaluateCarrierConnectionReadiness({
    tenantId: 7,
    connection: { ...connection, restrictionStatus: "account_hold" },
    requiredCapability: "booking_create",
    now,
  });
  assert.equal(restricted.ready, false);
  assert.ok(restricted.blockers.includes("carrier_adapter_restricted:account_hold"));

  const request = validateCarrierQuoteRequest({
    serviceType: "freight",
    origin: { countryCode: "BJ" },
    destination: { countryCode: "CI" },
    cargo,
    requiredCapabilities: [],
  });
  assert.equal(request.valid, true);

  const quote = evaluateCarrierQuoteEvidence({
    tenantId: 7,
    profile,
    sourceType: "manual_evidence",
    totalCostMinor: 100_000,
    customerPriceMinor: 125_000,
    currencyCode: "XOF",
    validUntil,
    evidence: [{ reference: "quote-email:44", verifiedByHuman: true }],
    now,
  });
  assert.equal(quote.verified, true);
  assert.equal(quote.bookingCreatedExternally, false);
});

test("booking authority requires paid canonical fulfillment, selected evidence, contract, adapter readiness, and human approval", () => {
  const input = {
    tenantId: 7,
    order: { tenantId: 7, id: "order-1", paymentStatus: "paid", currencyCode: "XOF" },
    plan: { tenantId: 7, id: "plan-1", orderId: "order-1" },
    service: { tenantId: 7, id: "service-1", orderId: "order-1", serviceType: "freight" },
    quote: {
      tenantId: 7,
      industrialOrderId: "order-1",
      status: "selected",
      totalCostMinor: 100_000,
      currencyCode: "XOF",
      validUntil,
    },
    profile,
    connection,
    openIncidents: [] as Array<{ severity: string; status: string }>,
    humanConfirmed: true,
    approvalReference: "authority:ops:44",
    approvalRationale: "Approved against the paid order and current provider quote.",
    now,
  };
  const ready = evaluateCarrierBookingAuthorization(input);
  assert.equal(ready.readyForProviderSubmission, true);
  assert.equal(ready.externalBookingExecuted, false);
  assert.equal(ready.providerBookingConfirmed, false);

  const blocked = evaluateCarrierBookingAuthorization({
    ...input,
    order: { ...input.order, paymentStatus: "pending" },
    humanConfirmed: false,
    openIncidents: [{ severity: "critical", status: "open" }],
  });
  assert.equal(blocked.readyForProviderSubmission, false);
  assert.ok(blocked.blockers.includes("verified_payment_required"));
  assert.ok(blocked.blockers.includes("carrier_high_risk_incident_open"));
  assert.ok(blocked.blockers.includes("human_booking_approval_required"));
});

test("manual carrier package remains a non-executing handoff", () => {
  const handoff = buildManualCarrierQuotePackage({
    quoteRequestId: "quote-request-1",
    serviceType: "freight",
    origin: { countryCode: "BJ" },
    destination: { countryCode: "CI" },
    cargo,
    requiredCapabilities: ["fragile"],
    incoterm: "DAP",
  });
  assert.equal(handoff.status, "MANUAL_REQUIRED");
  assert.equal(handoff.providerRequestExecuted, false);
  assert.equal(handoff.providerQuoteReceived, false);
  assert.equal(handoff.externalBookingExecuted, false);
});

test("carrier network schema, runtime parity, routes, actions, UI, and fulfillment integration stay wired", async () => {
  const [
    schema,
    migration,
    isolationMigration,
    ensure,
    adapter,
    providerRelease,
    service,
    actions,
    route,
    routes,
    app,
    nav,
    page,
    dealRoom,
    fulfillment,
  ] = await Promise.all([
    read("db/schema/carrier-network.ts"),
    read("db/migrations/20270417_exportunity_carrier_network_foundation.sql"),
    read("db/migrations/20270418_exportunity_carrier_connection_isolation.sql"),
    read("server/lib/industrial/ensureCarrierNetworkTables.ts"),
    read("server/lib/industrial/carrierAdapter.ts"),
    read("server/lib/industrial/carrierProviderRelease.ts"),
    read("server/lib/industrial/carrierNetwork.ts"),
    read("server/lib/actions/actionDefinitions.ts"),
    read("server/routes/admin-carrier-network.ts"),
    read("server/routes.ts"),
    read("client/src/App.tsx"),
    read("client/src/lib/adminNavRegistry.ts"),
    read("client/src/pages/AdminCarrierNetworkPage.tsx"),
    read("client/src/components/exportunity/IndustrialCommercialDealRoom.tsx"),
    read("server/lib/industrial/fulfillment.ts"),
  ]);

  const tables = [
    "carrier_profiles",
    "carrier_coverages",
    "carrier_adapter_connections",
    "carrier_quote_requests",
    "carrier_delivery_quotes",
    "carrier_booking_authorizations",
    "carrier_provider_receipts",
    "carrier_incidents",
  ];
  for (const table of tables) {
    assert.ok(schema.includes(`\"${table}\"`), `schema missing ${table}`);
    assert.ok(migration.includes(table), `migration missing ${table}`);
    assert.ok(ensure.includes(table), `runtime parity missing ${table}`);
  }

  for (const constraint of [
    "carrier_profiles_partnership_truth_check",
    "carrier_coverages_verified_evidence_check",
    "carrier_adapter_connections_verified_check",
    "carrier_quote_requests_submission_truth_check",
    "carrier_booking_authorizations_approval_check",
    "carrier_booking_authorizations_submission_truth_check",
    "carrier_booking_authorizations_provider_confirmation_check",
    "carrier_provider_receipts_signature_check",
  ]) {
    assert.ok(migration.includes(constraint), `migration missing ${constraint}`);
    assert.ok(ensure.includes(constraint), `runtime parity missing ${constraint}`);
  }
  for (const isolationConstraint of [
    "carrier_adapter_connections_exportunity_connection_id_fkey",
    "carrier_adapter_connections_legacy_reference_retired_check",
  ]) {
    assert.ok(
      isolationMigration.includes(isolationConstraint),
      `isolation migration missing ${isolationConstraint}`,
    );
    assert.ok(
      ensure.includes(isolationConstraint),
      `runtime parity missing ${isolationConstraint}`,
    );
  }

  assert.match(schema, /exportunityIntegrationConnectionId/);
  assert.match(
    isolationMigration,
    /constraint_row\.contype\s*=\s*'f'[\s\S]*constrained_column\.attname\s*=\s*'integration_connection_id'/,
  );
  assert.match(
    ensure,
    /constraint_row\.contype\s*=\s*'f'[\s\S]*constrained_column\.attname\s*=\s*'integration_connection_id'/,
  );
  assert.doesNotMatch(schema, /mindbase/i);
  assert.doesNotMatch(service, /mindbase/i);
  assert.doesNotMatch(route, /mindbase/i);
  assert.doesNotMatch(page, /mindbase/i);

  for (const method of [
    "verifyConnection(",
    "requestQuote(",
    "createBooking(",
    "getTracking(",
    "cancelBooking(",
    "verifyWebhookSignature(",
  ]) {
    assert.ok(adapter.includes(method), `adapter contract missing ${method}`);
  }
  assert.doesNotMatch(service, /\.(?:requestQuote|createBooking|cancelBooking)\(/);
  assert.doesNotMatch(service, /totalCostMinor\s*\/\s*100/);
  assert.match(providerRelease, /written_agreement_required/);
  assert.match(providerRelease, /carrier_execution_surface_not_implemented/);

  for (const actionKey of [
    "CARRIER_PROFILE_RECORD",
    "CARRIER_PROFILE_VERIFY",
    "CARRIER_COVERAGE_RECORD",
    "CARRIER_CONNECTION_VERIFY",
    "DELIVERY_QUOTE_PREPARE",
    "DELIVERY_QUOTE_RECORD",
    "DELIVERY_BOOK_PREPARE",
    "DELIVERY_BOOK_AUTHORIZE",
  ]) {
    assert.ok(actions.includes(actionKey), `action definition missing ${actionKey}`);
  }

  assert.ok(route.includes('router.post("/quote-requests/prepare"'));
  assert.ok(route.includes('router.post("/quotes/:deliveryQuoteId/select"'));
  assert.ok(route.includes('router.post("/bookings/:bookingAuthorizationId/approve"'));
  assert.ok(routes.includes('app.use("/api/admin/carrier-network", adminCarrierNetworkRouter)'));
  assert.ok(app.includes('path="/admin/carrier-network"'));
  assert.ok(nav.includes('route: "/admin/carrier-network"'));
  assert.ok(page.includes("Provider execution release boundary"));
  assert.ok(page.includes("External actions disabled"));
  assert.ok(page.includes("There is deliberately no “Book carrier”"));
  assert.ok(dealRoom.includes("Open carrier network"));
  assert.ok(dealRoom.includes("External logistics cannot be configured from a free-text provider name"));
  assert.ok(fulfillment.includes("industrial_fulfillment_carrier_profile_required"));
  assert.ok(fulfillment.includes("industrial_fulfillment_provider_booking_confirmation_required"));
  assert.ok(fulfillment.includes('booking.externalBookingExecuted !== true'));
});
