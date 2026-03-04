import fs from "node:fs/promises";
import path from "node:path";
import { execSync } from "node:child_process";
import { asc } from "drizzle-orm";

import { db } from "@db";
import { tenants } from "@db/schema";

import { ensureTenants } from "../server/lib/tenants";

type TenantRow = {
  id: number;
  key: string;
  name: string;
  domains: string[] | null;
};

const DEFAULT_CANONICAL_TENANTS = ["bdo", "exportunity", "zone", "mindbase"] as const;

type HealthResponse = {
  ok: boolean;
  tenant?: { id: number; slug: string };
  twilio?: {
    configured: boolean;
    envNamespace?: string;
    sms: { enabled: boolean; via: "messaging_service" | "from_number" | null };
    whatsappOtp: { enabled: boolean; verifyServiceSidPresent: boolean };
  };
  missing?: string[];
  warnings?: string[];
  message?: string;
  code?: string | null;
};

type TestResult = {
  attempted: boolean;
  ok: boolean;
  status: number | null;
  sid: string | null;
  code: string | null;
  message: string;
  requestId: string | null;
  endpoint: string;
};

function resolveCommitHash() {
  try {
    return String(execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }))
      .trim()
      .slice(0, 12);
  } catch {
    return null;
  }
}

function sanitizeDomain(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
}

function isLocalDomain(domain: string) {
  const d = sanitizeDomain(domain);
  return !d || d === "localhost" || d === "127.0.0.1" || d.endsWith(".local");
}

function pickBaseUrl(row: TenantRow) {
  const envOverride = String(process.env[`TENANT_BASE_URL_${String(row.key || "").toUpperCase()}`] || "").trim();
  if (envOverride) return envOverride.replace(/\/+$/, "");

  const knownDefaults: Record<string, string> = {
    bdo: "https://boursedelor.com",
    exportunity: "https://exportunity.net",
    zone: "https://exportunity.zone",
    mindbase: "https://mindbase.cloud",
  };
  const known = knownDefaults[String(row.key || "").toLowerCase()];
  if (known) return known;

  const domains = Array.isArray(row.domains) ? row.domains : [];
  const firstPublic = domains.map(sanitizeDomain).find((domain) => !isLocalDomain(domain));
  if (firstPublic) return `https://${firstPublic}`;
  return String(process.env.BASE_URL || "http://localhost:5000").replace(/\/+$/, "");
}

function resolveAdminToken(slug: string) {
  const tenantSpecific = String(process.env[`MESSAGING_DEBUG_AUTH_TOKEN_${String(slug || "").toUpperCase()}`] || "").trim();
  if (tenantSpecific) return tenantSpecific;
  return String(process.env.MESSAGING_DEBUG_AUTH_TOKEN || process.env.AUTH_TOKEN || "").trim();
}

function parseBool(value: string | undefined) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return ["1", "true", "yes", "y", "on"].includes(normalized);
}

function parseTenantScope() {
  const includeAll = parseBool(process.env.MESSAGING_DEBUG_INCLUDE_ALL_TENANTS);
  const requested = String(process.env.MESSAGING_DEBUG_TENANTS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (includeAll) {
    return {
      includeAll: true,
      slugs: [] as string[],
      label: "all-db-tenants",
    };
  }

  if (requested.length > 0) {
    return {
      includeAll: false,
      slugs: Array.from(new Set(requested)),
      label: "env-filtered",
    };
  }

  return {
    includeAll: false,
    slugs: Array.from(DEFAULT_CANONICAL_TENANTS),
    label: "canonical-default",
  };
}

function headersForTenant(slug: string, token: string | null) {
  const headers: Record<string, string> = {
    "x-tenant-key": slug,
    "content-type": "application/json",
  };
  if (token) headers.authorization = `Bearer ${token}`;
  return headers;
}

async function fetchJson(url: string, options?: RequestInit) {
  try {
    const response = await fetch(url, options);
    const raw = await response.text();
    let json: any = null;
    try {
      json = raw ? JSON.parse(raw) : null;
    } catch {
      json = null;
    }
    return {
      ok: response.ok,
      status: response.status,
      url,
      json,
      raw,
    };
  } catch (error: any) {
    return {
      ok: false,
      status: 0,
      url,
      json: null,
      raw: String(error?.message || "fetch_failed"),
    };
  }
}

function toTestResult(input: {
  attempted: boolean;
  endpoint: string;
  response?: { ok: boolean; status: number; json: any; raw: string };
  skippedReason?: string;
}): TestResult {
  if (!input.attempted) {
    return {
      attempted: false,
      ok: false,
      status: null,
      sid: null,
      code: null,
      message: input.skippedReason || "skipped",
      requestId: null,
      endpoint: input.endpoint,
    };
  }

  const response = input.response;
  const sid = response?.json?.sid ? String(response.json.sid) : null;
  const code = response?.json?.code ? String(response.json.code) : null;
  const message =
    String(response?.json?.message || "").trim() ||
    String(response?.json?.status || "").trim() ||
    (response?.ok ? "ok" : String(response?.raw || "request_failed"));
  const requestId = response?.json?.requestId ? String(response.json.requestId) : null;
  return {
    attempted: true,
    ok: Boolean(response?.ok),
    status: response?.status ?? null,
    sid,
    code,
    message,
    requestId,
    endpoint: input.endpoint,
  };
}

function markdownFromReport(report: any) {
  const lines: string[] = [];
  lines.push("# Messaging Debug Report");
  lines.push("");
  lines.push(`- Timestamp: \`${report.timestamp}\``);
  lines.push(`- Commit: \`${report.commitHash || "unknown"}\``);
  lines.push(`- Total tenants: \`${report.summary.total}\``);
  lines.push(`- PASS: \`${report.summary.pass}\``);
  lines.push(`- FAIL: \`${report.summary.fail}\``);
  lines.push(`- Scope: \`${report.scope.mode}\``);
  if (Array.isArray(report.scope.slugs) && report.scope.slugs.length) {
    lines.push(`- Scoped slugs: \`${report.scope.slugs.join(", ")}\``);
  }
  lines.push("");
  lines.push("| Tenant | Base URL | Health | SMS Test | WA OTP Test | Notes |");
  lines.push("|---|---|---:|---:|---:|---|");

  for (const item of report.tenants) {
    const health = item.health?.ok ? "PASS" : "FAIL";
    const sms = item.tests?.sms?.attempted ? (item.tests.sms.ok ? "PASS" : "FAIL") : "SKIP";
    const wa = item.tests?.whatsappOtp?.attempted ? (item.tests.whatsappOtp.ok ? "PASS" : "FAIL") : "SKIP";
    const note = item.notes?.join("; ") || "";
    lines.push(`| ${item.slug} | ${item.baseUrl} | ${health} | ${sms} | ${wa} | ${note} |`);
  }

  lines.push("");
  for (const item of report.tenants) {
    lines.push(`## ${item.slug}`);
    lines.push(`- Tenant ID: \`${item.id}\``);
    lines.push(`- Base URL: \`${item.baseUrl}\``);
    lines.push(`- Env namespace: \`${item.envNamespace || "global"}\``);
    lines.push(`- Health endpoint: \`${item.healthEndpoint}\``);
    lines.push(`- Health status: ${item.health?.ok ? "PASS" : "FAIL"} (${item.health?.status ?? "n/a"})`);
    if (Array.isArray(item.health?.missing) && item.health.missing.length) {
      lines.push(`- Missing: ${item.health.missing.join(", ")}`);
    }
    if (Array.isArray(item.health?.warnings) && item.health.warnings.length) {
      lines.push(`- Warnings: ${item.health.warnings.join(" | ")}`);
    }
    lines.push(`- SMS test: ${item.tests.sms.attempted ? (item.tests.sms.ok ? "PASS" : "FAIL") : "SKIP"} (${item.tests.sms.message})`);
    lines.push(`- WA OTP test: ${item.tests.whatsappOtp.attempted ? (item.tests.whatsappOtp.ok ? "PASS" : "FAIL") : "SKIP"} (${item.tests.whatsappOtp.message})`);
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  await ensureTenants();

  const rows = (await db
    .select({
      id: tenants.id,
      key: tenants.key,
      name: tenants.name,
      domains: tenants.domains,
    })
    .from(tenants)
    .orderBy(asc(tenants.id))) as TenantRow[];
  const tenantScope = parseTenantScope();
  const scopedRows = tenantScope.includeAll
    ? rows
    : rows.filter((row) => tenantScope.slugs.includes(String(row.key || "").toLowerCase()));
  if (!scopedRows.length) {
    throw new Error(`No tenants matched scope ${tenantScope.label} (${tenantScope.slugs.join(", ") || "all"})`);
  }

  const smsPhone = String(process.env.MESSAGING_TEST_PHONE_SMS || "").trim();
  const waPhone = String(process.env.MESSAGING_TEST_PHONE_WHATSAPP || smsPhone).trim();
  const commitHash = resolveCommitHash();
  const timestamp = new Date().toISOString();

  const tenantsInventory = scopedRows.map((row) => ({
    id: Number(row.id),
    slug: String(row.key),
    name: String(row.name),
    baseUrl: pickBaseUrl(row),
    envNamespace: "global",
    messagingProviderMode: "twilio",
    providerFlags: {
      sms: null as boolean | null,
      whatsappOtp: null as boolean | null,
      smsVia: null as "messaging_service" | "from_number" | null,
    },
  }));

  const results: any[] = [];

  for (const tenant of tenantsInventory) {
    const token = resolveAdminToken(tenant.slug);
    const healthEndpoint = `${tenant.baseUrl}/api/health/messaging`;
    const healthResp = await fetchJson(healthEndpoint, {
      headers: headersForTenant(tenant.slug, token || null),
    });

    const healthJson = (healthResp.json || {}) as HealthResponse;
    const notes: string[] = [];
    if (!token) notes.push("admin token missing");
    if (!smsPhone) notes.push("MESSAGING_TEST_PHONE_SMS missing");
    if (!waPhone) notes.push("MESSAGING_TEST_PHONE_WHATSAPP missing");

    tenant.envNamespace = String(healthJson?.twilio?.envNamespace || "global");
    tenant.providerFlags.sms = Boolean(healthJson?.twilio?.sms?.enabled);
    tenant.providerFlags.whatsappOtp = Boolean(healthJson?.twilio?.whatsappOtp?.enabled);
    tenant.providerFlags.smsVia = healthJson?.twilio?.sms?.via || null;

    const smsEndpoint = `${tenant.baseUrl}/api/health/messaging/test?channel=sms&phone=${encodeURIComponent(smsPhone)}`;
    const smsResp =
      token && smsPhone
        ? await fetchJson(smsEndpoint, {
            headers: headersForTenant(tenant.slug, token),
          })
        : null;

    const waEndpoint = `${tenant.baseUrl}/api/health/messaging/test?channel=whatsappOtp&phone=${encodeURIComponent(waPhone)}`;
    const waResp =
      token && waPhone
        ? await fetchJson(waEndpoint, {
            headers: headersForTenant(tenant.slug, token),
          })
        : null;

    const smsResult = toTestResult({
      attempted: Boolean(token && smsPhone),
      endpoint: smsEndpoint,
      response: smsResp ? { ok: smsResp.ok, status: smsResp.status, json: smsResp.json, raw: smsResp.raw } : undefined,
      skippedReason: !token ? "missing_admin_token" : !smsPhone ? "missing_sms_phone" : "skipped",
    });

    const waResult = toTestResult({
      attempted: Boolean(token && waPhone),
      endpoint: waEndpoint,
      response: waResp ? { ok: waResp.ok, status: waResp.status, json: waResp.json, raw: waResp.raw } : undefined,
      skippedReason: !token ? "missing_admin_token" : !waPhone ? "missing_whatsapp_phone" : "skipped",
    });

    results.push({
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      baseUrl: tenant.baseUrl,
      envNamespace: tenant.envNamespace,
      healthEndpoint,
      health: {
        ok: healthResp.ok,
        status: healthResp.status,
        missing: healthJson?.missing || [],
        warnings: healthJson?.warnings || [],
      },
      tests: {
        sms: smsResult,
        whatsappOtp: waResult,
      },
      notes,
      pass: Boolean(healthResp.ok && (!smsResult.attempted || smsResult.ok) && (!waResult.attempted || waResult.ok)),
    });
  }

  const report = {
    timestamp,
    commitHash,
    scope: {
      mode: tenantScope.label,
      includeAll: tenantScope.includeAll,
      slugs: tenantScope.slugs,
    },
    summary: {
      total: results.length,
      pass: results.filter((entry) => entry.pass).length,
      fail: results.filter((entry) => !entry.pass).length,
    },
    tenants: results,
  };

  const artifactsDir = path.resolve(process.cwd(), "artifacts");
  await fs.mkdir(artifactsDir, { recursive: true });

  await fs.writeFile(path.resolve(process.cwd(), "tenants.json"), `${JSON.stringify(tenantsInventory, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(artifactsDir, "tenants.json"), `${JSON.stringify(tenantsInventory, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(artifactsDir, "messaging-debug-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(artifactsDir, "messaging-debug-report.md"), markdownFromReport(report), "utf8");

  console.log(JSON.stringify(report, null, 2));
  if (report.summary.fail > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error("[debugAllTenantsMessaging] failed:", error?.message || error);
  process.exit(1);
});
