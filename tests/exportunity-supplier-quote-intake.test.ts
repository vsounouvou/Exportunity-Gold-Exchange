import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  correlateSupplierQuoteReply,
  detectSupplierQuoteOptOut,
  EXPORTUNITY_SUPPLIER_QUOTE_REVIEW_CHECKLIST,
  normalizeSupplierQuoteMessage,
  parseSupplierQuoteReviewInput,
  SupplierQuoteIntakePolicyError,
  type SupplierQuoteDispatchCandidate,
} from "../server/lib/exportunity/supplierQuoteIntakePolicy";

const now = new Date("2026-08-21T12:00:00.000Z");

function candidate(
  update: Partial<SupplierQuoteDispatchCandidate> = {},
): SupplierQuoteDispatchCandidate {
  return {
    id: "11033159-9ccd-4e52-a505-3be925c1cfda",
    status: "accepted",
    providerMessageId: "SM11111111111111111111111111111111",
    referenceCode: "RFQ-2026-0042",
    recipientHash: "a".repeat(64),
    attemptedAt: new Date("2026-08-20T12:00:00.000Z"),
    responseDeadline: new Date("2026-08-28T12:00:00.000Z"),
    ...update,
  };
}

test("deterministic normalization preserves evidence and exposes every missing field", () => {
  const result = normalizeSupplierQuoteMessage({
    subject: "Quotation Q-882 for RFQ-2026-0042",
    body: [
      "Quotation reference: Q-882",
      "Product: Refined palm oil",
      "Specification: RBD, food grade",
      "Offered quantity: 100 metric tonnes",
      "Unit of measure: MT",
      "Currency: USD",
      "Unit price: USD 42.50 per piece",
      "Total amount: USD 4,250.00",
      "MOQ: 100 pieces",
      "Packaging: 50 kg jerrycans",
      "Lead time: 21 calendar days",
      "Incoterm: FOB Cotonou",
      "Payment terms: 30% deposit, 70% before shipment",
      "Valid until: 30 September 2026",
      "Country of origin: Benin",
      "Certifications: ISO 9001 and HACCP",
      "Supplier notes: Subject to final stock confirmation",
    ].join("\n"),
    attachmentNames: ["quotation-Q-882.pdf"],
  });

  assert.equal(result.quoteLike, true);
  assert.equal(result.fields.currencyCode.state, "provided");
  assert.equal(result.fields.currencyCode.value, "USD");
  assert.equal(result.fields.productName.value, "Refined palm oil");
  assert.equal(result.fields.specification.value, "RBD, food grade");
  assert.equal(result.fields.offeredQuantity.value, "100 metric tonnes");
  assert.equal(result.fields.unitOfMeasure.value, "MT");
  assert.equal(result.fields.unitPrice.value, "USD 42.50 per piece");
  assert.equal(result.fields.packaging.value, "50 kg jerrycans");
  assert.equal(result.fields.certifications.value, "ISO 9001 and HACCP");
  assert.equal(result.fields.incoterm.value, "FOB");
  assert.equal(result.fields.warranty.state, "missing");
  assert.ok(result.missingFields.includes("warranty"));
  assert.equal(result.ambiguousFields.length, 0);
  assert.match(
    String(result.fields.totalAmount.evidenceExcerpt),
    /Total amount/,
  );
});

test("compact supplier terms retain source-backed price, MOQ, and packaging", () => {
  const result = normalizeSupplierQuoteMessage({
    body: "FOB Tema USD 920/MT, MOQ 50 MT, 15 days, 50kg jerrycans",
  });
  assert.equal(result.fields.currencyCode.value, "USD");
  assert.equal(result.fields.unitPrice.value, "USD 920/MT");
  assert.equal(result.fields.minimumOrderQuantity.value, "50 MT");
  assert.equal(result.fields.packaging.value, "50kg jerrycans");
  assert.equal(result.fields.incoterm.value, "FOB");
});

test("certificate attachment names remain traceable source evidence", () => {
  const result = normalizeSupplierQuoteMessage({
    attachmentNames: ["ISO-9001-certificate.pdf"],
  });
  assert.equal(result.fields.certifications.value, "ISO-9001-certificate");
  assert.equal(
    result.fields.certifications.sourceLocator,
    "attachment.1.name",
  );
});

test("conflicting source values remain ambiguous instead of being selected", () => {
  const result = normalizeSupplierQuoteMessage({
    body: [
      "Quote total: USD 1,000",
      "Revised quote total: USD 950",
      "Currency: USD",
      "Currency: EUR",
    ].join("\n"),
  });
  assert.equal(result.fields.totalAmount.state, "ambiguous");
  assert.equal(result.fields.totalAmount.value, null);
  assert.equal(result.fields.currencyCode.state, "ambiguous");
  assert.ok(result.ambiguousFields.includes("totalAmount"));
  assert.ok(result.ambiguousFields.includes("currencyCode"));
});

test("provider reply context has priority over RFQ reference and recipient inference", () => {
  const exact = correlateSupplierQuoteReply({
    providerReplyIds: ["<sm11111111111111111111111111111111>"],
    referenceText: "Response without a typed RFQ reference",
    contactHash: "b".repeat(64),
    receivedAt: now,
    candidates: [candidate()],
  });
  assert.equal(exact.status, "exact");
  assert.equal(exact.method, "provider_reply_reference");
  assert.equal(exact.dispatchId, candidate().id);

  const byReference = correlateSupplierQuoteReply({
    referenceText: "Please find our response for RFQ-2026-0042 attached.",
    contactHash: "b".repeat(64),
    receivedAt: now,
    candidates: [candidate()],
  });
  assert.equal(byReference.status, "exact");
  assert.equal(byReference.method, "rfq_reference");
});

test("an empty candidate reference never becomes an exact match", () => {
  const result = correlateSupplierQuoteReply({
    referenceText: "An unrelated supplier response",
    contactHash: "b".repeat(64),
    receivedAt: now,
    candidates: [candidate({ referenceCode: "" })],
  });
  assert.equal(result.status, "unmatched");
  assert.deepEqual(result.candidateDispatchIds, []);
});

test("recipient-window correlation is inferred only when one candidate exists", () => {
  const inferred = correlateSupplierQuoteReply({
    contactHash: "a".repeat(64),
    receivedAt: now,
    candidates: [candidate()],
  });
  assert.equal(inferred.status, "inferred");
  assert.equal(inferred.method, "recipient_response_window");

  const ambiguous = correlateSupplierQuoteReply({
    contactHash: "a".repeat(64),
    receivedAt: now,
    candidates: [
      candidate(),
      candidate({
        id: "7dc97ceb-ce06-428e-86b6-46acffcc3ce8",
        providerMessageId: "SM22222222222222222222222222222222",
        referenceCode: "RFQ-2026-0043",
      }),
    ],
  });
  assert.equal(ambiguous.status, "ambiguous");
  assert.equal(ambiguous.dispatchId, null);
  assert.equal(ambiguous.candidateDispatchIds.length, 2);
});

test("an explicit provider reply remains exact after the inference window", () => {
  const lateReply = correlateSupplierQuoteReply({
    providerReplyIds: ["SM11111111111111111111111111111111"],
    contactHash: "a".repeat(64),
    receivedAt: new Date("2026-10-21T12:00:00.000Z"),
    candidates: [candidate()],
  });
  assert.equal(lateReply.status, "exact");
  assert.equal(lateReply.method, "provider_reply_reference");

  const lateReference = correlateSupplierQuoteReply({
    referenceText: "Late response for RFQ-2026-0042",
    contactHash: "a".repeat(64),
    receivedAt: new Date("2026-10-21T12:00:00.000Z"),
    candidates: [candidate()],
  });
  assert.equal(lateReference.status, "exact");
  assert.equal(lateReference.method, "rfq_reference");
});

test("expired inference, failed dispatches, and future attempts stay unmatched", () => {
  const expiredInference = correlateSupplierQuoteReply({
    contactHash: "a".repeat(64),
    receivedAt: new Date("2026-10-21T12:00:00.000Z"),
    candidates: [candidate()],
  });
  assert.equal(expiredInference.status, "unmatched");

  const result = correlateSupplierQuoteReply({
    providerReplyIds: ["SM11111111111111111111111111111111"],
    referenceText: "RFQ-2026-0042",
    contactHash: "a".repeat(64),
    receivedAt: now,
    candidates: [
      candidate({ status: "failed" }),
      candidate({
        id: "7dc97ceb-ce06-428e-86b6-46acffcc3ce8",
        attemptedAt: new Date("2026-08-22T12:00:00.000Z"),
      }),
    ],
  });
  assert.equal(result.status, "unmatched");
  assert.deepEqual(result.candidateDispatchIds, []);
});

test("recipient opt-out detection is explicit and avoids unrelated stop wording", () => {
  assert.equal(detectSupplierQuoteOptOut("STOP"), true);
  assert.equal(detectSupplierQuoteOptOut("STOPALL"), true);
  assert.equal(detectSupplierQuoteOptOut("Please opt us out."), true);
  assert.equal(
    detectSupplierQuoteOptOut("Please remove us from your contact list."),
    true,
  );
  assert.equal(
    detectSupplierQuoteOptOut("Do not stop production while preparing the quote."),
    false,
  );
});

test("quote qualification requires four explicit human attestations", () => {
  const checklist = Object.fromEntries(
    EXPORTUNITY_SUPPLIER_QUOTE_REVIEW_CHECKLIST.map((key) => [key, true]),
  );
  const parsed = parseSupplierQuoteReviewInput({
    decision: "qualified",
    reviewNotes:
      "The native message, RFQ correlation, evidence, and missing fields were reviewed.",
    checklist,
  });
  assert.equal(parsed.decision, "qualified");
  assert.equal(parsed.checklist.noInventedFields, true);

  assert.throws(
    () =>
      parseSupplierQuoteReviewInput({
        decision: "qualified",
        reviewNotes:
          "The source was reviewed but one mandatory attestation remains incomplete.",
        checklist: { ...checklist, correlationReviewed: false },
      }),
    (error: unknown) =>
      error instanceof SupplierQuoteIntakePolicyError &&
      error.code === "SUPPLIER_QUOTE_REVIEW_CHECKLIST_INCOMPLETE",
  );
});

test("inbound hooks suppress generic WhatsApp auto-replies and retain native provenance", () => {
  const whatsappRoute = readFileSync(
    path.join(process.cwd(), "server/routes/twilio-webhooks.ts"),
    "utf8",
  );
  const mailIndexer = readFileSync(
    path.join(process.cwd(), "server/lib/mail/indexer.ts"),
    "utf8",
  );
  const migration = readFileSync(
    path.join(
      process.cwd(),
      "db/migrations/20270507_exportunity_supplier_quote_intake.sql",
    ),
    "utf8",
  );
  const dispatchService = readFileSync(
    path.join(
      process.cwd(),
      "server/lib/exportunity/supplierRfqDispatch.ts",
    ),
    "utf8",
  );
  const quoteService = readFileSync(
    path.join(
      process.cwd(),
      "server/lib/exportunity/supplierQuoteIntake.ts",
    ),
    "utf8",
  );

  assert.match(whatsappRoute, /OriginalRepliedMessageSid/);
  assert.match(whatsappRoute, /!suppressSupplierQuoteAutoReply/);
  assert.match(mailIndexer, /captureSupplierQuoteFromEmail/);
  assert.match(migration, /source_email_message_id/);
  assert.match(migration, /source_communications_message_id/);
  assert.match(migration, /missing_fields/);
  assert.match(migration, /ambiguous_fields/);
  assert.match(migration, /noInventedFields/);
  assert.match(migration, /industrial_supplier_contact_suppressions/);
  assert.match(dispatchService, /SUPPLIER_RFQ_CONTACT_GLOBALLY_SUPPRESSED/);
  assert.match(
    dispatchService,
    /SUPPLIER_RFQ_DISPATCH_RECIPIENT_SUPPRESSED_BEFORE_SEND/,
  );
  assert.match(quoteService, /SUPPLIER_QUOTE_REVIEW_ALREADY_DECIDED/);
  assert.match(
    quoteService,
    /eq\(industrialSupplierQuoteIntakes\.reviewStatus, "needs_review"\)/,
  );
});
