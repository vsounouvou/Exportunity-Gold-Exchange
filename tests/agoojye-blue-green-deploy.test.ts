import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const compose = readFileSync(new URL("docker-compose.yml", root), "utf8");
const composeOverride = readFileSync(new URL("docker-compose.blue-green.yml", root), "utf8");
const deploy = readFileSync(new URL("scripts/ops/deploy-release.sh", root), "utf8");
const blueGreen = readFileSync(new URL("scripts/ops/blue-green-remote.sh", root), "utf8");
const rollback = readFileSync(new URL("scripts/ops/blue-green-rollback-remote.sh", root), "utf8");
const tenantConfig = JSON.parse(readFileSync(new URL("ops/tenants.config.json", root), "utf8"));

test("AGOOJIYE uses a distinct blue-green production strategy", () => {
  const config = tenantConfig.tenants.agoojye;
  assert.equal(config.deploymentStrategy, "blue-green");
  assert.notEqual(config.hostPort, config.blueGreenAlternatePort);
  assert.equal(config.blueGreenProxyContainer, "npm-npm-1");
  assert.match(config.blueGreenHostPattern, /agoojiye/);
});

test("candidate containers share persistent data and expose a Docker health check", () => {
  assert.match(compose, /healthcheck:/);
  assert.match(compose, /api\/health\/ready/);
  assert.match(compose, /ATTACHED_ASSETS_PATH/);
  assert.match(composeOverride, /external:\s*true/);
  assert.match(composeOverride, /SHARED_ASSET_VOLUME/);
  assert.match(composeOverride, /SHARED_UPLOAD_VOLUME/);
});

test("deployment verifies the candidate before switching the proxy", () => {
  assert.match(deploy, /DEPLOYMENT_STRATEGY/);
  assert.match(deploy, /blue-green-remote\.sh/);

  const candidateHealth = blueGreen.indexOf("candidate_ready=0");
  const dockerHealth = blueGreen.indexOf('"${candidate_health}" == "healthy"');
  const proxyReload = blueGreen.indexOf('nginx -s reload');
  const publicHealth = blueGreen.indexOf("public_ready=0");
  const activeMarker = blueGreen.indexOf('mv "${active_slot_path}.next"');

  assert.ok(candidateHealth > 0);
  assert.ok(dockerHealth > candidateHealth);
  assert.ok(proxyReload > candidateHealth);
  assert.ok(proxyReload > dockerHealth);
  assert.ok(publicHealth > proxyReload);
  assert.ok(activeMarker > publicHealth);
  assert.match(blueGreen, /restore_proxy/);
});

test("rollback starts and validates the previous slot before routing traffic", () => {
  const start = rollback.indexOf("docker start");
  const health = rollback.indexOf("target_health_url");
  const reload = rollback.indexOf("nginx -s reload");

  assert.ok(start > 0);
  assert.ok(health > start);
  assert.ok(reload > health);
  assert.match(rollback, /rollback_probe/);
});

test("readiness checks PostgreSQL and build parity", () => {
  const healthRoute = readFileSync(new URL("server/routes/health.ts", root), "utf8");
  assert.match(healthRoute, /router\.get\("\/ready"/);
  assert.match(healthRoute, /select 1 as ready/);
  assert.match(healthRoute, /buildMatches/);
  assert.match(healthRoute, /status\(503\)/);
});
