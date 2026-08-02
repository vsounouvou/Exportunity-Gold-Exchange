import assert from "node:assert/strict";
import test from "node:test";

import { getTenantAdminHomeRoute, getTenantHomeRoute } from "../tenants/index";

test("tenant home route matrix matches platform-first decision", () => {
  assert.equal(getTenantHomeRoute("hoz"), "/store");
  assert.equal(getTenantHomeRoute("vs"), "/store");
  assert.equal(getTenantHomeRoute("met"), "/store");
  assert.equal(getTenantHomeRoute("mindbase"), "/store");
  assert.equal(getTenantHomeRoute("zogueland"), "/store");
  assert.equal(getTenantHomeRoute("bdo"), "/store");
  assert.equal(getTenantHomeRoute("exportunity"), "/industrial");
  assert.equal(getTenantHomeRoute("rayon1km"), "/zone");
  assert.equal(getTenantHomeRoute("rayon"), "/zone");
});

test("Exportunity separates the public industrial home from the admin workspace", () => {
  assert.equal(getTenantHomeRoute("exportunity"), "/industrial");
  assert.equal(getTenantAdminHomeRoute("exportunity"), "/ai-team");
  assert.equal(getTenantAdminHomeRoute("mindbase"), "/admin/mindbase");
});
