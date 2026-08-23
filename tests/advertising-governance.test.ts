import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  AD_BUDGET_SCOPE_TYPES,
  AD_CAMPAIGN_STATUSES,
  buildManualAdHandoffPackage,
  campaignStatusForBlockers,
  evaluateAdAccountReadiness,
  evaluateAdPreSpendReadiness,
  evaluateAgentBudgetReallocation,
  evaluateHierarchicalBudgetAvailability,
  sanitizeAdAccountVerificationEvidence,
} from "../server/lib/territory-media/advertisingPolicy";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const verifiedAt = "2026-08-17T00:00:00.000Z";
const account = {
  tenantId: 7,
  ownershipStatus: "business_owned",
  billingOwnershipStatus: "tenant_owned",
  authorizationStatus: "authorized",
  healthStatus: "healthy",
  restrictionStatus: "none",
  capabilities: ["create_advertisement"],
  permissions: ["ads_management"],
  verificationEvidence: {
    verified: true,
    businessOwned: true,
    billingTenantOwned: true,
    credentialsExcluded: true,
  },
  lastVerifiedAt: verifiedAt,
};
const envelope = {
  id: "envelope-1",
  tenantId: 7,
  parentEnvelopeId: "parent-1",
  scopeType: "neighborhood",
  currencyCode: "XOF",
  status: "active",
  periodStart: "2026-08-01T00:00:00.000Z",
  periodEnd: "2026-09-01T00:00:00.000Z",
  totalCapMinor: 100_000,
  dailyCapMinor: 20_000,
  weeklyCapMinor: 60_000,
  monthlyCapMinor: 100_000,
  committedMinor: 10_000,
  spentMinor: 20_000,
  maximumCacMinor: 2_500,
  minimumMarginBps: 1_500,
  agentReallocationAllowed: true,
  maximumReallocationBps: 1_000,
  approvedByUserId: 99,
  approvedAt: verifiedAt,
};

test("advertising scope and campaign state vocabularies are complete", () => {
  assert.deepEqual(AD_BUDGET_SCOPE_TYPES, [
    "global",
    "brand",
    "tenant",
    "country",
    "city",
    "neighborhood",
    "channel",
    "campaign",
    "test",
    "production",
    "rights",
  ]);
  assert.ok(AD_CAMPAIGN_STATUSES.includes("AWAITING_RIGHTS"));
  assert.ok(AD_CAMPAIGN_STATUSES.includes("AWAITING_STOCK"));
  assert.ok(AD_CAMPAIGN_STATUSES.includes("RESTRICTED"));
  assert.ok(AD_CAMPAIGN_STATUSES.includes("ACTIVE"));
});

test("ad account verification is business-owned, billing-owned, scoped, and credential-free", () => {
  const sanitized = sanitizeAdAccountVerificationEvidence(
    {
      verified: true,
      businessOwned: true,
      billingTenantOwned: true,
      credentialsExcluded: true,
      verifiedAt,
      providerReference: "meta-business:123",
      businessOwnerReference: "tenant-company:7",
      password: "must not survive",
      accessToken: "must not survive",
    },
    new Date("2026-08-17T00:01:00.000Z"),
  );
  assert.equal(sanitized.businessOwned, true);
  assert.equal(sanitized.billingTenantOwned, true);
  assert.equal("password" in sanitized, false);
  assert.equal("accessToken" in sanitized, false);
  const now = new Date("2026-08-17T00:01:00.000Z");
  assert.equal(evaluateAdAccountReadiness(account, now).ready, true);
  const blocked = evaluateAdAccountReadiness({ ...account, restrictionStatus: "restricted" }, now);
  assert.equal(blocked.ready, false);
  assert.ok(blocked.blockers.includes("ad_account_restriction_restricted"));
});

test("hierarchical budget availability honors total, daily, weekly, monthly, currency, and tenant bounds", () => {
  const ready = evaluateHierarchicalBudgetAvailability({
    tenantId: 7,
    currencyCode: "XOF",
    requestedMinor: 5_000,
    envelope,
    spentTodayMinor: 2_000,
    spentWeekMinor: 10_000,
    spentMonthMinor: 20_000,
    now: new Date("2026-08-17T12:00:00.000Z"),
  });
  assert.equal(ready.ready, true);
  assert.equal(ready.effectiveAvailableMinor, 18_000);
  assert.equal(ready.externalSpendAuthorized, false);

  const blocked = evaluateHierarchicalBudgetAvailability({
    tenantId: 7,
    currencyCode: "USD",
    requestedMinor: 30_000,
    envelope: { ...envelope, tenantId: 8 },
    spentTodayMinor: 1_000,
    spentWeekMinor: 1_000,
    spentMonthMinor: 1_000,
    now: new Date("2026-08-17T12:00:00.000Z"),
  });
  assert.equal(blocked.ready, false);
  assert.ok(blocked.blockers.some((item) => item.startsWith("cross_tenant_envelope_forbidden")));
  assert.ok(blocked.blockers.some((item) => item.startsWith("currency_mismatch")));
  assert.ok(blocked.blockers.some((item) => item.startsWith("daily_cap_exceeded")));
});

test("pre-spend gate rejects traffic to products that are not orderable or deliverable", () => {
  const result = evaluateAdPreSpendReadiness({
    tenantId: 7,
    currencyCode: "XOF",
    objective: "Generate attributable fulfilled orders",
    account,
    envelope,
    requestedBudgetMinor: 5_000,
    eligibleProducts: [{ productId: "sku-1", orderable: false, evidenceRef: "catalog:sku-1:v2", approvedFactRef: "facts:sku-1:v4" }],
    stockCapacityEvidence: { verified: true, availableUnits: 40, evidenceId: "stock:1", verifiedAt },
    territoryId: 33,
    territoryEvidence: { referenceId: "osm:place:33", verifiedAt },
    deliveryCoverageEvidence: {
      verified: true,
      serviceable: false,
      providerReference: "carrier-zone:44",
      verifiedAt,
    },
    landingPageUrl: "https://exportunity.net/products/sku-1",
    landingPageEvidence: { referenceId: "page-check:1", verifiedAt },
    trackingPlan: { trackingCode: "ad_123", conversionEvent: "fulfilled_order" },
    marginBps: 2_500,
    maximumCacMinor: 2_000,
    paidRightsEligible: true,
    rightsEvidence: { referenceId: "rights-grant:1", verifiedAt },
    policyStatus: "approved",
    stoppingConditions: {
      maxSpendMinor: 5_000,
      maxCacMinor: 2_000,
      pauseOnAccountRestriction: true,
      pauseWhenProductUnavailable: true,
      pauseWhenDeliveryUnavailable: true,
    },
    now: new Date("2026-08-17T12:00:00.000Z"),
  });
  assert.equal(result.readyForApproval, false);
  assert.ok(result.blockers.includes("product_not_orderable:sku-1"));
  assert.ok(result.blockers.includes("verified_delivery_coverage_required"));
  assert.equal(result.externalCampaignCreated, false);
  assert.equal(result.externalSpendAuthorized, false);
});

test("complete evidence can become approval-ready but never claims provider creation or spend", () => {
  const result = evaluateAdPreSpendReadiness({
    tenantId: 7,
    currencyCode: "XOF",
    objective: "Generate attributable fulfilled orders",
    account,
    envelope,
    requestedBudgetMinor: 5_000,
    spentTodayMinor: 0,
    spentWeekMinor: 0,
    spentMonthMinor: 0,
    eligibleProducts: [{ productId: "sku-1", orderable: true, evidenceRef: "catalog:sku-1:v2", approvedFactRef: "facts:sku-1:v4" }],
    stockCapacityEvidence: { verified: true, availableUnits: 40, evidenceId: "stock:1", verifiedAt },
    territoryId: 33,
    territoryEvidence: { referenceId: "osm:place:33", verifiedAt },
    deliveryCoverageEvidence: {
      verified: true,
      serviceable: true,
      providerReference: "carrier-zone:44",
      verifiedAt,
    },
    landingPageUrl: "https://exportunity.net/products/sku-1",
    landingPageEvidence: { referenceId: "page-check:1", verifiedAt },
    trackingPlan: { trackingCode: "ad_123", conversionEvent: "fulfilled_order" },
    marginBps: 2_500,
    maximumCacMinor: 2_000,
    paidRightsEligible: true,
    rightsEvidence: { referenceId: "rights-grant:1", verifiedAt },
    policyStatus: "approved",
    stoppingConditions: {
      maxSpendMinor: 5_000,
      maxCacMinor: 2_000,
      pauseOnAccountRestriction: true,
      pauseWhenProductUnavailable: true,
      pauseWhenDeliveryUnavailable: true,
    },
    now: new Date("2026-08-17T12:00:00.000Z"),
  });
  assert.equal(result.readyForApproval, true);
  assert.deepEqual(result.blockers, []);
  assert.equal(result.externalCampaignCreated, false);
  assert.equal(result.externalSpendAuthorized, false);

  const handoff = buildManualAdHandoffPackage({
    mediaPlanId: "plan-1",
    campaignId: "campaign-1",
    accountReference: "business-account-1",
    objective: "Generate fulfilled orders",
    territoryId: 33,
    requestedBudgetMinor: 5_000,
    currencyCode: "XOF",
    trackingCode: "ad_123",
    stoppingConditions: { maxSpendMinor: 5_000 },
  });
  assert.equal(handoff.status, "NEEDS_REVIEW");
  assert.equal(handoff.externalCampaignCreated, false);
  assert.equal(handoff.externalSpendPerformed, false);
});

test("agent budget reallocation remains inside approved tenant, currency, parent, percentage, and rights bounds", () => {
  const eligible = evaluateAgentBudgetReallocation({
    tenantId: 7,
    source: envelope,
    target: { ...envelope, id: "envelope-2", totalCapMinor: 50_000, committedMinor: 0, spentMinor: 0 },
    amountMinor: 5_000,
  });
  assert.equal(eligible.eligible, true);
  assert.equal(eligible.externalSpendPerformed, false);

  const blocked = evaluateAgentBudgetReallocation({
    tenantId: 7,
    source: envelope,
    target: { ...envelope, id: "rights-envelope", tenantId: 8, scopeType: "rights", currencyCode: "USD" },
    amountMinor: 20_000,
  });
  assert.equal(blocked.eligible, false);
  assert.ok(blocked.blockers.includes("cross_tenant_reallocation_forbidden"));
  assert.ok(blocked.blockers.includes("cross_currency_reallocation_forbidden"));
  assert.ok(blocked.blockers.includes("rights_budget_reallocation_requires_human_approval"));
  assert.ok(blocked.blockers.includes("reallocation_exceeds_approved_percentage"));
});

test("blockers map to accurate campaign preparation states", () => {
  assert.equal(campaignStatusForBlockers(["paid_ad_rights_required"]), "AWAITING_RIGHTS");
  assert.equal(campaignStatusForBlockers(["tenant_owned_billing_method_required"]), "AWAITING_ACCOUNT");
  assert.equal(campaignStatusForBlockers(["product_not_orderable:sku-1"]), "AWAITING_STOCK");
  assert.equal(campaignStatusForBlockers(["verified_delivery_coverage_required"]), "AWAITING_DELIVERY");
  assert.equal(campaignStatusForBlockers(["daily_cap_exceeded:channel"]), "AWAITING_BUDGET");
  assert.equal(campaignStatusForBlockers(["ad_account_restriction_restricted"]), "RESTRICTED");
});

test("all required entities, constraints, Actions, routes, and no-provider-spend invariants stay wired", async () => {
  const [schema, migration, ensure, service, policy, actions, routes, ui, app, nav] = await Promise.all([
    read("db/schema/territory-media-commerce.ts"),
    read("db/migrations/20270416_exportunity_advertising_governance.sql"),
    read("server/lib/territory-media/ensureAdvertisingTables.ts"),
    read("server/lib/territory-media/advertisingGovernance.ts"),
    read("server/lib/territory-media/advertisingPolicy.ts"),
    read("server/lib/actions/actionDefinitions.ts"),
    read("server/routes/admin-marketing.ts"),
    read("client/src/pages/AdminAdvertisingGovernancePage.tsx"),
    read("client/src/App.tsx"),
    read("client/src/lib/adminNavRegistry.ts"),
  ]);
  const entities = [
    "ad_account_connections",
    "ad_budget_envelopes",
    "media_plans",
    "ad_campaigns",
    "ad_groups_or_ad_sets",
    "ad_creatives",
    "spend_authorizations",
    "spend_ledger",
    "conversion_events",
    "attribution_records",
    "account_health_incidents",
  ];
  for (const entity of entities) {
    assert.match(schema, new RegExp(`"${entity}"`));
    assert.match(migration, new RegExp(entity));
    assert.match(ensure, new RegExp(entity));
  }
  assert.match(migration, /ad_campaigns_active_confirmation_check/);
  assert.match(migration, /ad_budget_envelopes_active_approval_check/);
  assert.match(migration, /spend_authorizations_approved_check/);
  assert.match(migration, /spend_ledger_no_update/);
  assert.match(migration, /spend_ledger_no_delete/);
  assert.match(migration, /weight_bps between 0 and 10000/);
  assert.match(service, /usageType: "paid_ad"/);
  assert.match(service, /pg_advisory_xact_lock/);
  assert.match(service, /assertNoCredentialMaterial/);
  assert.match(service, /externalCampaignCreated: false/);
  assert.match(service, /externalSpendPerformed: false/);
  assert.doesNotMatch(service, /createAdvertisement\(/);
  assert.doesNotMatch(service, /accessToken/);
  assert.doesNotMatch(service, /password:/);
  assert.match(policy, /product_not_orderable/);
  assert.match(policy, /verified_delivery_coverage_required/);
  assert.match(policy, /paid_ad_rights_required/);
  assert.match(policy, /cross_tenant_reallocation_forbidden/);
  for (const action of [
    "AD_ACCOUNT_VERIFICATION_RECORD",
    "AD_BUDGET_ENVELOPE_PREPARE",
    "AD_BUDGET_ENVELOPE_APPROVE",
    "AD_MEDIA_PLAN_PREPARE",
    "AD_MEDIA_PLAN_APPROVE",
    "AD_SPEND_AUTHORIZATION_PREPARE",
    "AD_SPEND_AUTHORIZATION_APPROVE",
  ]) {
    assert.match(actions, new RegExp(action));
  }
  assert.match(routes, /marketing\/ads\/governance/);
  assert.match(routes, /marketing\/ads\/accounts\/record-verification/);
  assert.match(routes, /marketing\/ads\/media-plans\/prepare/);
  assert.match(routes, /marketing\/ads\/spend-authorizations\/prepare/);
  assert.match(ui, /There is deliberately no “Launch campaign” or “Spend now” control/);
  assert.match(ui, /No provider campaign or spend was executed/);
  assert.match(app, /admin\/advertising-governance/);
  assert.match(nav, /ADVERTISING_GOVERNANCE_NAV_ITEM/);
});
