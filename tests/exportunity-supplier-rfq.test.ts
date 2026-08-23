import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  assertSupplierRfqContentIntegrity,
  composeSupplierRfqContent,
  EXPORTUNITY_RFQ_REQUESTED_FIELDS,
  parseSupplierRfqApprovalInput,
  parseSupplierRfqDraftInput,
  SupplierRfqPolicyError,
} from "../server/lib/exportunity/supplierRfqPolicy";
import { EXPORTUNITY_SUPPLIER_VERIFICATION_SCOPE } from "../server/lib/exportunity/supplierVerificationPolicy";

const promotionId = "84e587ca-a90a-4c82-9ccf-35fe279e6fd4";
const now = new Date("2026-08-21T12:00:00.000Z");

function validDraftInput() {
  return {
    promotionId,
    buyerInstructions:
      "Quote food-grade export packaging and identify the applicable product standard.",
    responseDeadline: "2026-08-28T12:00:00.000Z",
  };
}

function validApproval() {
  return {
    authorizationWindowHours: 24,
    decisionNotes:
      "The exact RFQ content, current requirement, and verified official contact were reviewed for controlled outreach.",
    checklist: {
      contentReviewed: true,
      recipientMatchesVerifiedContact: true,
      requirementStillCurrent: true,
      noUnsupportedCommercialClaims: true,
      buyerDataApprovedForDisclosure: true,
      separateDispatchRequired: true,
    },
  };
}

function composedDraft() {
  const parsed = parseSupplierRfqDraftInput(validDraftInput(), { now });
  return composeSupplierRfqContent({
    requirement: {
      referenceCode: "REQ-2026-1042",
      title: "RBD palm oil for industrial food production",
      details: "Food-grade refined, bleached and deodorized palm oil; supplier must state the applicable specification.",
      quantityText: "4 x 20-foot containers",
      deliveryCountryCode: "BJ",
      deliveryCity: "Cotonou",
      requiredBy: "2026-10-15T00:00:00.000Z",
    },
    supplier: {
      legalName: "West Africa Edible Oils SA",
      countryCode: "CI",
      contactType: "email",
      contactValue: "commercial@supplier.example",
      verificationScope: EXPORTUNITY_SUPPLIER_VERIFICATION_SCOPE,
    },
    buyerInstructions: parsed.buyerInstructions,
    responseDeadline: parsed.responseDeadline,
  });
}

test("RFQ draft input requires a governed promotion and a bounded future deadline", () => {
  const parsed = parseSupplierRfqDraftInput(validDraftInput(), { now });
  assert.equal(parsed.promotionId, promotionId);
  assert.equal(parsed.responseDeadline.toISOString(), "2026-08-28T12:00:00.000Z");

  assert.throws(
    () =>
      parseSupplierRfqDraftInput(
        { ...validDraftInput(), responseDeadline: "2026-08-21T13:00:00.000Z" },
        { now },
      ),
    /between 24 and 1080 hours from now/,
  );
  assert.throws(
    () => parseSupplierRfqDraftInput({ ...validDraftInput(), promotionId: "not-a-uuid" }, { now }),
    /promotionId must be a valid UUID/,
  );
});

test("RFQ composition asks for commercial facts without inventing them", () => {
  const draft = composedDraft();
  assert.equal(draft.requestedFields.length, EXPORTUNITY_RFQ_REQUESTED_FIELDS.length);
  assert.match(draft.messageBody, /Please state: unit price, currency, minimum order quantity/);
  assert.match(draft.messageBody, /has not pre-verified capacity, pricing, certification, lead time, or performance/);
  assert.match(draft.messageBody, /reply with that instruction and we will suppress the contact/);
  assert.match(draft.messageBody, /not a purchase order, contract, payment request, or commitment to buy/);
  assert.equal(draft.supplierSnapshot.contactValue, "commercial@supplier.example");
  assert.match(draft.contentHash, /^[0-9a-f]{64}$/);

  const repeated = composedDraft();
  assert.equal(repeated.contentHash, draft.contentHash);
  assert.doesNotMatch(
    draft.messageBody,
    /guaranteed|best price|capacity (?:is|has been) verified/i,
  );
});

test("content integrity blocks approval after any exact-content change", () => {
  const draft = composedDraft();
  assert.equal(assertSupplierRfqContentIntegrity(draft), true);
  assert.throws(
    () => assertSupplierRfqContentIntegrity({ ...draft, subject: `${draft.subject} changed` }),
    (error: unknown) =>
      error instanceof SupplierRfqPolicyError &&
      /no longer matches its approval hash/.test(error.message),
  );
});

test("outreach approval requires six explicit attestations and a bounded expiry window", () => {
  const approval = parseSupplierRfqApprovalInput(validApproval());
  assert.equal(approval.authorizationWindowHours, 24);
  assert.equal(approval.checklist.separateDispatchRequired, true);

  const missing = validApproval();
  missing.checklist.separateDispatchRequired = false;
  assert.throws(
    () => parseSupplierRfqApprovalInput(missing),
    /separateDispatchRequired must be explicitly confirmed/,
  );
  assert.throws(
    () => parseSupplierRfqApprovalInput({ ...validApproval(), authorizationWindowHours: 169 }),
    /must be an integer from 1 to 168/,
  );
});

test("RFQ persistence and routes are hash-bound, approval-gated, and sender-free", () => {
  const service = readFileSync(
    path.join(process.cwd(), "server/lib/exportunity/supplierRfq.ts"),
    "utf8",
  );
  const route = readFileSync(
    path.join(process.cwd(), "server/routes/exportunity-supplier-rfqs.ts"),
    "utf8",
  );
  const migration = readFileSync(
    path.join(process.cwd(), "db/migrations/20270420_exportunity_supplier_rfq_drafts.sql"),
    "utf8",
  );
  const schema = readFileSync(
    path.join(process.cwd(), "db/schema/industrial.ts"),
    "utf8",
  );
  const ensureTables = readFileSync(
    path.join(process.cwd(), "server/lib/industrial/ensureTables.ts"),
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
  const adminPage = readFileSync(
    path.join(process.cwd(), "client/src/pages/AdminExportunitySupplierRfqsPage.tsx"),
    "utf8",
  );

  assert.match(service, /industrialSupplierPromotions/);
  assert.match(service, /industrialSupplierRfqDrafts/);
  assert.match(service, /industrialSupplierRfqDecisions/);
  assert.match(service, /assertCurrentContent/);
  assert.match(service, /promotionOutreachAllowed !== false/);
  assert.match(service, /supplierVerificationStatus !== "verified"/);
  assert.match(service, /supplierVisibility !== "exportunity_internal"/);
  assert.match(service, /deliveryStatus: "not_sent"/);
  assert.match(service, /dispatchCreated: false/);
  assert.match(service, /separateDispatchRequired: true/);
  assert.doesNotMatch(service, /sendMail|sendSms|sendWhatsApp|twilio|nodemailer|fetch\(|axios/i);
  assert.doesNotMatch(service, /mindbase/i);

  assert.match(route, /ensureTenantStaff/);
  assert.match(route, /ensureTenantAdmin/);
  assert.match(route, /SUPPLIER_RFQ_DRAFT_CREATE/);
  assert.match(route, /SUPPLIER_RFQ_SUBMIT_FOR_APPROVAL/);
  assert.match(route, /SUPPLIER_RFQ_APPROVE_OUTREACH/);
  assert.match(route, /externalSideEffect: false/);
  assert.match(route, /deliveryCreated: false/);
  assert.doesNotMatch(route, /sendMail|sendSms|sendWhatsApp|twilio|nodemailer|fetch\(|axios/i);

  assert.match(migration, /industrial_supplier_rfq_drafts_no_delivery_check/);
  assert.match(migration, /delivery_status = 'not_sent'/);
  assert.match(migration, /industrial_supplier_rfq_decisions_draft_unique/);
  assert.match(migration, /content_hash ~ '\^\[0-9a-f\]\{64\}\$'/);
  assert.match(migration, /separateDispatchRequired/);
  assert.match(migration, /dispatch_created = false/);
  assert.match(schema, /industrialSupplierRfqDrafts/);
  assert.match(schema, /industrialSupplierRfqDecisions/);
  assert.match(ensureTables, /CREATE TABLE IF NOT EXISTS industrial_supplier_rfq_drafts/);

  assert.match(registry, /SUPPLIER_RFQ_APPROVE_OUTREACH/);
  assert.match(registry, /approvalRequired: true, requiresEvidence: true/);
  assert.match(mountedRoutes, /\/api\/exportunity\/supplier-rfqs/);
  assert.match(adminPage, /Verified contact data alone never grants permission/);
  assert.match(adminPage, /Approval never sends/);
  assert.match(adminPage, /Dispatch created: \{draft\.decision\.dispatchCreated/);
  assert.doesNotMatch(adminPage, /mindbase/i);
});
