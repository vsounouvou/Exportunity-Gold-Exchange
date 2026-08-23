import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTradeSourceDocumentKey,
  buildTradeSourceSnapshotHash,
  compareTradeSourceSnapshots,
  matchTradeRequirementImpact,
  normalizeTradeSnapshotList,
} from "../server/lib/trade-intelligence/sourceMonitoring";

test("source snapshot hashes are stable and keep published/effective dates distinct", () => {
  const base = {
    sourceUrl: "https://customs.example/regulations/conformity-x",
    documentTitle: "Conformity requirement X",
    contentText: "Published on 1 June. Effective on 1 September.",
    structuredData: { rate: 5, status: "active" },
    publishedAt: "2026-06-01T00:00:00.000Z",
    effectiveAt: "2026-09-01T00:00:00.000Z",
    affectedCountryCodes: ["gh", "Ghana"],
  };
  assert.equal(
    buildTradeSourceSnapshotHash(base),
    buildTradeSourceSnapshotHash({
      ...base,
      affectedCountryCodes: ["GH"],
    }),
  );
  assert.notEqual(
    buildTradeSourceSnapshotHash(base),
    buildTradeSourceSnapshotHash({
      ...base,
      effectiveAt: "2026-10-01T00:00:00.000Z",
    }),
  );
  assert.deepEqual(
    normalizeTradeSnapshotList(["gh", "Ghana", "GH"], {
      countryCodes: true,
    }),
    ["GH"],
  );
});

test("document keys group versions of the same registered URL", () => {
  assert.equal(
    buildTradeSourceDocumentKey({
      sourceUrl: "https://authority.example/regulations/conformity-X?version=2",
      documentTitle: "Conformity X second edition",
    }),
    "authority-example-regulations-conformity-x",
  );
});

test("deterministic comparison identifies substantive regulatory differences", () => {
  const previous = {
    contentHash: "previous",
    contentText:
      "Importers must submit a conformity certificate. The rate is five percent.",
    structuredData: {
      conformity: { certificateRequired: true, tariffRate: 5 },
    },
    effectiveAt: "2026-09-01T00:00:00.000Z",
    affectedProducts: ["refined palm oil"],
    affectedCountryCodes: ["GH"],
  };
  const current = {
    contentHash: "current",
    contentText:
      "Importers must submit a conformity certificate before loading. The rate is eight percent.",
    structuredData: {
      conformity: { certificateRequired: true, tariffRate: 8 },
    },
    effectiveAt: "2026-10-01T00:00:00.000Z",
    affectedProducts: ["refined palm oil", "palm olein"],
    affectedCountryCodes: ["GH"],
  };
  const comparison = compareTradeSourceSnapshots(previous, current);

  assert.equal(comparison.hasAnyChange, true);
  assert.equal(comparison.isSubstantive, true);
  assert.ok(comparison.materialityScore >= 30);
  assert.ok(
    comparison.changedFields.includes(
      "structuredData.conformity.tariffRate",
    ),
  );
  assert.ok(comparison.changedFields.includes("effectiveAt"));
  assert.deepEqual(comparison.affectedScopeChanges.products.added, [
    "palm olein",
  ]);
  assert.match(comparison.deterministicSummary, /accountable review/i);
});

test("unchanged normalized source content does not create a substantive change", () => {
  const comparison = compareTradeSourceSnapshots(
    {
      contentText: "A conformity certificate is required.",
      structuredData: { required: true },
      affectedCountryCodes: ["CI"],
    },
    {
      contentText: "  A conformity certificate is required.  ",
      structuredData: { required: true },
      affectedCountryCodes: ["CI"],
    },
  );
  assert.equal(comparison.hasAnyChange, false);
  assert.equal(comparison.isSubstantive, false);
  assert.equal(comparison.materialityScore, 0);
});

test("impact matching finds a Ghana-origin palm-oil requirement but excludes unrelated markets", () => {
  const scope = {
    affectedProducts: ["refined palm oil"],
    affectedIndustries: ["agricultural commodities"],
    affectedHsCodes: [],
    affectedCountryCodes: ["GH"],
    affectedRoutes: ["Tema to Abidjan"],
  };
  const matching = matchTradeRequirementImpact(scope, {
    id: "matching",
    requirementType: "raw_material",
    categoryCode: "agricultural_raw_materials",
    title: "100 tonnes refined palm oil",
    details: "Ship from Tema to Abidjan",
    productName: "refined palm oil",
    origin: "Ghana",
    destination: "Abidjan",
    deliveryCountryCode: "CI",
  });
  const unrelated = matchTradeRequirementImpact(scope, {
    id: "unrelated",
    requirementType: "machinery",
    title: "CNC milling machine",
    details: "Delivery to Dakar",
    destination: "Senegal",
    deliveryCountryCode: "SN",
  });

  assert.ok(matching);
  assert.ok((matching?.matchScore || 0) >= 70);
  assert.match(matching?.matchReasons.join(" ") || "", /palm oil/i);
  assert.equal(unrelated, null);
});
