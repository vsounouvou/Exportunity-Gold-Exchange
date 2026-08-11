import assert from "node:assert/strict";
import test from "node:test";

import {
  applyTenantResponsePolicy,
  resolveTenantAiPolicy,
} from "../server/lib/tenant-ai-policy";

test("tenant AI policy is explicit and never defaults unknown callers to BDO", () => {
  assert.equal(resolveTenantAiPolicy({ tenantKey: "exportunity" }), "exportunity");
  assert.equal(resolveTenantAiPolicy({ tenantKey: "bdo" }), "bdo");
  assert.equal(resolveTenantAiPolicy({}), "none");
  assert.equal(resolveTenantAiPolicy({ companyName: "Bourse de l'Or" }), "bdo");
  assert.equal(resolveTenantAiPolicy({ companyName: "Exportunity" }), "exportunity");
});

test("normal Exportunity marketplace language is not rewritten as a gold brokerage", () => {
  const response = "Exportunity is an industrial marketplace for factories and verified suppliers.";

  assert.equal(applyTenantResponsePolicy(response, { tenantKey: "exportunity" }).text, response);
  assert.equal(applyTenantResponsePolicy(response, {}).text, response);
  assert.match(
    applyTenantResponsePolicy(response, { tenantKey: "bdo" }).text,
    /certified physical gold brokerage platform/i,
  );
});
