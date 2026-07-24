import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAgoojiyeResearchDraft,
  scoreAgoojiyeResearch,
  type AgoojiyePublicSourceRecord,
} from "../server/lib/agoojye/researchPolicy";
import {
  isBlockedAgoojiyeSourceAddress,
  validateAgoojiyeSourceUrl,
} from "../server/lib/agoojye/publicSourceResearch";

const source: AgoojiyePublicSourceRecord = {
  url: "https://energie.example/a-propos",
  finalUrl: "https://energie.example/a-propos",
  title: "Énergie solaire et recharge électrique",
  description: "Infrastructure de recharge, batteries et électricité renouvelable.",
  excerpt: "Solutions énergétiques pour la mobilité.",
  fetchedAt: "2026-07-18T00:00:00.000Z",
  status: "fetched",
  error: null,
};

test("AGOOJIYE public research rejects SSRF-prone source locations", () => {
  assert.equal(validateAgoojiyeSourceUrl("https://www.example.com/about").hostname, "www.example.com");
  assert.throws(() => validateAgoojiyeSourceUrl("http://example.com"), /HTTPS/);
  assert.throws(() => validateAgoojiyeSourceUrl("https://localhost/admin"), /privé/);
  assert.throws(() => validateAgoojiyeSourceUrl("https://127.0.0.1/admin"), /privée/);
  assert.throws(() => validateAgoojiyeSourceUrl("https://user:pass@example.com"), /identifiants/);
  assert.equal(isBlockedAgoojiyeSourceAddress("10.2.3.4"), true);
  assert.equal(isBlockedAgoojiyeSourceAddress("169.254.1.2"), true);
  assert.equal(isBlockedAgoojiyeSourceAddress("1.1.1.1"), false);
});

test("AGOOJIYE research score is transparent and category-driven", () => {
  const result = scoreAgoojiyeResearch({
    organizationName: "Énergie Bénin",
    industry: "Électricité",
    strategicRelevance: "Infrastructure de recharge au Bénin",
    sources: [source],
  });
  assert.equal(result.sponsorCategoryGuess, "Energy Partner");
  assert.ok(result.relevanceScore > 50);
  assert.ok(result.confidenceScore >= 40);
  assert.match(result.breakdown.formula, /sources/);
  assert.ok(result.matchedThemes.includes("énergie"));
});

test("AGOOJIYE draft never invents interest and marks missing template variables", () => {
  const draft = buildAgoojiyeResearchDraft({
    organizationName: "Industrie Exemple",
    category: "Industrial Partner",
    matchedThemes: ["industrie"],
    templateSubject: "Échange avec {{organization_name}}",
    templateBody: "Bonjour {{contact_first_name}}, dossier {{unknown_value}}",
  });
  assert.equal(draft.subject, "Échange avec Industrie Exemple");
  assert.match(draft.body, /\[A COMPLETER: contact_first_name\]/);
  assert.match(draft.body, /\[A COMPLETER: unknown_value\]/);

  const defaultDraft = buildAgoojiyeResearchDraft({
    organizationName: "Industrie Exemple",
    category: "Industrial Partner",
    matchedThemes: ["industrie"],
  });
  assert.match(defaultDraft.body, /sans présumer de votre intérêt/);
});
