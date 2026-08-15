import assert from "node:assert/strict";
import test from "node:test";

import {
  isProtectedExportunityStagingHost,
  normalizeRequestHost,
  shouldNoIndexExportunityHost,
} from "../server/lib/seo/hostIndexingPolicy";

test("the live Exportunity domains remain indexable", () => {
  assert.equal(shouldNoIndexExportunityHost("exportunity.net"), false);
  assert.equal(shouldNoIndexExportunityHost("www.exportunity.net"), false);
  assert.equal(shouldNoIndexExportunityHost("EXPORTUNITY.NET:443"), false);
});

test("protected clone hosts remain noindex", () => {
  assert.equal(isProtectedExportunityStagingHost("clone.exportunity.net"), true);
  assert.equal(isProtectedExportunityStagingHost("www.clone.exportunity.net"), true);
  assert.equal(shouldNoIndexExportunityHost("clone.exportunity.net:443"), true);
  assert.equal(normalizeRequestHost("clone.exportunity.net:443, proxy.local"), "clone.exportunity.net");
});
