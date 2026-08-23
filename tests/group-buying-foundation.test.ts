import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  assertCommerceOnlyLanguage,
  evaluateBuyingInterest,
  evaluateCampaignTransition,
  evaluateGroupCampaignReadiness,
  evaluatePaidOrderBinding,
  evaluateProductionBatchTransition,
  evaluateSettlementPlan,
  GROUP_BUYING_CAMPAIGN_STATUSES,
  GROUP_BUYING_CAMPAIGN_TRANSITIONS,
  GROUP_SETTLEMENT_ROLES,
  PRODUCTION_BATCH_STATUSES,
  sanitizeGroupBuyingEvidence,
} from "../server/lib/group-buying/policy";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const now = new Date("2026-08-17T12:00:00.000Z");
const verifiedAt = "2026-08-17T11:00:00.000Z";

const tier = {
  id: "11111111-1111-4111-8111-111111111111",
  tenantId: 7,
  campaignId: "22222222-2222-4222-8222-222222222222",
  minimumQuantity: "100.0000",
  maximumQuantity: null,
  unitPriceMinor: 500,
  currencyCode: "XOF",
  status: "active",
  evidence: { verified: true, sourceReferences: ["approved-price-sheet:2026-08"] },
  verifiedByUserId: 41,
  verifiedAt,
};

const campaign = {
  id: "22222222-2222-4222-8222-222222222222",
  catalogItemId: "33333333-3333-4333-8333-333333333333",
  producerFactoryId: "44444444-4444-4444-8444-444444444444",
  supplierProfileId: null,
  territoryId: 19,
  campaignMediaItemId: null,
  mediaRightsGrantId: null,
  title: "Verified industrial filter production run",
  publicSummary: "A product group purchase for a documented factory production run.",
  unitOfMeasure: "unit",
  minimumQuantity: "100.0000",
  currencyCode: "XOF",
  baseUnitPriceMinor: 500,
  deadline: "2026-09-17T12:00:00.000Z",
  productionLeadTimeDays: 30,
  deliveryOptions: [{ id: "governed-carrier", label: "Governed carrier delivery" }],
  paymentTerms: "Pay only through the canonical industrial order checkout.",
  refundConditions: "Refunds follow documented campaign and provider reconciliation rules.",
  capacityEvidence: { verified: true, sourceReferences: ["capacity-sheet:factory-44"] },
  campaignContent: { productSpecifications: "Filter grade F7" },
  commerceRail: "preorder_or_group_purchase",
  regulatedCapitalEnabled: false,
  externalPaymentCollectionExecuted: false,
  externalSettlementExecuted: false,
};

const readinessInput = {
  tenantId: 7,
  campaign,
  catalog: {
    id: campaign.catalogItemId,
    tenantId: 7,
    factoryId: campaign.producerFactoryId,
    approvalStatus: "approved",
    visibility: "public",
    currencyCode: "XOF",
    unitOfMeasure: "unit",
  },
  factory: {
    id: campaign.producerFactoryId,
    tenantId: 7,
    factoryStatus: "active",
    verificationStatus: "verified",
    publicVisibility: "public",
    verifiedAt,
  },
  territory: {
    id: 19,
    tenantId: 7,
    status: "active",
    source: "official_boundary_registry",
    sourceRef: "territory:19:2026",
  },
  tiers: [tier],
  humanConfirmed: true,
  now,
};

test("group commerce uses exact campaign, commitment, batch, and settlement vocabularies", () => {
  assert.deepEqual(GROUP_BUYING_CAMPAIGN_STATUSES, [
    "draft",
    "verification_required",
    "live",
    "threshold_pending",
    "moq_reached",
    "payment_confirmed",
    "production",
    "ready_for_pickup",
    "in_transit",
    "delivered",
    "settled",
    "failed",
    "refunding",
    "refunded",
  ]);
  assert.ok(PRODUCTION_BATCH_STATUSES.includes("funded_by_orders"));
  assert.ok(GROUP_SETTLEMENT_ROLES.includes("producer_proceeds"));
  assert.ok(GROUP_SETTLEMENT_ROLES.includes("refund_exposure"));
  assert.deepEqual(GROUP_BUYING_CAMPAIGN_TRANSITIONS.ready_for_pickup, [
    "in_transit",
    "failed",
    "refunding",
  ]);
  assert.equal(evaluateCampaignTransition("payment_confirmed", "production").valid, true);
  assert.equal(evaluateCampaignTransition("live", "settled").valid, false);
});

test("campaign readiness requires verified industrial, territory, capacity, tier, and human evidence", () => {
  const ready = evaluateGroupCampaignReadiness(readinessInput);
  assert.equal(ready.readyForLive, true);
  assert.equal(ready.regulatedCapitalEnabled, false);
  assert.equal(ready.externalPaymentCollectionExecuted, false);

  const blocked = evaluateGroupCampaignReadiness({
    ...readinessInput,
    humanConfirmed: false,
    catalog: { ...readinessInput.catalog, approvalStatus: "draft" },
    campaign: {
      ...campaign,
      publicSummary: "Invest now for a guaranteed return and annual yield.",
      capacityEvidence: {},
    },
  });
  assert.equal(blocked.readyForLive, false);
  assert.ok(blocked.blockers.includes("approved_public_catalog_item_required"));
  assert.ok(blocked.blockers.includes("verified_capacity_evidence_required"));
  assert.ok(blocked.blockers.includes("regulated_capital_language_forbidden"));
  assert.ok(blocked.blockers.includes("human_campaign_approval_required"));
});

test("evidence excludes credentials and public copy rejects regulated-capital claims", () => {
  assert.throws(
    () => sanitizeGroupBuyingEvidence({ verified: true, apiKey: "must-not-be-stored" }),
    /must not contain passwords/i,
  );
  assert.throws(
    () => assertCommerceOnlyLanguage("Buy equity and receive a guaranteed return."),
    /product commerce only/i,
  );
  assert.doesNotThrow(() =>
    assertCommerceOnlyLanguage("Buy 150 filter units in this verified production run."),
  );
});

test("buying interest is non-binding and priced only by a verified exact tier", () => {
  const result = evaluateBuyingInterest({
    campaign: { status: "live", deadline: campaign.deadline, currencyCode: "XOF" },
    tiers: [tier],
    quantity: "150.0000",
    now,
  });
  assert.equal(result.valid, true);
  assert.equal(result.priceTier?.id, tier.id);
  assert.equal(result.totalAmountMinor, 75_000);
  assert.equal(result.bindingCommitmentCreated, false);
  assert.equal(result.paymentCollected, false);
  assert.equal(result.inventoryReserved, false);

  const noTier = evaluateBuyingInterest({
    campaign: { status: "live", deadline: campaign.deadline, currencyCode: "XOF" },
    tiers: [tier],
    quantity: "50.0000",
    now,
  });
  assert.equal(noTier.valid, false);
  assert.ok(noTier.blockers.includes("verified_price_tier_not_available"));
});

test("a commitment becomes binding only from an exact paid industrial order and provider receipt", () => {
  const commitment = {
    id: "55555555-5555-4555-8555-555555555555",
    tenantId: 7,
    campaignId: campaign.id,
    status: "interest_recorded",
    quantity: "150.0000",
    priceTierId: tier.id,
    unitPriceMinor: 500,
    totalAmountMinor: 75_000,
    currencyCode: "XOF",
    refundConditionsAcceptedAt: verifiedAt,
  };
  const order = {
    id: "66666666-6666-4666-8666-666666666666",
    tenantId: 7,
    catalogItemId: campaign.catalogItemId,
    factoryId: campaign.producerFactoryId,
    paymentStatus: "paid",
    totalAmount: "75000.00",
    paidAmount: "75000.00",
    currencyCode: "XOF",
    paidCurrencyCode: "XOF",
    paidAt: verifiedAt,
    lastPaymentId: "77777777-7777-4777-8777-777777777777",
    sourceQuoteSnapshot: {
      groupBuying: {
        campaignId: campaign.id,
        quantity: 150,
        unitPriceMinor: 500,
        priceTierId: tier.id,
      },
    },
  };
  const payment = {
    id: order.lastPaymentId,
    tenantId: 7,
    status: "succeeded",
    purpose: "INDUSTRIAL_ORDER_PAYMENT",
    targetType: "INDUSTRIAL_ORDER",
    targetId: order.id,
    amount: 75_000,
    currency: "XOF",
    provider: "flutterwave",
    providerTransactionId: "flw-verified-777",
    creditedAt: verifiedAt,
  };
  const verified = evaluatePaidOrderBinding({
    tenantId: 7,
    campaign,
    commitment,
    order,
    payment,
  });
  assert.equal(verified.verified, true);
  assert.equal(verified.providerVerified, true);

  const mismatched = evaluatePaidOrderBinding({
    tenantId: 7,
    campaign,
    commitment,
    order,
    payment: { ...payment, amount: 74_999, providerTransactionId: null },
  });
  assert.equal(mismatched.verified, false);
  assert.ok(mismatched.blockers.includes("payment_amount_mismatch"));
  assert.ok(mismatched.blockers.includes("provider_transaction_reference_required"));
});

test("batch progression requires exact paid allocation, production proof, carrier confirmation, and full delivery", () => {
  const paidCommitment = {
    id: "55555555-5555-4555-8555-555555555555",
    status: "allocated_to_batch",
    quantity: "150.0000",
    industrialOrderId: "66666666-6666-4666-8666-666666666666",
    canonicalPaymentVerified: true,
  };
  const allocation = {
    commitmentId: paidCommitment.id,
    industrialOrderId: paidCommitment.industrialOrderId,
    quantity: "150.0000",
    status: "allocated",
  };
  const baseBatch = {
    campaignId: campaign.id,
    tenantId: 7,
    targetQuantity: "150.0000",
    allocatedQuantity: "150.0000",
    producedQuantity: "0",
    passedInspectionQuantity: "0",
    readyQuantity: "0",
    handedToCarrierQuantity: "0",
    deliveredQuantity: "0",
    capacityEvidence: { verified: true },
    productionEvidence: [] as Array<Record<string, unknown>>,
    inspectionEvidence: [] as Array<Record<string, unknown>>,
    handoffEvidence: [] as Array<Record<string, unknown>>,
    deliveryEvidence: [] as Array<Record<string, unknown>>,
    settlementEvidence: [] as Array<Record<string, unknown>>,
    externalProductionExecuted: false,
    externalCarrierHandoffExecuted: false,
    externalSettlementExecuted: false,
    approvedByUserId: 41,
  };
  const funded = evaluateProductionBatchTransition({
    tenantId: 7,
    currentStatus: "capacity_confirmed",
    nextStatus: "funded_by_orders",
    campaign: { id: campaign.id, tenantId: 7, minimumQuantity: "100", committedQuantity: "150" },
    batch: baseBatch,
    commitments: [paidCommitment],
    allocations: [allocation],
  });
  assert.equal(funded.valid, true);

  const inTransit = evaluateProductionBatchTransition({
    tenantId: 7,
    currentStatus: "ready_for_pickup",
    nextStatus: "in_transit",
    campaign: { id: campaign.id, tenantId: 7, minimumQuantity: "100", committedQuantity: "150" },
    batch: {
      ...baseBatch,
      producedQuantity: "150",
      passedInspectionQuantity: "150",
      readyQuantity: "150",
      handedToCarrierQuantity: "150",
      carrierBookingAuthorizationId: "88888888-8888-4888-8888-888888888888",
      productionEvidence: [{ reference: "factory-run:44" }],
      inspectionEvidence: [{ reference: "inspection:44" }],
      handoffEvidence: [{ reference: "carrier-handoff:44" }],
      externalProductionExecuted: true,
      externalCarrierHandoffExecuted: true,
      startedAt: verifiedAt,
      readyAt: verifiedAt,
      handedToCarrierAt: verifiedAt,
    },
    commitments: [paidCommitment],
    allocations: [allocation],
    carrierBooking: {
      id: "88888888-8888-4888-8888-888888888888",
      tenantId: 7,
      status: "provider_confirmed",
      externalBookingExecuted: true,
      providerBookingReference: "carrier-booking:44",
      providerConfirmedAt: verifiedAt,
      providerConfirmationEvidence: { providerConfirmed: true },
    },
  });
  assert.equal(inTransit.valid, true);
  assert.equal(inTransit.externalProviderActionExecuted, false);

  const blocked = evaluateProductionBatchTransition({
    tenantId: 7,
    currentStatus: "ready_for_pickup",
    nextStatus: "in_transit",
    campaign: { id: campaign.id, tenantId: 7, minimumQuantity: "100", committedQuantity: "150" },
    batch: { ...baseBatch, producedQuantity: "150", passedInspectionQuantity: "150", readyQuantity: "150" },
    commitments: [paidCommitment],
    allocations: [allocation],
  });
  assert.equal(blocked.valid, false);
  assert.ok(blocked.blockers.includes("provider_confirmed_carrier_handoff_required"));
});

test("settlement allocations balance canonical gross and isolate refund exposure", () => {
  const valid = evaluateSettlementPlan({
    grossCollectedMinor: 100_000,
    refundExposureMinor: 5_000,
    currencyCode: "XOF",
    paidCommitments: [
      { id: "c1", totalAmountMinor: 60_000, currencyCode: "XOF", canonicalPaymentVerified: true },
      { id: "c2", totalAmountMinor: 40_000, currencyCode: "XOF", canonicalPaymentVerified: true },
    ],
    allocations: [
      { recipientRole: "producer_proceeds", amountMinor: 85_000, currencyCode: "XOF", calculationBasis: "Verified producer contract schedule.", evidence: { reference: "producer-contract" } },
      { recipientRole: "exportunity_commission", amountMinor: 10_000, currencyCode: "XOF", calculationBasis: "Approved platform fee schedule.", evidence: { reference: "fee-schedule" } },
      { recipientRole: "refund_exposure", amountMinor: 5_000, currencyCode: "XOF", calculationBasis: "Documented open refund exposure.", evidence: { reference: "refund-ledger" } },
    ],
    calculationEvidence: { verified: true, sourceReferences: ["canonical-paid-order-ledger"] },
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.distributableMinor, 95_000);
  assert.equal(valid.externalSettlementExecuted, false);

  const unbalanced = evaluateSettlementPlan({
    grossCollectedMinor: 100_000,
    refundExposureMinor: 5_000,
    currencyCode: "XOF",
    paidCommitments: [{ id: "c1", totalAmountMinor: 100_000, currencyCode: "XOF", canonicalPaymentVerified: true }],
    allocations: [{ recipientRole: "producer_proceeds", amountMinor: 90_000, currencyCode: "XOF", calculationBasis: "Incomplete producer allocation.", evidence: { reference: "draft" } }],
    calculationEvidence: { verified: true, sourceReferences: ["ledger"] },
  });
  assert.equal(unbalanced.valid, false);
  assert.ok(unbalanced.blockers.includes("settlement_allocations_do_not_balance"));
  assert.ok(unbalanced.blockers.includes("refund_exposure_allocation_mismatch"));
});

test("schema, runtime parity, Actions, routes, UI, and docs keep the commerce rail connected", async () => {
  const [
    schema,
    migration,
    ensure,
    policy,
    service,
    actions,
    route,
    routes,
    index,
    app,
    tenantPolicy,
    nav,
    publicPage,
    adminPage,
    docs,
  ] = await Promise.all([
    read("db/schema/group-buying.ts"),
    read("db/migrations/20270418_exportunity_group_buying_foundation.sql"),
    read("server/lib/group-buying/ensureTables.ts"),
    read("server/lib/group-buying/policy.ts"),
    read("server/lib/group-buying/service.ts"),
    read("server/lib/actions/actionDefinitions.ts"),
    read("server/routes/group-buying.ts"),
    read("server/routes.ts"),
    read("server/index.ts"),
    read("client/src/App.tsx"),
    read("client/src/lib/tenantPolicy.ts"),
    read("client/src/lib/adminNavRegistry.ts"),
    read("client/src/pages/exportunity/ProducerExchangePage.tsx"),
    read("client/src/pages/AdminGroupBuyingPage.tsx"),
    read("docs/industrial-os/07-group-buying-and-production-batches.md"),
  ]);

  for (const table of [
    "group_buying_campaigns",
    "group_buying_price_tiers",
    "group_buying_commitments",
    "group_buying_updates",
    "group_buying_events",
    "production_batches",
    "production_batch_allocations",
    "group_settlement_plans",
    "group_settlement_allocations",
  ]) {
    assert.ok(schema.includes(`"${table}"`), `schema missing ${table}`);
    assert.ok(migration.includes(table), `migration missing ${table}`);
    assert.ok(ensure.includes(table), `runtime parity missing ${table}`);
  }
  for (const constraint of [
    "group_buying_campaigns_commerce_rail_check",
    "group_buying_campaigns_live_truth_check",
    "group_buying_commitments_payment_truth_check",
    "production_batches_handoff_truth_check",
    "production_batches_settlement_truth_check",
    "group_settlement_plans_submission_truth_check",
    "group_settlement_plans_provider_truth_check",
  ]) {
    assert.ok(migration.includes(constraint), `migration missing ${constraint}`);
    assert.ok(ensure.includes(constraint), `runtime parity missing ${constraint}`);
  }
  for (const actionKey of [
    "GROUP_BUYING_CAMPAIGN_PREPARE",
    "GROUP_BUYING_CAMPAIGN_AUTHORIZE",
    "GROUP_BUYING_INTEREST_RECORD",
    "GROUP_BUYING_PAYMENT_BIND",
    "PRODUCTION_BATCH_PREPARE",
    "PRODUCTION_BATCH_RECORD_EVENT",
    "GROUP_BUYING_UPDATE_PUBLISH",
    "GROUP_SETTLEMENT_PREPARE",
    "GROUP_SETTLEMENT_AUTHORIZE",
  ]) assert.ok(actions.includes(actionKey), `action definition missing ${actionKey}`);

  assert.ok(policy.includes("regulated_capital_language_forbidden"));
  assert.ok(policy.includes("provider_confirmed_carrier_handoff_required"));
  assert.ok(policy.includes("provider_confirmed_settlement_required"));
  assert.doesNotMatch(service, /\bfetch\s*\(/);
  assert.doesNotMatch(service, /\.(?:createBooking|requestQuote|createPayment|submitSettlement)\s*\(/);
  assert.ok(route.includes('router.post("/campaigns/:campaignId/interest", ensureTenantUser'));
  assert.ok(route.includes('router.post("/admin/campaigns/prepare", ensureTenantAdmin'));
  assert.ok(route.includes('router.post("/admin/settlements/:settlementPlanId/approve", ensureTenantAdmin'));
  assert.ok(routes.includes('app.use("/api/group-buying", groupBuyingRouter)'));
  assert.ok(index.indexOf("await ensureMindbaseTables()") < index.indexOf("await ensureIndustrialTables()"));
  assert.ok(index.indexOf("await ensureTerritoryMediaCommerceTables()") < index.indexOf("await ensureGroupBuyingTables()"));
  assert.ok(app.includes('path="/producer-exchange/:slug"'));
  assert.ok(app.includes('path="/admin/group-buying"'));
  assert.ok(tenantPolicy.includes('{ prefix: "/producer-exchange", tenants: ["exportunity"] }'));
  assert.ok(nav.includes('route: "/admin/group-buying"'));
  assert.ok(publicPage.includes("Record non-binding interest"));
  assert.ok(publicPage.includes("No payment was collected and no inventory was reserved"));
  assert.ok(adminPage.includes("Provider execution is disabled here"));
  assert.ok(adminPage.includes("This control does not start production, book a carrier, or submit settlement"));
  assert.ok(docs.includes("SOURCE_COMPLETE"));
  assert.ok(docs.includes("UNKNOWN_REQUIRES_PRODUCTION_ACCESS"));
});
