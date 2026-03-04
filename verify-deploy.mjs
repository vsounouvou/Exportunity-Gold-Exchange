import assert from "assert";

async function getJson(url) {
  const res = await fetch(url, { cache: "no-store", headers: { "Cache-Control": "no-cache", Pragma: "no-cache" } });
  assert(res.ok, `Failed ${url} status=${res.status}`);
  return res.json();
}

const base = process.env.BASE_URL || process.env.E2E_BASE_URL || "https://boursedelor.com";
const origin = base.replace(/\/+$/, "");

const version = await getJson(`${origin}/api/system/version?v=${Date.now()}`);
const build = await getJson(`${origin}/build.json?v=${Date.now()}`);

assert(version && version.ok, "Missing ok=true in /api/system/version");
assert(version.buildId, "Missing buildId in /api/system/version");
assert(version.gitSha, "Missing gitSha in /api/system/version");
assert(version.clientBuild, "Missing clientBuild in /api/system/version");
assert(version.clientBuild.buildId, "Missing clientBuild.buildId in /api/system/version");
assert(version.clientBuild.gitSha, "Missing clientBuild.gitSha in /api/system/version");
assert(build.buildId, "Missing buildId in /build.json");
assert(build.gitSha, "Missing gitSha in /build.json");

const mismatch =
  String(version.clientBuild.buildId) !== String(build.buildId) ||
  String(version.clientBuild.gitSha) !== String(build.gitSha) ||
  String(version.buildId) !== String(build.buildId) ||
  String(version.gitSha) !== String(build.gitSha);

if (mismatch) {
  console.error("[verify-deploy] BUILD MISMATCH:");
  console.error("server:", JSON.stringify({ buildId: version.buildId, gitSha: version.gitSha }, null, 2));
  console.error("server clientBuild:", JSON.stringify(version.clientBuild, null, 2));
  console.error("served build.json:", JSON.stringify({ buildId: build.buildId, gitSha: build.gitSha }, null, 2));
  process.exit(2);
}

console.log("[verify-deploy] OK. Build parity confirmed:", { buildId: build.buildId, gitSha: build.gitSha });

