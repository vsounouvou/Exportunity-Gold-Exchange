import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalizeEvidenceReferences,
  requestsActionReceipt,
  selectEvidenceCitationsForResponse,
} from "../server/lib/agent-response-evidence";

const hash = "963779faf796acef96629498da1c8408807ae4da8c74f6a04e73eba8b1847d4a";
const attachment = {
  id: "business-plan",
  evidenceId: `sha256:${hash}`,
  sha256: hash,
  name: "Exportunity business plan.docx",
  url: "/assets/business-plan.docx",
  extractionStatus: "extracted",
};

test("links the latest attachment when the user refers to previously attached evidence", () => {
  const citations = selectEvidenceCitationsForResponse({
    userText: "Relis la piece jointe et resume le document.",
    recentMessages: [{ metadata: {} }, { metadata: { attachments: [attachment] } }],
  });

  assert.equal(citations.length, 1);
  assert.equal(citations[0]?.evidenceId, `sha256:${hash}`);
});

test("does not claim unrelated historical attachments as evidence", () => {
  const citations = selectEvidenceCitationsForResponse({
    userText: "Bonjour Fenou, quel est ton role ?",
    recentMessages: [{ metadata: { attachments: [attachment] } }],
  });
  assert.deepEqual(citations, []);
});

test("repairs a uniquely truncated SHA-256 citation", () => {
  const text = canonicalizeEvidenceReferences(
    "Preuve: sha256:963779faf796acef96629498da1c",
    [attachment],
  );
  assert.equal(text, `Preuve: sha256:${hash}`);
});

test("detects requests for an explicit no-action receipt", () => {
  assert.equal(
    requestsActionReceipt("Confirme que tu n'as cree aucune tache, decision, action ni contact."),
    true,
  );
  assert.equal(requestsActionReceipt("Resume ce document en trois points."), false);
});
