import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  assertIndustrialAttachmentReviewTransition,
  evaluateIndustrialAttachmentApproval,
  inferIndustrialAttachmentReviewKind,
  normalizeIndustrialAttachmentProposal,
  proposalApplicationValues,
} from "../server/lib/industrial/attachmentIntelligencePolicy";

const read = (path: string) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

const reviewedProposal = normalizeIndustrialAttachmentProposal({
  objectIdentified: true,
  likelyProduct: "SKF 6205 bearing",
  productCategory: "spare_part",
  brand: "SKF",
  model: "6205",
  specificationSummary:
    "Visible marking SKF 6205; dimensions, clearance class, and authenticity remain unverified.",
  visibleText: ["SKF", "6205", "SKF"],
  observableCharacteristics: ["sealed bearing"],
  proposedSpecifications: [
    {
      field: "marking",
      value: "6205",
      evidence: "Visible on the bearing face",
      confidence: 1.4,
    },
  ],
  clarificationQuestions: ["What shaft and housing dimensions are required?"],
  limitations: ["No scale reference is visible."],
  internalSearchTerms: ["SKF 6205 bearing"],
  overallConfidence: 0.72,
});

test("attachment review state machine prevents analysis-to-apply shortcuts", () => {
  assert.doesNotThrow(() =>
    assertIndustrialAttachmentReviewTransition(
      "pending_analysis",
      "analysis_ready",
    ),
  );
  assert.doesNotThrow(() =>
    assertIndustrialAttachmentReviewTransition("analysis_ready", "under_review"),
  );
  assert.doesNotThrow(() =>
    assertIndustrialAttachmentReviewTransition("under_review", "approved"),
  );
  assert.doesNotThrow(() =>
    assertIndustrialAttachmentReviewTransition("approved", "applied"),
  );
  assert.throws(
    () => assertIndustrialAttachmentReviewTransition("analysis_ready", "applied"),
    /not allowed/i,
  );
  assert.throws(
    () => assertIndustrialAttachmentReviewTransition("applied", "under_review"),
    /not allowed/i,
  );
});

test("proposal normalization deduplicates evidence and clamps confidence", () => {
  assert.deepEqual(reviewedProposal.visibleText, ["SKF", "6205"]);
  assert.equal(reviewedProposal.proposedSpecifications[0].confidence, 1);
  assert.equal(reviewedProposal.overallConfidence, 0.72);
  assert.equal(reviewedProposal.likelyProduct, "SKF 6205 bearing");
});

test("human confirmation and evidence notes gate approval", () => {
  const unconfirmed = evaluateIndustrialAttachmentApproval({
    proposal: reviewedProposal,
    reviewNotes: "Checked the original image.",
    humanConfirmed: false,
  });
  assert.equal(unconfirmed.eligible, false);
  assert.match(unconfirmed.reasons.join(" "), /accountable human/i);

  const ready = evaluateIndustrialAttachmentApproval({
    proposal: reviewedProposal,
    reviewNotes: "Checked visible markings against the original uploaded image.",
    humanConfirmed: true,
  });
  assert.equal(ready.eligible, true);
});

test("only reviewed product name, category, and specification map to apply values", () => {
  assert.deepEqual(proposalApplicationValues(reviewedProposal), {
    productName: "SKF 6205 bearing",
    productCategory: "spare_part",
    specification:
      "Visible marking SKF 6205; dimensions, clearance class, and authenticity remain unverified.",
  });
});

test("image, scanned-document, and CAD evidence remain distinct review paths", () => {
  assert.equal(
    inferIndustrialAttachmentReviewKind({ mimeType: "image/png" }),
    "image_vision",
  );
  assert.equal(
    inferIndustrialAttachmentReviewKind({
      mimeType: "application/pdf",
      extractionStatus: "ocr_required",
    }),
    "scanned_document_ocr",
  );
  assert.equal(
    inferIndustrialAttachmentReviewKind({
      mimeType: "application/step",
      fileName: "pump-housing.step",
    }),
    "cad_technical",
  );
});

test("attachment intelligence is persisted, locked, explicit, and human applied", async () => {
  const [schema, migration, ensure, service, routes, interfaceSource] =
    await Promise.all([
      read("db/schema/industrial.ts"),
      read(
        "db/migrations/20270412_exportunity_industrial_attachment_reviews.sql",
      ),
      read("server/lib/industrial/ensureTables.ts"),
      read("server/lib/industrial/attachmentIntelligence.ts"),
      read("server/routes/industrial.ts"),
      read(
        "client/src/components/exportunity/IndustrialAttachmentIntelligenceReview.tsx",
      ),
    ]);

  for (const table of [
    "industrial_attachment_reviews",
    "industrial_attachment_review_events",
  ]) {
    assert.match(schema, new RegExp(`"${table}"`));
    assert.match(migration, new RegExp(table));
    assert.match(ensure, new RegExp(table));
  }
  assert.match(service, /pg_advisory_xact_lock/);
  assert.match(service, /FEATURE_EXPORTUNITY_ATTACHMENT_VISION/);
  assert.match(service, /confirmedExternalAi/);
  assert.match(service, /type: "input_image"/);
  assert.match(service, /type: "json_schema"/);
  assert.match(service, /review\.status !== "approved"/);
  assert.match(service, /INDUSTRIAL_ATTACHMENT_APPLY_FIELDS/);
  assert.match(service, /industrial_product_requirement\.attachment_review_applied/);
  assert.match(routes, /attachments\/:attachmentId\/analyze/);
  assert.match(routes, /attachments\/:attachmentId\/review/);
  assert.match(routes, /attachments\/:attachmentId\/decision/);
  assert.match(routes, /attachments\/:attachmentId\/apply/);
  assert.match(interfaceSource, /Analyze image for review/);
  assert.match(interfaceSource, /Approve reviewed proposal/);
  assert.match(interfaceSource, /Apply selected fields/);
  assert.match(interfaceSource, /automatic analysis is off/i);
});
