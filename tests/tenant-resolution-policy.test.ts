import test from "node:test";
import assert from "node:assert/strict";

import { resolveTenantKey, shouldBlockTenantRendering } from "../client/src/lib/tenantResolution";
import { getAllowedTenantsForPath, isTenantRouteAllowed } from "../client/src/lib/tenantPolicy";

test("tenant resolution: host wins over session + api", () => {
  const resolved = resolveTenantKey({
    host: "mindbase.cloud",
    sessionToken:
      "eyJhbGciOiJIUzI1NiJ9.eyJ0ZW5hbnRLZXkiOiJleHBvcnR1bml0eSJ9.signature",
    apiTenantKey: "bdo",
  });
  assert.equal(resolved, "mindbase");
});

test("tenant resolution: session used when host unknown", () => {
  const resolved = resolveTenantKey({
    host: "localhost",
    sessionToken:
      "eyJhbGciOiJIUzI1NiJ9.eyJ0ZW5hbnRfa2V5Ijoiem9uZSJ9.signature",
    apiTenantKey: "bdo",
  });
  assert.equal(resolved, "zone");
});

test("tenant resolution: api fallback used when host + session absent", () => {
  const resolved = resolveTenantKey({
    host: "",
    sessionToken: null,
    apiTenantKey: "exportunity",
  });
  assert.equal(resolved, "exportunity");
});

test("tenant resolution: supports vss alias and maps to vs", () => {
  const resolved = resolveTenantKey({
    host: "vss.vitalsounouvou.com",
    sessionToken: null,
    apiTenantKey: "bdo",
  });
  assert.equal(resolved, "vs");
});

test("tenant resolution: zogueland hostname maps to zogueland tenant", () => {
  const resolved = resolveTenantKey({
    host: "zogueland.com",
    sessionToken: null,
    apiTenantKey: "bdo",
  });
  assert.equal(resolved, "zogueland");
});

test("tenant resolution: rayon alias and host map to rayon1km tenant", () => {
  assert.equal(
    resolveTenantKey({
      host: "rayon1km.com",
      sessionToken: null,
      apiTenantKey: "bdo",
    }),
    "rayon1km",
  );
});

test("tenant resolution: maison(s)enterre hosts resolve to met", () => {
  assert.equal(
    resolveTenantKey({
      host: "maisonsenterre.com",
      sessionToken: null,
      apiTenantKey: "bdo",
    }),
    "met",
  );
  assert.equal(
    resolveTenantKey({
      host: "www.maisonenterre.com",
      sessionToken: null,
      apiTenantKey: "bdo",
    }),
    "met",
  );
});

test("tenant bootstrap: known AGOOJIYE host renders while API resolution is pending", () => {
  assert.equal(
    shouldBlockTenantRendering({
      loading: true,
      tenantId: null,
      host: "agoojiye.com",
      sessionToken: null,
    }),
    false,
  );
});

test("tenant bootstrap: unknown host waits until a tenant source resolves", () => {
  assert.equal(
    shouldBlockTenantRendering({
      loading: true,
      tenantId: null,
      host: "unknown.example",
      sessionToken: null,
    }),
    true,
  );
  assert.equal(
    shouldBlockTenantRendering({
      loading: true,
      tenantId: 3162,
      host: "unknown.example",
      sessionToken: null,
    }),
    false,
  );
});

test("tenant policy: mindbase-only routes reject bdo", () => {
  const allowed = getAllowedTenantsForPath("/mindbase/workspaces");
  assert.deepEqual(allowed, ["mindbase"]);
});

test("tenant policy: shared backoffice routes exclude mindbase", () => {
  const allowed = getAllowedTenantsForPath("/admin/inbox");
  assert.equal(allowed.includes("mindbase"), false);
  assert.equal(allowed.includes("bdo"), true);
  assert.equal(allowed.includes("zogueland"), true);
});

test("tenant policy: marketplace admin route includes the BDO catalog", () => {
  const allowed = getAllowedTenantsForPath("/admin/marketplace/products");
  assert.deepEqual(allowed, ["exportunity", "zone", "rayon1km", "bdo"]);
});

test("tenant policy: met public routes are met-only", () => {
  assert.deepEqual(getAllowedTenantsForPath("/briques"), ["met"]);
  assert.deepEqual(getAllowedTenantsForPath("/devis"), ["met"]);
  assert.deepEqual(getAllowedTenantsForPath("/plans"), ["met"]);
});

test("tenant policy: met admin routes are met-only", () => {
  assert.deepEqual(getAllowedTenantsForPath("/admin/met/orders"), ["met"]);
  assert.deepEqual(getAllowedTenantsForPath("/admin/met/orders/123"), ["met"]);
});

test("tenant policy: module gate blocks checkout on mindbase", () => {
  assert.equal(isTenantRouteAllowed("/checkout", "mindbase"), false);
  assert.equal(isTenantRouteAllowed("/checkout", "exportunity"), true);
});
