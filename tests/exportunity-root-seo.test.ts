import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ||= "postgres://unit-test:unit-test@127.0.0.1:5432/unit-test";

async function canonicalize(pathname: string, host: string) {
  const { canonicalizePath } = await import("../server/lib/seo/runtimeSeo");
  return canonicalizePath(pathname, { host });
}

async function resolveRootHead(host: string) {
  const { resolveSeoHead } = await import("../server/lib/seo/runtimeSeo");
  return resolveSeoHead({
    tenant: { id: 0, key: "exportunity", name: "Exportunity" },
    env: "test",
    host,
    pathname: "/",
    search: "",
  });
}

test("exportunity.net keeps the global company homepage canonical", async () => {
  assert.equal(await canonicalize("/", "exportunity.net"), "/");
  assert.equal(await canonicalize("/", "www.exportunity.net"), "/");

  const head = await resolveRootHead("exportunity.net");
  assert.equal(head.title, "Exportunity");
  assert.equal(head.canonicalUrl, "https://exportunity.net/");
  assert.equal(head.robots, "index, follow");
  assert.doesNotMatch(head.title, /zone/i);
});

test("legacy tenant roots continue to resolve to Zone without changing its explicit route", async () => {
  assert.equal(await canonicalize("/", "example.test"), "/zone");
  assert.equal(await canonicalize("/zone", "exportunity.net"), "/zone");
});
