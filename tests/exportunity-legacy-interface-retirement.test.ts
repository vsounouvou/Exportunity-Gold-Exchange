import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  getExportunityLegacyCommerceDestination,
  isExportunityPlatformHostname,
  isExportunityPublicHostname,
} from "../client/src/lib/exportunityPublicRoutePolicy";

test("Exportunity public domains use the current public platform surface", () => {
  for (const host of [
    "exportunity.com",
    "www.exportunity.com",
    "exportunity.net",
    "www.exportunity.net",
    "com.exportunity.net",
    "www.com.exportunity.net",
  ]) {
    assert.equal(isExportunityPublicHostname(host), true, host);
  }

  assert.equal(isExportunityPublicHostname("boursedelor.com"), false);
  assert.equal(isExportunityPublicHostname("zone.example.test"), false);

  for (const host of [
    "exportunity.com",
    "www.exportunity.com",
    "exportunity.net",
    "www.exportunity.net",
    "com.exportunity.net",
    "www.com.exportunity.net",
  ]) {
    assert.equal(isExportunityPlatformHostname(host), true, host);
  }
});

test("retired commerce paths route only to current operating surfaces", () => {
  for (const path of [
    "/zone",
    "/zone/nearby",
    "/store",
    "/collections/coffee",
    "/product/coffee",
    "/cart",
    "/checkout",
    "/marketplace-old",
    "/retail/nearby",
    "/shop",
    "/wholesale",
  ]) {
    assert.equal(getExportunityLegacyCommerceDestination(path), "/marketplace", path);
  }

  assert.equal(getExportunityLegacyCommerceDestination("/map"), "/marketplace");
  assert.equal(getExportunityLegacyCommerceDestination("/marketplace"), null);
  assert.equal(getExportunityLegacyCommerceDestination("/marketplace/map"), null);
  assert.equal(getExportunityLegacyCommerceDestination("/marketplace/map/abidjan"), null);

  assert.equal(getExportunityLegacyCommerceDestination("/pme-exchange"), "/factories");
  assert.equal(getExportunityLegacyCommerceDestination("/ready-for-export"), "/export-products");

  for (const path of ["/or", "/or/bars", "/achat-or", "/stamped-gold", "/pieces"]) {
    assert.equal(getExportunityLegacyCommerceDestination(path), "/producer-exchange", path);
  }
});

test("retired corporate paths are redirected before a legacy SPA can render", () => {
  for (const path of [
    "/about",
    "/company",
    "/what-we-do",
    "/platforms",
    "/archive",
    "/operating-stack",
    "/work-with-us",
    "/journey",
    "/copy-of-home",
    "/contact-8",
    "/gateway",
  ]) {
    assert.equal(getExportunityLegacyCommerceDestination(path), "/", path);
  }

  for (const path of [
    "/press",
    "/blog",
    "/blog/trade-corridors",
    "/media",
    "/media/videos",
    "/library",
    "/post/legacy-story",
  ]) {
    assert.equal(getExportunityLegacyCommerceDestination(path), "/trade", path);
  }

  assert.equal(getExportunityLegacyCommerceDestination("/gold-mining"), "/producer-exchange");
  assert.equal(getExportunityLegacyCommerceDestination("/government-institutions"), "/industrial");
  assert.equal(getExportunityLegacyCommerceDestination("/platform"), "/ai-team");
  assert.equal(getExportunityLegacyCommerceDestination("/platform/modules/trade"), "/ai-team");
  assert.equal(
    getExportunityLegacyCommerceDestination("/platform/wallet"),
    "/auth?next=/app/wallet",
  );
  assert.equal(
    getExportunityLegacyCommerceDestination("/platform/compliance"),
    "/auth?next=/app/governance/logs",
  );
});

test("separate MindBase product routes cannot render on Exportunity", () => {
  for (const path of [
    "/mindbase",
    "/mindbase/discover",
    "/mindbase/build/chat",
    "/discover",
    "/explore",
    "/build/chat",
    "/studio",
    "/workspaces",
    "/docs/api",
    "/i/example",
    "/c/example",
  ]) {
    assert.equal(getExportunityLegacyCommerceDestination(path), "/", path);
  }
});

test("Exportunity public hosts cannot render a retired homepage, map, store, or marketplace interface", () => {
  for (const path of [
    "/app",
    "/admin",
    "/orders",
    "/delivery",
    "/marketplace",
    "/marketplace/map",
    "/marketplace/sellers",
    "/trade",
    "/industrial",
    "/producer-exchange",
    "/profile",
  ]) {
    assert.equal(getExportunityLegacyCommerceDestination(path), null, path);
  }

  const appSource = readFileSync(new URL("../client/src/App.tsx", import.meta.url), "utf8");
  const serverSource = readFileSync(new URL("../server/index.ts", import.meta.url), "utf8");
  const hostModeSource = readFileSync(new URL("../client/src/lib/hostMode.ts", import.meta.url), "utf8");
  const marketplaceSchema = readFileSync(new URL("../db/schema/marketplace.ts", import.meta.url), "utf8");

  assert.match(appSource, /tenant\.key === "exportunity"\) return <ExportunityMarketplacePage \/>/);
  assert.doesNotMatch(
    appSource,
    /ExportunityMarketing[A-Za-z]+Page|MarketingHomePage|MarketingRedirect|MarketingOrAuthRedirect|isExportunityMarketingHost/,
  );
  assert.match(
    appSource,
    /path="\/zone" component=\{\(\) => <ExportunityIndustrialAliasRoute to="\/marketplace" \/>\}/,
  );
  assert.match(appSource, /path="\/map" component=\{ExportunityMarketplaceMapRoute\}/);
  assert.match(appSource, /path="\/marketplace" component=\{ExportunityMarketplaceRoute\}/);
  assert.match(appSource, /import\("@\/pages\/exportunity\/MarketplacePage"\)/);
  assert.match(
    appSource,
    /path="\/marketplace-old" component=\{\(\) => <ExportunityIndustrialAliasRoute to="\/marketplace" \/>\}/,
  );
  assert.doesNotMatch(appSource, /ExportunityLegacyMarketplaceRoute|@\/pages\/MarketplacePage/);
  assert.match(appSource, /path="\/marketplace\/sellers"/);
  assert.doesNotMatch(appSource, /import .*ExportunityNeighbourhoodCommerce/);
  assert.doesNotMatch(appSource, /import .*ExportunityConversationalCommerce/);
  assert.match(serverSource, /getExportunityLegacyCommerceDestination\(req\.path\)/);
  assert.match(serverSource, /isExportunityPublicHostname\(resolveRequestHost\(req\)\)/);
  assert.doesNotMatch(serverSource, /isExportunityMarketingHostname/);
  assert.match(serverSource, /res\.redirect\(308, destination\)/);
  assert.doesNotMatch(hostModeSource, /isExportunityMarketingHost|isExportunityMarketingHostname|isExportunityPublicHostname/);
  assert.doesNotMatch(hostModeSource, /URLSearchParams|marketing=1/);
  for (const retiredPath of [
    "/company",
    "/what-we-do",
    "/platforms",
    "/archive",
    "/operating-stack",
    "/work-with-us",
    "/copy-of-home",
  ]) {
    assert.match(
      appSource,
      new RegExp(`path="${retiredPath.replaceAll("/", "\\/")}" component=\\{\\(\\) => <RetiredPublicSurfaceRedirect`),
      retiredPath,
    );
  }
  assert.equal((appSource.match(/path="\/trade"/g) || []).length, 1, "the current trade route must be unique");
  assert.ok(marketplaceSchema.length > 0);
});
