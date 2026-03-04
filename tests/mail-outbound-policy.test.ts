import test from "node:test";
import assert from "node:assert/strict";
import {
  buildProfessionalEmailContent,
  describeDeliveryFailure,
  evaluateSmtpDelivery,
  normalizeAndValidateRecipients,
} from "../server/lib/mail/outboundPolicy";

test("normalizeAndValidateRecipients filters invalid and deduplicates", () => {
  const result = normalizeAndValidateRecipients([
    "Alice@example.com",
    "alice@example.com",
    "bad-email",
    "1770565053128.10d6b118798d72e5ca542475@boursedelor.com",
    "bob@example.org",
    "",
  ]);

  assert.deepEqual(result.recipients, ["alice@example.com", "bob@example.org"]);
  assert.deepEqual(result.invalid, ["bad-email", "1770565053128.10d6b118798d72e5ca542475@boursedelor.com"]);
});

test("buildProfessionalEmailContent enforces greeting and signature", () => {
  const content = buildProfessionalEmailContent({
    to: ["mariam.konate@example.org"],
    subject: "Following Up on Our Discussion",
    textBody: "Thank you for your time.\n\nWe are ready to proceed.",
    htmlBody: null,
    signature: {
      displayName: "Amara Diallo",
      role: "Platform Lead",
      companyName: "Bourse de l'Or",
      emailAddress: "amara.diallo@boursedelor.com",
      website: "https://boursedelor.com",
    },
  });

  assert.ok(content.textBody.startsWith("Dear Mariam Konate,"));
  assert.ok(content.textBody.includes("Amara Diallo"));
  assert.ok(content.textBody.includes("Platform Lead"));
  assert.ok(content.textBody.includes("Email: amara.diallo@boursedelor.com"));
  assert.ok(content.htmlBody.includes("data-agent-signature"));
});

test("evaluateSmtpDelivery fails on partial acceptance", () => {
  const outcome = evaluateSmtpDelivery(
    ["a@example.com", "b@example.com"],
    {
      accepted: ["a@example.com"],
      rejected: ["b@example.com"],
      response: "250 queued as ABC123",
    },
  );

  assert.equal(outcome.ok, false);
  assert.deepEqual(outcome.accepted, ["a@example.com"]);
  assert.deepEqual(outcome.rejected, ["b@example.com"]);
  assert.deepEqual(outcome.missing, ["b@example.com"]);
  assert.match(describeDeliveryFailure(outcome), /rejected=/);
});
