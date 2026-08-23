import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  buildCommercialOfferPricing,
  calculateGrossMarginPrice,
  commercialOfferSourceEvidenceMatches,
  CommercialOfferPolicyError,
  formatMinorUnits,
  parseCommercialOfferApprovalInput,
  parseCommercialOfferDraftInput,
  parseCommercialOfferIssueInput,
  parseCommercialOfferSubmissionInput,
  parseExactDecimalToMinorUnits,
  parseQuotedMoneyToMinorUnits,
} from "../server/lib/exportunity/commercialOfferPolicy";

const sourceSupplierQuoteId = "623ad75f-60e6-4b26-ae48-47a91c491853";
const now = new Date("2026-08-21T12:00:00.000Z");

function validDraftInput() {
  return {
    sourceSupplierQuoteId,
    targetGrossMarginBps: 1500,
    validUntil: "2026-09-20T12:00:00.000Z",
    commercialTerms:
      "Supply is subject to final procurement and logistics validation by Exportunity.",
    customerNotes:
      "Draft commercial offer for the qualified refined palm-oil requirement.",
    internalNotes:
      "Pricing prepared from the qualified supplier source and supported internal cost evidence.",
    additionalCosts: [
      {
        code: "logistics",
        label: "Confirmed freight allowance",
        amount: "1000.00",
        evidenceReference: "carrier-quote:CARRIER-2026-0042",
      },
      {
        code: "customs_duties",
        label: "Reviewed customs allowance",
        amount: "500.00",
        evidenceReference: "customs-review:ABJ-2026-0088",
      },
    ],
  };
}

function validSourceQuote() {
  return {
    id: sourceSupplierQuoteId,
    quoteHash: "a".repeat(64),
    referenceCode: "SUPQ-2026-000042",
    currencyCode: "USD",
    totalAmount: "USD 92,000",
    productName: "Refined palm oil",
    specification: "RBD, food grade",
    offeredQuantity: "100 metric tonnes",
    unitOfMeasure: "MT",
    leadTime: "21 calendar days",
    incoterm: "FOB Cotonou",
  };
}

test("exact-money parsing uses currency minor units without binary floating point", () => {
  assert.equal(parseExactDecimalToMinorUnits("92000.10", "USD"), "9200010");
  assert.equal(parseExactDecimalToMinorUnits("92000", "XOF"), "92000");
  assert.equal(parseExactDecimalToMinorUnits("12.345", "KWD"), "12345");
  assert.equal(formatMinorUnits("9200010", "USD"), "92000.10");
  assert.equal(formatMinorUnits("92000", "XOF"), "92000");
  assert.throws(
    () => parseExactDecimalToMinorUnits("1.5", "XOF"),
    /supports 0 minor decimal places/,
  );
  assert.throws(
    () => parseExactDecimalToMinorUnits("92,000.00", "USD"),
    /without grouping separators/,
  );
});

test("source-backed supplier totals accept deterministic locale formats and reject ambiguity", () => {
  assert.equal(parseQuotedMoneyToMinorUnits("USD 92,000", "USD"), "9200000");
  assert.equal(parseQuotedMoneyToMinorUnits("92.000,00 EUR", "EUR"), "9200000");
  assert.equal(parseQuotedMoneyToMinorUnits("XOF 92 000", "XOF"), "92000");
  assert.throws(
    () => parseQuotedMoneyToMinorUnits("USD 90,000 or 92,000", "USD"),
    /exactly one unambiguous amount/,
  );
  assert.throws(
    () => parseQuotedMoneyToMinorUnits("KWD 1.234", "KWD"),
    /ambiguous for a three-decimal currency/,
  );
  assert.throws(
    () => parseQuotedMoneyToMinorUnits("- USD 92,000", "USD"),
    /Negative and scientific-notation/,
  );
});

test("gross-margin pricing uses integer ceiling division and preserves exact equality", () => {
  assert.deepEqual(calculateGrossMarginPrice("10000", 2000), {
    totalCostMinor: "10000",
    marginMinor: "2500",
    customerPriceMinor: "12500",
  });
  assert.deepEqual(calculateGrossMarginPrice("333", 1500), {
    totalCostMinor: "333",
    marginMinor: "59",
    customerPriceMinor: "392",
  });
  assert.throws(
    () => calculateGrossMarginPrice("10000", 5001),
    /must be an integer from 0 to 5000/,
  );
});

test("commercial pricing binds one canonical supplier quote, exact costs, margin, terms, and validity", () => {
  const request = parseCommercialOfferDraftInput(validDraftInput(), { now });
  const pricing = buildCommercialOfferPricing({
    request,
    sourceQuote: validSourceQuote(),
  });
  assert.equal(pricing.currencyCode, "USD");
  assert.equal(pricing.supplierCostMinor, "9200000");
  assert.equal(pricing.additionalCostsMinor, "150000");
  assert.equal(pricing.totalCostMinor, "9350000");
  assert.equal(pricing.marginMinor, "1650000");
  assert.equal(pricing.customerPriceMinor, "11000000");
  assert.equal(pricing.databaseTotalAmount, "110000.00");
  assert.equal(pricing.costStack[0].code, "supplier_base");
  assert.match(pricing.costStack[0].evidenceReference, /supplier_quote:/);
  assert.match(pricing.pricingHash, /^[0-9a-f]{64}$/);

  const reordered = validDraftInput();
  reordered.additionalCosts.reverse();
  const samePricing = buildCommercialOfferPricing({
    request: parseCommercialOfferDraftInput(reordered, { now }),
    sourceQuote: validSourceQuote(),
  });
  assert.equal(samePricing.pricingHash, pricing.pricingHash);
});

test("offer preparation blocks unsupported source totals, duplicate costs, and excessive margins", () => {
  const duplicate = validDraftInput();
  duplicate.additionalCosts.push({ ...duplicate.additionalCosts[0] });
  assert.throws(
    () => parseCommercialOfferDraftInput(duplicate, { now }),
    /one unique governed cost code/,
  );
  assert.throws(
    () =>
      parseCommercialOfferDraftInput(
        { ...validDraftInput(), targetGrossMarginBps: 5001 },
        { now },
      ),
    /cannot exceed 5000 basis points/,
  );
  const request = parseCommercialOfferDraftInput(validDraftInput(), { now });
  assert.throws(
    () =>
      buildCommercialOfferPricing({
        request,
        sourceQuote: { ...validSourceQuote(), totalAmount: null },
      }),
    /source-backed supplier total is required/,
  );
});

test("submission and approval are hash-bound and require every explicit attestation", () => {
  const submissionChecklist = {
    sourceQuoteReviewed: true,
    costEvidenceReviewed: true,
    currencyAndNoConversionReviewed: true,
    marginPolicyReviewed: true,
    validityReviewed: true,
    separateIssueRequired: true,
  };
  const approvalChecklist = {
    sourceLineageApproved: true,
    costStackApproved: true,
    marginApproved: true,
    customerTermsApproved: true,
    validityApproved: true,
    separateIssueRequired: true,
  };
  const hash = "b".repeat(64);
  assert.equal(
    parseCommercialOfferSubmissionInput({
      expectedPricingHash: hash,
      decisionNotes:
        "The exact source quote, costs, currency, margin, and validity were reviewed.",
      checklist: submissionChecklist,
    }).expectedPricingHash,
    hash,
  );
  assert.equal(
    parseCommercialOfferApprovalInput({
      expectedPricingHash: hash,
      decisionNotes:
        "The pricing is approved for account-manager preparation only, not issuance.",
      checklist: approvalChecklist,
    }).checklist.separateIssueRequired,
    true,
  );
  assert.throws(
    () =>
      parseCommercialOfferSubmissionInput({
        expectedPricingHash: hash,
        decisionNotes:
          "The exact source quote, costs, currency, margin, and validity were reviewed.",
        checklist: { ...submissionChecklist, separateIssueRequired: false },
      }),
    /separateIssueRequired must be explicitly confirmed/,
  );
});

test("customer-offer issuance is hash-bound and explicitly excludes external delivery", () => {
  const checklist = {
    sourceQualificationRechecked: true,
    approvedPricingHashRechecked: true,
    customerTermsAndPriceRechecked: true,
    validityWindowRechecked: true,
    customerContextConfirmed: true,
    separateDeliveryRequired: true,
  };
  const parsed = parseCommercialOfferIssueInput({
    expectedPricingHash: "c".repeat(64),
    decisionNotes:
      "The exact approved offer remains current for the tenant-scoped customer record.",
    checklist,
  });
  assert.equal(parsed.checklist.separateDeliveryRequired, true);
  assert.throws(
    () =>
      parseCommercialOfferIssueInput({
        expectedPricingHash: "c".repeat(64),
        decisionNotes:
          "The exact approved offer remains current for the tenant-scoped customer record.",
        checklist: { ...checklist, separateDeliveryRequired: false },
      }),
    /separateDeliveryRequired must be explicitly confirmed/,
  );
});

test("customer-offer issuance evidence rejects a changed supplier quote hash", () => {
  const sourceHash = "d".repeat(64);
  const costStack = [
    {
      code: "supplier_base",
      evidenceReference: `supplier_quote:${sourceSupplierQuoteId}:${sourceHash}`,
    },
  ];
  assert.equal(
    commercialOfferSourceEvidenceMatches(
      costStack,
      sourceSupplierQuoteId,
      sourceHash,
    ),
    true,
  );
  assert.equal(
    commercialOfferSourceEvidenceMatches(
      costStack,
      sourceSupplierQuoteId,
      "e".repeat(64),
    ),
    false,
  );
});

test("the exact workflow reuses industrial ledgers and separates issuance, response, order, payment, and delivery actions", () => {
  const service = readFileSync(
    path.join(process.cwd(), "server/lib/exportunity/commercialOffer.ts"),
    "utf8",
  );
  const policy = readFileSync(
    path.join(process.cwd(), "server/lib/exportunity/commercialOfferPolicy.ts"),
    "utf8",
  );
  const route = readFileSync(
    path.join(process.cwd(), "server/routes/exportunity-commercial-offers.ts"),
    "utf8",
  );
  const migration = readFileSync(
    path.join(
      process.cwd(),
      "db/migrations/20270521_exportunity_commercial_offer_drafts.sql",
    ),
    "utf8",
  );
  const industrialSchema = readFileSync(
    path.join(process.cwd(), "db/schema/industrial.ts"),
    "utf8",
  );
  const registry = readFileSync(
    path.join(process.cwd(), "server/lib/actions/actionRegistry.ts"),
    "utf8",
  );
  const mountedRoutes = readFileSync(
    path.join(process.cwd(), "server/routes.ts"),
    "utf8",
  );
  const industrialRoute = readFileSync(
    path.join(process.cwd(), "server/routes/industrial.ts"),
    "utf8",
  );
  const dealRoom = readFileSync(
    path.join(
      process.cwd(),
      "client/src/components/exportunity/IndustrialCommercialDealRoom.tsx",
    ),
    "utf8",
  );

  assert.match(service, /industrialQuotes/);
  assert.match(service, /industrialSupplierQuotes/);
  assert.match(service, /status: "draft"/);
  assert.match(service, /status: "under_review"/);
  assert.match(service, /status: "ready_for_account_manager"/);
  assert.match(service, /status: "issued"/);
  assert.match(service, /customerMessageSent: false/);
  assert.match(service, /COMMERCIAL_OFFER_SOURCE_HASH_CHANGED/);
  assert.match(service, /customerOfferIssued: false/);
  assert.match(service, /orderCreated: false/);
  assert.match(service, /paymentCreated: false/);
  assert.doesNotMatch(
    service,
    /sendMail|sendSms|sendWhatsApp|twilio|nodemailer|fetch\(|axios|parseFloat/i,
  );
  assert.doesNotMatch(service, /mindbase/i);
  assert.doesNotMatch(policy, /parseFloat/);

  assert.match(route, /COMMERCIAL_OFFER_DRAFT_CREATE/);
  assert.match(route, /COMMERCIAL_OFFER_PRICING_APPROVE/);
  assert.match(route, /COMMERCIAL_OFFER_ISSUE/);
  assert.match(route, /router\.post\("\/:id\/issue"/);
  assert.match(route, /externalSideEffect: false/);
  assert.doesNotMatch(
    route,
    /sendMail|sendSms|sendWhatsApp|twilio/i,
  );
  assert.doesNotMatch(route, /mindbase/i);

  assert.match(industrialSchema, /export const industrialQuotes = pgTable/);
  assert.match(industrialSchema, /sourceSupplierQuoteId: uuid/);
  assert.match(migration, /ALTER TABLE industrial_quotes/);
  assert.match(migration, /industrial_quotes_exact_pricing_check/);
  assert.match(migration, /customer_price_minor = total_cost_minor \+ margin_minor/);
  assert.match(migration, /no issued offer, order, payment, message, ranking/i);
  assert.match(registry, /COMMERCIAL_OFFER_PRICING_APPROVE/);
  assert.match(registry, /COMMERCIAL_OFFER_ISSUE/);
  assert.match(mountedRoutes, /\/api\/exportunity\/commercial-offers/);
  assert.match(industrialRoute, /EXPORTUNITY_LEGACY_COMMERCIAL_WRITE_RETIRED/);
  assert.match(
    industrialRoute,
    /"\/admin\/requirements\/:requirementId\/supplier-quotes",\s*ensureTenantStaff,\s*retiredLegacyCommercialWrite/,
  );
  assert.match(
    industrialRoute,
    /"\/admin\/requirements\/:requirementId\/commercial-offers",\s*ensureTenantStaff,\s*retiredLegacyCommercialWrite/,
  );
  assert.match(
    industrialRoute,
    /"\/admin\/commercial-offers\/:offerId\/approve",\s*ensureTenantAdmin,\s*retiredLegacyCommercialWrite/,
  );
  assert.match(
    industrialRoute,
    /"\/admin\/commercial-offers\/:offerId\/customer-quote",\s*ensureTenantStaff,\s*retiredLegacyCommercialWrite/,
  );
  assert.match(
    industrialRoute,
    /"\/admin\/requirements\/:requirementId\/quotes",\s*ensureTenantStaff,\s*retiredLegacyCommercialWrite/,
  );
  assert.match(
    industrialRoute,
    /"\/admin\/quotes\/:quoteId\/status",\s*ensureTenantStaff,\s*retiredLegacyCommercialWrite/,
  );
  assert.match(
    industrialRoute,
    /"\/admin\/quotes\/:quoteId\/orders",\s*ensureTenantStaff,\s*retiredLegacyCommercialWrite/,
  );
  assert.doesNotMatch(industrialRoute, /industrialSupplierQuoteCreateSchema/);
  assert.doesNotMatch(industrialRoute, /industrialCommercialOfferCreateSchema/);
  assert.doesNotMatch(industrialRoute, /industrialQuoteCreateSchema/);
  assert.doesNotMatch(industrialRoute, /calculateIndustrialCommercialPricing/);
  assert.match(dealRoom, /CommercialOfferWorkbench/);
  assert.doesNotMatch(dealRoom, /Prepare internal offer/);
  assert.doesNotMatch(dealRoom, /Record reviewed evidence/);
  assert.doesNotMatch(dealRoom, /const number = Number\(value\)/);
});

test("policy errors retain stable machine-readable codes", () => {
  assert.throws(
    () => parseExactDecimalToMinorUnits("not-money", "USD"),
    (error: unknown) =>
      error instanceof CommercialOfferPolicyError &&
      error.code === "COMMERCIAL_OFFER_AMOUNT_INVALID",
  );
});
