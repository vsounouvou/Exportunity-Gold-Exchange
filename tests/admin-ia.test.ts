import assert from "node:assert/strict";
import test from "node:test";

import { getTenantStandardAdminIa, resolveTenantAdminAliasDestination } from "../client/src/lib/adminIa";
import { isTenantRouteAllowed } from "../client/src/lib/tenantPolicy";

test("admin IA exposes canonical order and tenant-specific destinations", () => {
  const vsItems = getTenantStandardAdminIa("vs");
  assert.equal(vsItems[0]?.key, "dashboard");
  assert.equal(vsItems[0]?.canonicalPath, "/admin/dashboard");
  assert.equal(resolveTenantAdminAliasDestination("vs", "dashboard"), "/admin/vs");
  assert.equal(resolveTenantAdminAliasDestination("hoz", "dashboard"), "/admin/hoz");
  assert.equal(resolveTenantAdminAliasDestination("met", "orders"), "/admin/met/orders");
});

test("admin IA module gating hides wallet for vs and keeps wallet for bdo", () => {
  const vsItems = getTenantStandardAdminIa("vs").map((item) => item.key);
  const bdoItems = getTenantStandardAdminIa("bdo").map((item) => item.key);
  assert.equal(vsItems.includes("wallets"), false);
  assert.equal(bdoItems.includes("wallets"), true);
});

test("canonical admin alias routes are tenant-allowed and module-gated", () => {
  assert.equal(isTenantRouteAllowed("/admin/dashboard", "vs"), true);
  assert.equal(isTenantRouteAllowed("/admin/dashboard", "mindbase"), true);
  assert.equal(isTenantRouteAllowed("/admin/orders", "mindbase"), false);
  assert.equal(isTenantRouteAllowed("/admin/orders", "met"), true);
});

