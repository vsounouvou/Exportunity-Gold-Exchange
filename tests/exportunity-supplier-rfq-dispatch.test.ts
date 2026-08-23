import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  assertSupplierRfqWhatsAppLength,
  computeSupplierRfqDispatchIdempotencyKey,
  EXPORTUNITY_RFQ_DISPATCH_CHECKLIST,
  hashSupplierRfqDispatchContact,
  maskSupplierRfqDispatchContact,
  normalizeSupplierRfqDispatchContact,
  parseSupplierRfqContactControlInput,
  parseSupplierRfqDispatchInput,
  redactSupplierRfqProviderError,
  SupplierRfqDispatchPolicyError,
} from "../server/lib/exportunity/supplierRfqDispatchPolicy";
import { resolveTwilioSendMaxAttempts } from "../server/lib/communications/twilioRetryPolicy";

const supplierProfileId = "11033159-9ccd-4e52-a505-3be925c1cfda";
const sourcePromotionId = "7dc97ceb-ce06-428e-86b6-46acffcc3ce8";
const decisionId = "3c370a3b-1a65-440c-9cb4-7c1837738e5f";
const contentHash = "a".repeat(64);
const now = new Date("2026-08-21T12:00:00.000Z");

function completeChecklist() {
  return Object.fromEntries(
    EXPORTUNITY_RFQ_DISPATCH_CHECKLIST.map((key) => [key, true]),
  );
}

function authorizedContactInput() {
  return {
    supplierProfileId,
    sourcePromotionId,
    channel: "email",
    contactValue: "  Commercial@Supplier.Example ",
    state: "authorized",
    authorizationBasis: "explicit_consent",
    evidenceReference: "crm-consent-record-1042",
    authorizationExpiresAt: "2026-09-20T12:00:00.000Z",
    notes:
      "The administrator reviewed the explicit consent record for this exact mailbox.",
  };
}

test("contact normalization, hashing, and masking are deterministic and channel-bound", () => {
  const email = normalizeSupplierRfqDispatchContact(
    "email",
    " Commercial@Supplier.Example ",
  );
  assert.equal(email, "commercial@supplier.example");
  const emailHash = hashSupplierRfqDispatchContact("email", email);
  assert.match(emailHash, /^[0-9a-f]{64}$/);
  assert.equal(emailHash, hashSupplierRfqDispatchContact("email", email));
  assert.equal(maskSupplierRfqDispatchContact("email", email), "c***@supplier.example");

  const phone = normalizeSupplierRfqDispatchContact(
    "whatsapp",
    "whatsapp: +229 97 00 00 00",
  );
  assert.equal(phone, "+22997000000");
  assert.notEqual(
    hashSupplierRfqDispatchContact("whatsapp", phone),
    hashSupplierRfqDispatchContact("email", phone),
  );
  assert.equal(maskSupplierRfqDispatchContact("whatsapp", phone), "+22***0000");
});

test("provider errors cannot persist a raw email or WhatsApp recipient", () => {
  const emailError = redactSupplierRfqProviderError(
    "SMTP rejected commercial@supplier.example with code 550",
    "commercial@supplier.example",
  );
  assert.doesNotMatch(emailError, /commercial@supplier\.example/);
  assert.match(emailError, /\[redacted-recipient\]/);

  const phoneError = redactSupplierRfqProviderError(
    "Twilio rejected whatsapp:+22997000000 for destination +22997000000",
    "+22997000000",
  );
  assert.doesNotMatch(phoneError, /22997000000/);
  assert.match(phoneError, /\[redacted-recipient\]/);
});

test("RFQ WhatsApp can force one transport attempt despite the shared retry default", () => {
  assert.equal(resolveTwilioSendMaxAttempts(undefined, 3), 3);
  assert.equal(resolveTwilioSendMaxAttempts(1, 3), 1);
  assert.equal(resolveTwilioSendMaxAttempts(2, 5), 2);
});

test("contact authorization is evidence-bound and suppression removes permission", () => {
  const authorized = parseSupplierRfqContactControlInput(
    authorizedContactInput(),
    { now },
  );
  assert.equal(authorized.state, "authorized");
  assert.equal(authorized.contactValue, "commercial@supplier.example");
  assert.equal(authorized.authorizationBasis, "explicit_consent");
  assert.equal(authorized.suppressionReason, null);

  assert.throws(
    () =>
      parseSupplierRfqContactControlInput(
        { ...authorizedContactInput(), evidenceReference: "" },
        { now },
      ),
    (error: unknown) =>
      error instanceof SupplierRfqDispatchPolicyError &&
      /evidenceReference/.test(error.message),
  );
  assert.throws(
    () =>
      parseSupplierRfqContactControlInput(
        {
          ...authorizedContactInput(),
          authorizationExpiresAt: "2026-11-30T12:00:00.000Z",
        },
        { now },
      ),
    /between 1 hour and 90 days/,
  );

  const suppressed = parseSupplierRfqContactControlInput(
    {
      supplierProfileId,
      sourcePromotionId,
      channel: "email",
      contactValue: "commercial@supplier.example",
      state: "suppressed",
      suppressionReason: "The supplier explicitly opted out of further outreach.",
      notes:
        "The opt-out was reviewed and must override every previous authorization record.",
    },
    { now },
  );
  assert.equal(suppressed.state, "suppressed");
  assert.equal(suppressed.authorizationBasis, null);
  assert.equal(suppressed.authorizationExpiresAt, null);
});

test("dispatch requires six attestations and exact content and recipient hashes", () => {
  const recipientHash = hashSupplierRfqDispatchContact(
    "email",
    "commercial@supplier.example",
  );
  const parsed = parseSupplierRfqDispatchInput({
    channel: "email",
    expectedContentHash: contentHash,
    expectedRecipientHash: recipientHash,
    dispatchNotes:
      "Send this exact approved revision now under the reviewed consent record.",
    checklist: completeChecklist(),
  });
  assert.equal(parsed.expectedContentHash, contentHash);
  assert.equal(parsed.expectedRecipientHash, recipientHash);
  assert.equal(parsed.checklist.noAutomaticRetry, true);

  assert.throws(
    () =>
      parseSupplierRfqDispatchInput({
        channel: "email",
        expectedContentHash: contentHash,
        expectedRecipientHash: recipientHash,
        dispatchNotes:
          "Send this exact approved revision now under the reviewed consent record.",
        checklist: { ...completeChecklist(), suppressionRegistryChecked: false },
      }),
    /suppressionRegistryChecked must be explicitly confirmed/,
  );
});

test("dispatch idempotency is stable and WhatsApp content has a hard bound", () => {
  const recipientHash = "b".repeat(64);
  const first = computeSupplierRfqDispatchIdempotencyKey({
    decisionId,
    contentHash,
    channel: "email",
    recipientHash,
  });
  const repeated = computeSupplierRfqDispatchIdempotencyKey({
    decisionId,
    contentHash,
    channel: "email",
    recipientHash,
  });
  assert.equal(first, repeated);
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.notEqual(
    first,
    computeSupplierRfqDispatchIdempotencyKey({
      decisionId,
      contentHash,
      channel: "whatsapp",
      recipientHash,
    }),
  );
  assert.equal(assertSupplierRfqWhatsAppLength("x".repeat(1600)), true);
  assert.throws(
    () => assertSupplierRfqWhatsAppLength("x".repeat(1601)),
    /must not exceed 1600 characters/,
  );
});

test("runtime and persistence enforce one governed provider attempt without storing raw contacts", () => {
  const service = readFileSync(
    path.join(process.cwd(), "server/lib/exportunity/supplierRfqDispatch.ts"),
    "utf8",
  );
  const policy = readFileSync(
    path.join(process.cwd(), "server/lib/exportunity/supplierRfqDispatchPolicy.ts"),
    "utf8",
  );
  const route = readFileSync(
    path.join(process.cwd(), "server/routes/exportunity-supplier-rfqs.ts"),
    "utf8",
  );
  const waGateway = readFileSync(
    path.join(process.cwd(), "server/lib/whatsapp/waGateway.ts"),
    "utf8",
  );
  const twilioTransport = readFileSync(
    path.join(process.cwd(), "server/lib/communications/twilio.ts"),
    "utf8",
  );
  const migration = readFileSync(
    path.join(
      process.cwd(),
      "db/migrations/20270430_exportunity_supplier_rfq_dispatch.sql",
    ),
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
  const adminPage = readFileSync(
    path.join(
      process.cwd(),
      "client/src/pages/AdminExportunitySupplierRfqsPage.tsx",
    ),
    "utf8",
  );

  assert.match(service, /sendEmailAsAgent/);
  assert.match(service, /sendWaText/);
  assert.match(service, /ensureMailEngineTables/);
  assert.match(service, /emailUnsubscribes/);
  assert.match(service, /SUPPLIER_RFQ_DISPATCH_RECIPIENT_SUPPRESSED_BEFORE_SEND/);
  assert.match(service, /attemptCount: 1/);
  assert.match(service, /automaticRetry: false/);
  assert.match(service, /maxProviderAttempts: 1/);
  assert.match(service, /tenantKey: input\.tenantKey/);
  assert.match(service, /acceptedIsNotDelivered: true/);
  assert.match(service, /dispatchCreated: true/);
  assert.match(service, /eq\(industrialSupplierRfqDispatches\.tenantId, input\.tenantId\)/);
  assert.match(service, /raw_contact_stored: false/);
  assert.match(policy, /\[redacted-email\]/);
  assert.match(service, /contactAuthorizationBasis: control\.authorizationBasis/);
  assert.match(service, /contactAuthorizationExpiresAt: control\.authorizationExpiresAt/);
  assert.match(waGateway, /maxProviderAttempts: options\.maxProviderAttempts/);
  assert.match(waGateway, /tenantKey: options\.tenantKey/);
  assert.match(twilioTransport, /resolveTwilioSendMaxAttempts\(maxAttemptsOverride\)/);
  assert.match(twilioTransport, /params\.maxProviderAttempts/);
  assert.match(twilioTransport, /getTwilioConfig\(params\.tenantKey\)/);
  assert.match(twilioTransport, /getTwilioClient\(params\.tenantKey\)/);

  assert.match(route, /SUPPLIER_RFQ_CONTACT_CONTROL_SET/);
  assert.match(route, /SUPPLIER_RFQ_DISPATCH_ONCE/);
  assert.match(route, /router\.post\("\/:id\/dispatch", ensureTenantAdmin/);
  assert.match(route, /maximumProviderAttempts: 1/);
  assert.match(route, /automaticRetry: false/);
  assert.match(route, /externalSideEffect: true/);

  assert.match(migration, /industrial_supplier_rfq_dispatches_draft_unique/);
  assert.match(migration, /industrial_supplier_rfq_dispatches_decision_unique/);
  assert.match(migration, /attempt_count BETWEEN 0 AND 1/);
  assert.match(migration, /decision = 'approved' OR dispatch_created = false/);
  assert.match(migration, /noAutomaticRetry/);
  assert.match(migration, /contact_authorization_basis/);
  assert.match(migration, /contact_evidence_reference/);
  assert.match(migration, /contact_authorization_expires_at > attempted_at/);
  assert.match(migration, /supplier_initiated_inquiry/);
  assert.match(migration, /Verified contact evidence alone never creates an authorized row/);
  assert.doesNotMatch(migration, /contact_value/);

  assert.match(schema, /industrialSupplierContactControls/);
  assert.match(schema, /industrialSupplierRfqDispatches/);
  assert.match(ensureTables, /industrial_supplier_rfq_dispatches_attempt_check/);
  assert.match(registry, /SUPPLIER_RFQ_CONTACT_CONTROL_SET/);
  assert.match(registry, /SUPPLIER_RFQ_DISPATCH_ONCE/);
  assert.match(adminPage, /Accepted by provider—not proof of delivery/);
  assert.match(adminPage, /No automatic retry/);
  assert.match(adminPage, /Verified contact is not permission/);

  for (const content of [service, policy, route, migration, adminPage]) {
    assert.doesNotMatch(content, /mindbase/i);
  }
});
