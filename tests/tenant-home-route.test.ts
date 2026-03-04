import assert from "node:assert/strict";
import test from "node:test";

import { getTenantHomeRoute } from "../tenants/index";

test("tenant home route matrix matches platform-first decision", () => {
  assert.equal(getTenantHomeRoute("hoz"), "/store");
  assert.equal(getTenantHomeRoute("vs"), "/store");
  assert.equal(getTenantHomeRoute("met"), "/store");
  assert.equal(getTenantHomeRoute("mindbase"), "/store");
  assert.equal(getTenantHomeRoute("zogueland"), "/store");
  assert.equal(getTenantHomeRoute("bdo"), "/store");
  assert.equal(getTenantHomeRoute("exportunity"), "/zone");
  assert.equal(getTenantHomeRoute("rayon1km"), "/zone");
  assert.equal(getTenantHomeRoute("rayon"), "/zone");
});
