import assert from "node:assert/strict";
import test from "node:test";

import {
  assessIndustrialContactReadiness,
  storeIndustrialContactPlan,
  type IndustrialContactReadinessInput,
} from "../server/lib/industrial/factoryLeadOutreach";

function completePlan(
  overrides: Partial<IndustrialContactReadinessInput> = {},
): IndustrialContactReadinessInput {
  return {
    contactName: "Awa Mensah",
    contactRole: "Maintenance Director",
    channel: "email",
    contactPoint: "awa.mensah@example-industrie.bj",
    contactSourceUrl: "https://example-industrie.bj/contact",
    businessReason:
      "The factory operates conveyor equipment with a relevant recurring bearing and transmission-parts requirement.",
    complianceBasis: "public_b2b_relevance",
    senderIdentity: "Exportunity Machinery",
    senderVerified: true,
    approvalOwner: "Exportunity tenant administrator",
    language: "fr",
    draftMessage:
      "Bonjour Madame Mensah, Exportunity Machinery souhaite echanger sur vos besoins recurrents en pieces de maintenance industrielle.",
    suppressionChecked: true,
    quietHoursChecked: true,
    whatsappOptInEvidence: null,
    ...overrides,
  };
}

test("complete work-email dossier is ready for human approval", () => {
  const assessment = assessIndustrialContactReadiness(completePlan());

  assert.equal(assessment.readyForHumanApproval, true);
  assert.deepEqual(assessment.missing, []);
});

test("WhatsApp is blocked without explicit opt-in and evidence", () => {
  const assessment = assessIndustrialContactReadiness(
    completePlan({
      channel: "whatsapp",
      contactPoint: "+22997000000",
      complianceBasis: "public_b2b_relevance",
      whatsappOptInEvidence: null,
    }),
  );

  assert.equal(assessment.readyForHumanApproval, false);
  assert.ok(assessment.missing.includes("explicit WhatsApp opt-in basis"));
  assert.ok(assessment.missing.includes("WhatsApp opt-in evidence"));
});

test("WhatsApp dossier can enter approval only with recorded opt-in", () => {
  const assessment = assessIndustrialContactReadiness(
    completePlan({
      channel: "whatsapp",
      contactPoint: "+22997000000",
      complianceBasis: "explicit_opt_in",
      whatsappOptInEvidence:
        "Recipient opted in on the signed supplier-intake form dated 2026-08-05.",
    }),
  );

  assert.equal(assessment.readyForHumanApproval, true);
});

test("warm introduction requires a documented relationship basis", () => {
  const assessment = assessIndustrialContactReadiness(
    completePlan({
      channel: "warm_introduction",
      contactPoint: "Introduction through GDIZ",
      complianceBasis: "public_b2b_relevance",
    }),
  );

  assert.equal(assessment.readyForHumanApproval, false);
  assert.ok(assessment.missing.includes("introduction relationship basis"));
});

test("stored contact plan never authorizes outbound execution", () => {
  const stored = storeIndustrialContactPlan({
    plan: completePlan(),
    actorUserId: 42,
    savedAt: new Date("2026-08-06T12:00:00.000Z"),
  });

  assert.equal(stored.readinessStatus, "ready_for_human_approval");
  assert.equal(stored.approvalStatus, "pending");
  assert.equal(stored.outboundExecutionAllowed, false);
  assert.equal(stored.savedByUserId, 42);
});
