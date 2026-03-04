import assert from "node:assert/strict";
import test from "node:test";

import { resolveSetupPasswordRedirect, resolveSetupPasswordTenantKey } from "../server/lib/setup-password-redirect";

test("setup-password redirect mapping: all tenant keys map to expected admin home", () => {
  const cases: Array<{ tenantKey: string; redirect: string }> = [
    { tenantKey: "bdo", redirect: "/dashboard" },
    { tenantKey: "exportunity", redirect: "/zone" },
    { tenantKey: "zone", redirect: "/zone" },
    { tenantKey: "mindbase", redirect: "/admin/mindbase" },
    { tenantKey: "met", redirect: "/admin/met" },
    { tenantKey: "vs", redirect: "/admin/vs" },
    { tenantKey: "hoz", redirect: "/admin/hoz" },
    { tenantKey: "zogueland", redirect: "/admin/zogueland" },
    { tenantKey: "rayon1km", redirect: "/admin/rayon1km" },
  ];

  for (const item of cases) {
    const resolved = resolveSetupPasswordRedirect({ tenantKey: item.tenantKey });
    assert.equal(resolved.tenantKey, item.tenantKey);
    assert.equal(resolved.redirect, item.redirect);
  }
});

test("setup-password redirect mapping: host fallback resolves tenant-specific redirect", () => {
  const resolvedHoz = resolveSetupPasswordRedirect({ host: "houseofzogue.com" });
  assert.equal(resolvedHoz.tenantKey, "hoz");
  assert.equal(resolvedHoz.redirect, "/admin/hoz");

  const resolvedVs = resolveSetupPasswordRedirect({ forwardedHost: "www.vitalsounouvou.com" });
  assert.equal(resolvedVs.tenantKey, "vs");
  assert.equal(resolvedVs.redirect, "/admin/vs");
});

test("setup-password redirect mapping: unknown host falls back to exportunity", () => {
  const tenantKey = resolveSetupPasswordTenantKey({ host: "unknown.example.test" });
  assert.equal(tenantKey, "exportunity");
});
