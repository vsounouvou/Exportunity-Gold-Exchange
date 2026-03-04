#!/usr/bin/env node

const args = process.argv.slice(2);

function arg(name) {
  const pref = `--${name}=`;
  const hit = args.find((value) => value.startsWith(pref));
  if (hit) return hit.slice(pref.length);
  const idx = args.indexOf(`--${name}`);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return "";
}

function normalizeHost(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "");
}

function fail(message) {
  console.error(`[deploy-domain-guard] ${message}`);
  process.exit(1);
}

const profile = String(arg("profile") || process.env.DEPLOY_PROFILE || "").trim().toLowerCase();
const domain = normalizeHost(arg("domain") || process.env.DEPLOY_DOMAIN || process.env.TARGET_DOMAIN || "");

if (!profile || !domain) {
  console.log("[deploy-domain-guard] skipped (set --profile and --domain to enforce)");
  process.exit(0);
}

const corporateAllowed = new Set(["com.exportunity.net", "exportunity.com", "www.exportunity.com"]);
const platformExactAllowed = new Set(["exportunity.net", "www.exportunity.net"]);

if (profile === "corporate") {
  if (!corporateAllowed.has(domain)) {
    fail(`blocked: corporate profile cannot deploy to "${domain}"`);
  }
  console.log(`[deploy-domain-guard] ok: corporate -> ${domain}`);
  process.exit(0);
}

if (profile === "platform") {
  const allowed =
    platformExactAllowed.has(domain) || (domain.endsWith(".exportunity.net") && domain !== "com.exportunity.net");
  if (!allowed) {
    fail(`blocked: platform profile cannot deploy to "${domain}"`);
  }
  console.log(`[deploy-domain-guard] ok: platform -> ${domain}`);
  process.exit(0);
}

fail(`unknown profile "${profile}" (expected "corporate" or "platform")`);
