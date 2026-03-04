import assert from "node:assert/strict";
import test from "node:test";

import { getTenantConfigByKey, hasTenantModule, matchTenantConfig, resolveTenantConfig } from "../tenants/index";

test("tenant registry resolves zogueland and vs alias", () => {
  assert.equal(resolveTenantConfig("zogueland.com").slug, "zogueland");
  assert.equal(resolveTenantConfig("vss.vitalsounouvou.com").slug, "vs");
  assert.equal(getTenantConfigByKey("vss")?.slug, "vs");
  assert.equal(resolveTenantConfig("rayon1km.com").slug, "rayon1km");
  assert.equal(getTenantConfigByKey("rayon")?.slug, "rayon1km");
});

test("tenant module flags expose expected capabilities", () => {
  assert.equal(hasTenantModule("zogueland", "stories"), true);
  assert.equal(hasTenantModule("mindbase", "checkout"), false);
  assert.equal(hasTenantModule("met", "bulk_quotes"), true);
});

test("matchTenantConfig returns null for unknown host", () => {
  assert.equal(matchTenantConfig("unknown.example.test"), null);
});
