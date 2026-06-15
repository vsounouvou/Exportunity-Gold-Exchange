#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const baseURL = (process.env.E2E_BASE_URL || "https://boursedelor.com").replace(/\/+$/, "");
const now = Date.now();
const outDir = path.resolve(process.cwd(), "artifacts", "bdo-batched-click-audit", String(now));
fs.mkdirSync(outDir, { recursive: true });

const defaultPublicRoutes = [
  "/",
  "/store",
  "/wholesale",
  "/wholesale/machinery",
  "/wholesale/investment-opportunities",
  "/wholesale/apply",
  "/wholesale/membership",
  "/wholesale/counterparties",
  "/pieces",
  "/collections",
  "/cart",
  "/checkout",
  "/marketplace",
  "/marketplace/map",
  "/shop",
  "/actualites",
  "/reglementation",
  "/industrie-miniere",
  "/certification",
  "/verifier",
  "/login",
  "/register",
  "/pro/login",
  "/pro",
  "/pro/map",
  "/pro/buyers",
  "/pro/counterparties",
  "/pro/bureaux-achat",
  "/pro/exportateurs-verifies",
  "/pro/membership",
  "/pro/intelligence",
  "/pro/mine",
  "/pro/money",
  "/pro/operations",
  "/pro/chats",
  "/pro/orders",
  "/pro/agents",
  "/pro/account",
  "/espace-pro",
  "/coffre",
  "/mes-objectifs",
  "/orders",
  "/account",
  "/delivery",
  "/stamped-gold",
  "/terms",
  "/privacy",
  "/cadre-conformite",
];

const defaultAdminRoutes = [
  "/admin/dashboard",
  "/admin/orders",
  "/admin/products",
  "/admin/collections",
  "/admin/agents",
  "/admin/wallets",
  "/admin/bdo/goals",
  "/admin/bdo/pro-memberships",
  "/admin/bdo/settings",
  "/admin/stamped-gold",
  "/admin/stamped-gold/skus",
  "/admin/stamped-gold/items",
  "/admin/stamped-gold/jewellers",
  "/admin/stamped-gold/minting-studio",
  "/admin/stamped-gold/scans",
  "/admin/stamped-gold/pickup",
  "/admin/marketplace/products",
  "/admin/marketplace/payments",
  "/admin/wallet",
  "/admin/wallet/accounts",
  "/admin/wallet/ledger",
  "/admin/wallet/config",
  "/admin/wallet/topups",
  "/admin/wallet/payouts",
  "/admin/wallet/vouchers",
  "/admin/wallet/sellers",
  "/admin/wallet/risk",
  "/admin/map-icons",
  "/admin/agents-os",
  "/admin/agents/governance",
  "/admin/inbox",
  "/admin/email",
  "/admin/communications/whatsapp",
  "/admin/communications/whatsapp/logs",
  "/admin/communications/twilio",
  "/admin/communications/twilio/logs",
  "/admin/pro-test-accounts",
  "/admin/system/update",
];

function parseCsv(name, fallback) {
  const raw = String(process.env[name] || "").trim();
  if (!raw) return fallback;
  return raw.split(",").map((item) => item.trim()).filter(Boolean);
}

function parseBool(name, fallback) {
  const raw = String(process.env[name] ?? "").trim();
  if (!raw) return fallback;
  return /^(1|true|yes)$/i.test(raw);
}

function chunk(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function parseSummary(stdout) {
  const text = String(stdout || "").trim();
  const starts = [];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "{") starts.push(index);
  }
  for (let index = starts.length - 1; index >= 0; index -= 1) {
    try {
      const parsed = JSON.parse(text.slice(starts[index]));
      if (parsed && typeof parsed.ok === "boolean" && typeof parsed.routeCount === "number") return parsed;
    } catch {
      // Keep scanning earlier opening braces; the last one may be nested JSON.
    }
  }
  return null;
}

function runBatch(batch) {
  const env = {
    ...process.env,
    E2E_BASE_URL: baseURL,
    BDO_CLICK_PUBLIC: batch.scope === "public" ? "1" : "0",
    BDO_CLICK_ADMIN: batch.scope === "admin" ? "1" : "0",
    BDO_CLICK_LANGUAGES: batch.language,
    BDO_CLICK_MAX_PER_ROUTE: String(maxPerRoute),
  };
  if (batch.scope === "public") env.BDO_CLICK_PUBLIC_ROUTES = batch.routes.join(",");
  if (batch.scope === "admin") env.BDO_CLICK_ADMIN_ROUTES = batch.routes.join(",");

  const startedAt = new Date().toISOString();
  const result = spawnSync(process.execPath, ["scripts/qa/bdo-click-audit.mjs"], {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
    timeout: batchTimeoutMs,
    maxBuffer: 1024 * 1024 * 6,
  });
  const endedAt = new Date().toISOString();
  const summary = parseSummary(result.stdout);
  return {
    ...batch,
    startedAt,
    endedAt,
    status: result.status,
    signal: result.signal,
    timedOut: Boolean(result.error && result.error.code === "ETIMEDOUT"),
    error: result.error ? String(result.error.message || result.error) : "",
    stdoutTail: String(result.stdout || "").slice(-4000),
    stderrTail: String(result.stderr || "").slice(-4000),
    summary,
    ok: result.status === 0 && Boolean(summary?.ok),
  };
}

function writeReport(report) {
  const jsonPath = path.join(outDir, "bdo-batched-click-audit.json");
  const mdPath = path.join(outDir, "bdo-batched-click-audit.md");
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");

  const lines = [
    "# BOURSE DE L'OR Batched Click Audit",
    "",
    `Generated: ${report.generatedAt}`,
    `Base URL: ${report.baseURL}`,
    `Overall: **${report.summary.ok ? "PASS" : "FAIL"}**`,
    `Batches: ${report.summary.batchCount}`,
    `Failed batches: ${report.summary.failedBatches}`,
    `Routes requested: ${report.summary.routesRequested}`,
    `Audited controls: ${report.summary.audited}`,
    `Failed controls: ${report.summary.failed}`,
    `Skipped controls: ${report.summary.skipped}`,
    "",
  ];

  for (const batch of report.batches.filter((item) => !item.ok)) {
    lines.push(`## ${batch.scope} ${batch.language} batch ${batch.index}`);
    lines.push(`Routes: ${batch.routes.join(", ")}`);
    lines.push(`Status: ${batch.status ?? "none"}${batch.timedOut ? " (timeout)" : ""}`);
    if (batch.error) lines.push(`Error: \`${batch.error}\``);
    if (batch.summary?.mdPath) lines.push(`Report: \`${batch.summary.mdPath}\``);
    if (batch.stdoutTail) lines.push("```text\n" + batch.stdoutTail.slice(-1200) + "\n```");
    if (batch.stderrTail) lines.push("```text\n" + batch.stderrTail.slice(-1200) + "\n```");
    lines.push("");
  }

  if (!report.batches.some((item) => !item.ok)) {
    lines.push("All batches passed.");
  }

  fs.writeFileSync(mdPath, lines.join("\n"), "utf8");
  return {
    jsonPath: path.relative(process.cwd(), jsonPath).replace(/\\/g, "/"),
    mdPath: path.relative(process.cwd(), mdPath).replace(/\\/g, "/"),
  };
}

const runPublic = parseBool("BDO_BATCH_PUBLIC", true);
const runAdmin = parseBool("BDO_BATCH_ADMIN", true);
const languages = parseCsv("BDO_BATCH_LANGUAGES", ["fr"]);
const publicRoutes = parseCsv("BDO_BATCH_PUBLIC_ROUTES", defaultPublicRoutes);
const adminRoutes = parseCsv("BDO_BATCH_ADMIN_ROUTES", defaultAdminRoutes);
const batchSize = Math.max(1, Number(process.env.BDO_BATCH_SIZE || 8));
const maxPerRoute = Math.max(1, Number(process.env.BDO_BATCH_MAX_PER_ROUTE || process.env.BDO_CLICK_MAX_PER_ROUTE || 6));
const batchTimeoutMs = Math.max(30_000, Number(process.env.BDO_BATCH_TIMEOUT_MS || 240_000));

const batches = [];
for (const language of languages) {
  if (runPublic) {
    chunk(publicRoutes, batchSize).forEach((routes, index) => {
      batches.push({ scope: "public", language, routes, index: index + 1 });
    });
  }
  if (runAdmin) {
    chunk(adminRoutes, batchSize).forEach((routes, index) => {
      batches.push({ scope: "admin", language, routes, index: index + 1 });
    });
  }
}

const results = batches.map(runBatch);
const summary = {
  ok: results.every((item) => item.ok),
  batchCount: results.length,
  failedBatches: results.filter((item) => !item.ok).length,
  routesRequested: results.reduce((sum, item) => sum + item.routes.length, 0),
  audited: results.reduce((sum, item) => sum + Number(item.summary?.audited || 0), 0),
  passed: results.reduce((sum, item) => sum + Number(item.summary?.passed || 0), 0),
  failed: results.reduce((sum, item) => sum + Number(item.summary?.failed || 0), 0),
  skipped: results.reduce((sum, item) => sum + Number(item.summary?.skipped || 0), 0),
};

const report = {
  generatedAt: new Date().toISOString(),
  baseURL,
  languages,
  batchSize,
  maxPerRoute,
  batchTimeoutMs,
  summary,
  batches: results,
};
const paths = writeReport(report);
console.log(JSON.stringify({ ...summary, ...paths }, null, 2));
if (!summary.ok) process.exitCode = 1;
