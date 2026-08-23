import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  CANONICAL_COMMERCE_ATTRIBUTION_MIGRATION,
  evaluateCanonicalFulfilledOrderAttribution,
  normalizeCanonicalAttributionEvidence,
} from "../server/lib/territory-media/canonicalCommerceAttributionPolicy";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const beforeDelivery = "2026-08-14T10:00:00.000Z";
const deliveredAt = "2026-08-17T10:00:00.000Z";

function fixture() {
  return {
    tenantId: 7,
    sourceKind: "ad_campaign",
    order: {
      id: "order-1",
      tenantId: 7,
      status: "completed",
      completedAt: deliveredAt,
      paymentStatus: "paid",
      lastPaymentId: "payment-1",
      paidAmount: "125000",
      paidCurrencyCode: "XOF",
    },
    payment: {
      id: "payment-1",
      tenantId: 7,
      status: "succeeded",
      creditedAt: "2026-08-15T10:00:00.000Z",
      purpose: "INDUSTRIAL_ORDER_PAYMENT",
      targetType: "INDUSTRIAL_ORDER",
      targetId: "order-1",
      amount: 125000,
      currency: "XOF",
    },
    fulfillmentPlan: {
      id: "fulfillment-1",
      tenantId: 7,
      orderId: "order-1",
      status: "delivered",
      deliveredAt,
    },
    campaign: {
      id: "campaign-1",
      tenantId: 7,
      territoryId: 33,
      status: "ACTIVE",
      providerConfirmedAt: beforeDelivery,
      activatedAt: beforeDelivery,
      trackingCode: "ad_campaign_tracking_1",
    },
    creative: {
      id: "creative-1",
      tenantId: 7,
      campaignId: "campaign-1",
      status: "APPROVED",
      mediaItemId: "media-1",
      sourceReferenceId: 41,
      rightsGrantId: 51,
    },
    rightsEligibility: { eligible: true, grantId: 51 },
    attributionEvidence: {
      type: "tracking_code",
      reference: "order-tracking-audit:order-1:ad_campaign_tracking_1",
      verified: true,
      credentialsExcluded: true,
    },
  };
}

test("canonical fulfilled-order attribution accepts only the exact paid, delivered, rights-cleared chain", () => {
  const result = evaluateCanonicalFulfilledOrderAttribution(fixture());
  assert.equal(result.eligible, true);
  assert.deepEqual(result.blockers, []);
  assert.equal(result.territoryId, 33);
  assert.equal(result.amountMinor, 125000);
  assert.equal(result.touchpointReference, "ad_campaign_tracking_1");
  assert.equal(result.credentialsExcluded, true);
  assert.equal(result.externalActionPerformed, false);
  assert.equal(result.backgroundExecutionStarted, false);
});

test("canonical attribution fails closed on cross-tenant rows, amount drift, missing current rights, and post-delivery touchpoints", () => {
  const base = fixture();
  const result = evaluateCanonicalFulfilledOrderAttribution({
    ...base,
    payment: { ...base.payment, tenantId: 8, amount: 125001 },
    campaign: { ...base.campaign, activatedAt: "2026-08-18T10:00:00.000Z" },
    rightsEligibility: { eligible: false, grantId: null },
  });
  assert.equal(result.eligible, false);
  assert.ok(result.blockers.includes("canonical_rows_cross_tenant_or_missing"));
  assert.ok(result.blockers.includes("order_payment_amount_mismatch"));
  assert.ok(result.blockers.includes("current_media_rights_required"));
  assert.ok(result.blockers.includes("rights_grant_mismatch"));
  assert.ok(result.blockers.includes("touchpoint_after_delivery"));
});

test("organic attribution requires a confirmed publication and rejects credential-like evidence references", () => {
  const base = fixture();
  const organic = evaluateCanonicalFulfilledOrderAttribution({
    ...base,
    sourceKind: "social_publication",
    campaign: null,
    creative: null,
    publicationAttempt: {
      id: "publication-1",
      tenantId: 7,
      territoryId: 33,
      status: "PUBLISHED",
      providerConfirmedAt: beforeDelivery,
      publishedAt: beforeDelivery,
      mediaItemId: "media-1",
      sourceReferenceId: 41,
      rightsGrantId: 51,
    },
  });
  assert.equal(organic.eligible, true);
  assert.equal(organic.touchpointReference, "social-publication:publication-1");

  assert.throws(
    () =>
      normalizeCanonicalAttributionEvidence({
        type: "provider_receipt",
        reference: "https://provider.invalid/receipt?access_token=forbidden",
        verified: true,
        credentialsExcluded: true,
      }),
    /must not contain credentials/,
  );
});

test("migration, schema, runtime parity, Action, services, routes, and both accountable UIs stay wired", async () => {
  assert.equal(
    CANONICAL_COMMERCE_ATTRIBUTION_MIGRATION,
    "20270423_exportunity_canonical_commerce_attribution.sql",
  );
  const [migration, schema, ensure, actions, service, adRoutes, territoryRoutes, adUi, territoryUi] =
    await Promise.all([
      read("db/migrations/20270423_exportunity_canonical_commerce_attribution.sql"),
      read("db/schema/territory-media-commerce.ts"),
      read("server/lib/territory-media/ensureAdvertisingTables.ts"),
      read("server/lib/actions/actionDefinitions.ts"),
      read("server/lib/territory-media/canonicalCommerceAttribution.ts"),
      read("server/routes/admin-marketing.ts"),
      read("server/routes/territories.ts"),
      read("client/src/pages/AdminAdvertisingGovernancePage.tsx"),
      read("client/src/components/exportunity/TerritoryOperatingLayerPanel.tsx"),
    ]);

  for (const source of [migration, schema, ensure]) {
    assert.match(source, /canonical_binding_status/);
    assert.match(source, /industrial_order_id/);
    assert.match(source, /fulfillment_plan_id/);
    assert.match(source, /publication_attempt_id/);
    assert.match(source, /rights_grant_id/);
  }
  assert.match(migration, /conversion_events_verified_order_uniq/);
  assert.match(migration, /exportunity_validate_canonical_conversion_binding/);
  assert.match(migration, /exportunity_validate_canonical_attribution_binding/);
  assert.match(actions, /COMMERCE_ATTRIBUTION_RECONCILE/);
  assert.match(service, /pg_advisory_xact_lock/);
  assert.match(service, /canonical_fulfilled_order_last_touch/);
  assert.match(service, /previewCanonicalTerritoryScorecard/);
  assert.match(service, /recordTerritoryScorecardEvidence/);
  assert.match(service, /Unknown metrics remain null/);
  assert.match(adRoutes, /conversions\/reconcile-fulfilled-order/);
  assert.match(territoryRoutes, /scorecards\/canonical-preview/);
  assert.match(territoryRoutes, /scorecards\/canonical/);
  assert.match(adUi, /Reconcile canonical fulfilled-order attribution/);
  assert.match(territoryUi, /Record canonical ledger projection/);
  assert.match(territoryUi, /Unknown metrics must remain unknown/);
});
