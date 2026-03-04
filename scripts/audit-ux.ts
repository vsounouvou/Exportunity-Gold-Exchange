import "../env";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import https from "node:https";

type TenantKey = "bdo" | "exportunity";

type RequestResult<T = any> = {
  ok: boolean;
  status: number;
  ms: number;
  data: T | null;
  error?: string;
};

function truthyFlag(raw: string | null | undefined) {
  if (!raw) return false;
  const v = String(raw).trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "y" || v === "on";
}

function parseArg(name: string): string | null {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return null;
  return String(process.argv[idx + 1] || "").trim() || null;
}

function parseIntArg(name: string, fallback: number) {
  const raw = parseArg(name);
  const n = raw != null ? Number.parseInt(raw, 10) : Number.NaN;
  return Number.isFinite(n) ? n : fallback;
}

function resolveTenants(raw: string | null): TenantKey[] {
  const v = (raw || "all").trim().toLowerCase();
  if (v === "all") return ["bdo", "exportunity"];
  const items = v
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  const out: TenantKey[] = [];
  for (const item of items) {
    if (item === "bdo" || item === "exportunity") out.push(item);
  }
  return out.length ? out : ["bdo", "exportunity"];
}

function hostHeaderForTenant(tenant: TenantKey) {
  if (tenant === "exportunity") return "exportunity.net";
  return "localhost";
}

function requestJson<T = any>(input: {
  baseUrl: URL;
  hostHeader: string;
  method: "GET" | "POST";
  path: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
}): Promise<RequestResult<T>> {
  const start = Date.now();
  const url = new URL(input.path, input.baseUrl);

  const mod = url.protocol === "https:" ? https : http;
  const bodyText = input.body != null ? JSON.stringify(input.body) : null;

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(bodyText ? { "Content-Type": "application/json" } : {}),
    ...(input.headers || {}),
    Host: input.hostHeader,
  };

  if (bodyText) headers["Content-Length"] = Buffer.byteLength(bodyText).toString();

  return new Promise((resolve) => {
    const req = mod.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? "443" : "80"),
        method: input.method,
        path: url.pathname + url.search,
        headers,
        timeout: input.timeoutMs ?? 30000,
      },
      (res) => {
        const status = res.statusCode || 0;
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c))));
        res.on("end", () => {
          const ms = Date.now() - start;
          const raw = Buffer.concat(chunks).toString("utf-8");
          if (status < 200 || status >= 300) {
            resolve({
              ok: false,
              status,
              ms,
              data: null,
              error: raw || `HTTP ${status}`,
            });
            return;
          }
          try {
            resolve({ ok: true, status, ms, data: raw ? (JSON.parse(raw) as T) : (null as any) });
          } catch (err: any) {
            resolve({ ok: false, status, ms, data: null, error: err?.message || "Invalid JSON" });
          }
        });
      },
    );

    req.on("timeout", () => {
      req.destroy(new Error("timeout"));
    });
    req.on("error", (err: any) => {
      const ms = Date.now() - start;
      resolve({ ok: false, status: 0, ms, data: null, error: err?.message || String(err) });
    });

    if (bodyText) req.write(bodyText);
    req.end();
  });
}

async function loginAdmin(input: { baseUrl: URL; hostHeader: string; email: string; password: string }) {
  const res = await requestJson<{ token?: string } & Record<string, any>>({
    baseUrl: input.baseUrl,
    hostHeader: input.hostHeader,
    method: "POST",
    path: "/api/ece/auth/login",
    body: { email: input.email, password: input.password },
    timeoutMs: 20000,
  });
  const token = res.ok ? String((res.data as any)?.token || "") : "";
  return { ...res, token: token || null };
}

function mdEscape(text: unknown) {
  return String(text ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("|", "\\|");
}

function writeReport(pass: number, markdown: string) {
  const filename = `audit-report-pass-${pass}.md`;
  const outPath = path.join(process.cwd(), filename);
  fs.writeFileSync(outPath, markdown, "utf-8");
  return outPath;
}

async function runPass(pass: number, input: {
  baseUrl: URL;
  tenants: TenantKey[];
  adminEmail: string;
  adminPassword: string;
  applyFixes: boolean;
  maxRegenerate: number;
}) {
  const results: any = { pass, baseUrl: input.baseUrl.toString(), generatedAt: new Date().toISOString(), tenants: {} as any };

  for (const tenant of input.tenants) {
    const hostHeader = hostHeaderForTenant(tenant);
    const tenantResult: any = { hostHeader, timings: {}, notes: [] as string[] };

    const login = await loginAdmin({
      baseUrl: input.baseUrl,
      hostHeader,
      email: input.adminEmail,
      password: input.adminPassword,
    });
    tenantResult.timings.loginMs = login.ms;
    if (!login.ok || !login.token) {
      tenantResult.login = { ok: false, status: login.status, error: login.error || "login failed" };
      results.tenants[tenant] = tenantResult;
      continue;
    }

    const authHeader = { Authorization: `Bearer ${login.token}` };
    tenantResult.login = { ok: true, status: login.status };

    const uxAudit = await requestJson({
      baseUrl: input.baseUrl,
      hostHeader,
      method: "GET",
      path: "/api/admin/ux-audit",
      headers: authHeader,
      timeoutMs: 30000,
    });
    tenantResult.timings.uxAuditMs = uxAudit.ms;
    tenantResult.uxAudit = uxAudit.ok ? uxAudit.data : { ok: false, status: uxAudit.status, error: uxAudit.error };

    const iaAudit = await requestJson({
      baseUrl: input.baseUrl,
      hostHeader,
      method: "GET",
      path: "/api/admin/ia/pages-audit",
      headers: authHeader,
      timeoutMs: 30000,
    });
    tenantResult.timings.iaAuditMs = iaAudit.ms;
    tenantResult.iaAudit = iaAudit.ok ? iaAudit.data : { ok: false, status: iaAudit.status, error: iaAudit.error };

    const buyerFeed = await requestJson<any>({
      baseUrl: input.baseUrl,
      hostHeader,
      method: "GET",
      path: "/api/marketplace/buyer/feed?lat=5.349&lng=-4.017",
      timeoutMs: 30000,
    });
    tenantResult.timings.buyerFeedMs = buyerFeed.ms;
    tenantResult.buyerFeed = buyerFeed.ok ? buyerFeed.data : { ok: false, status: buyerFeed.status, error: buyerFeed.error };

    const products = Array.isArray((buyerFeed.data as any)?.sections)
      ? (buyerFeed.data as any).sections.flatMap((s: any) => (Array.isArray(s?.products) ? s.products : []))
      : [];
    const missingProductImages = products.filter((p: any) => !p?.image && !(Array.isArray(p?.images) && p.images.length)).length;
    tenantResult.buyerFeedStats = {
      sections: Array.isArray((buyerFeed.data as any)?.sections) ? (buyerFeed.data as any).sections.length : 0,
      products: products.length,
      missingImages: missingProductImages,
    };

    const backfillDryRun = await requestJson<any>({
      baseUrl: input.baseUrl,
      hostHeader,
      method: "POST",
      path: "/api/admin/products/images/backfill-mismatch",
      headers: authHeader,
      body: {
        tenantKey: tenant,
        dryRun: true,
        scanLimit: 2000,
        maxRegenerate: input.maxRegenerate,
      },
      timeoutMs: 60000,
    });
    tenantResult.timings.backfillDryRunMs = backfillDryRun.ms;
    tenantResult.backfillDryRun = backfillDryRun.ok ? backfillDryRun.data : { ok: false, status: backfillDryRun.status, error: backfillDryRun.error };

    if (input.applyFixes && backfillDryRun.ok) {
      const missing = Number((backfillDryRun.data as any)?.missing ?? 0);
      const mismatched = Number((backfillDryRun.data as any)?.mismatched ?? 0);
      if (missing > 0 || mismatched > 0) {
        const backfillApply = await requestJson<any>({
          baseUrl: input.baseUrl,
          hostHeader,
          method: "POST",
          path: "/api/admin/products/images/backfill-mismatch",
          headers: authHeader,
          body: {
            tenantKey: tenant,
            dryRun: false,
            scanLimit: 2000,
            maxRegenerate: input.maxRegenerate,
          },
          timeoutMs: 240000,
        });
        tenantResult.timings.backfillApplyMs = backfillApply.ms;
        tenantResult.backfillApply = backfillApply.ok
          ? backfillApply.data
          : { ok: false, status: backfillApply.status, error: backfillApply.error };
      } else {
        tenantResult.notes.push("No missing/mismatched product images detected in dry-run; no backfill applied.");
      }
    }

    results.tenants[tenant] = tenantResult;
  }

  return results;
}

function buildMarkdownReport(input: { pass: number; allPasses: any[]; current: any }) {
  const pass = input.pass;
  const current = input.current;
  const prev = input.allPasses.find((p) => p.pass === pass - 1) || null;

  const lines: string[] = [];
  lines.push(`# UX Audit Report — Pass ${pass}`);
  lines.push("");
  lines.push(`Generated: ${current.generatedAt}`);
  lines.push(`Base URL: ${current.baseUrl}`);
  lines.push("");

  const tenants = Object.keys(current.tenants || {}) as TenantKey[];
  for (const tenant of tenants) {
    const r = current.tenants[tenant];
    const prevR = prev?.tenants?.[tenant] ?? null;

    lines.push(`## Tenant: ${tenant}`);
    lines.push("");
    lines.push(`Host header: \`${mdEscape(r.hostHeader)}\``);
    lines.push("");

    const loginOk = !!r.login?.ok;
    lines.push(`- Login: ${loginOk ? "OK" : `FAILED (${mdEscape(r.login?.error || "unknown")})`}`);
    lines.push(`- Timings (ms): login=${r.timings?.loginMs ?? "-"} ux=${r.timings?.uxAuditMs ?? "-"} ia=${r.timings?.iaAuditMs ?? "-"} feed=${r.timings?.buyerFeedMs ?? "-"} backfillDry=${r.timings?.backfillDryRunMs ?? "-"}`);
    lines.push("");

    const uxStats = r.uxAudit?.stats;
    if (uxStats) {
      lines.push(`- UX audit: missingMenuLinks=${uxStats.missingMenuRoutes ?? "?"} uncoveredRoutes=${uxStats.uncoveredRoutes ?? "?"}`);
    }

    const dupes = Array.isArray(r.iaAudit?.duplicates) ? r.iaAudit.duplicates.length : null;
    if (dupes != null) {
      lines.push(`- IA duplicates: ${dupes}`);
    }

    const feedStats = r.buyerFeedStats;
    if (feedStats) {
      const prevFeed = prevR?.buyerFeedStats ?? null;
      const deltaMissing = prevFeed ? Number(feedStats.missingImages) - Number(prevFeed.missingImages) : null;
      const deltaSuffix = deltaMissing != null ? ` (Δ ${deltaMissing >= 0 ? "+" : ""}${deltaMissing})` : "";
      lines.push(`- Feed: sections=${feedStats.sections} products=${feedStats.products} missingImages=${feedStats.missingImages}${deltaSuffix}`);
    }

    const dry = r.backfillDryRun;
    if (dry && dry.ok !== false) {
      const prevDry = prevR?.backfillDryRun ?? null;
      const deltaMissing = prevDry ? Number(dry.missing ?? 0) - Number(prevDry.missing ?? 0) : null;
      const deltaMismatched = prevDry ? Number(dry.mismatched ?? 0) - Number(prevDry.mismatched ?? 0) : null;
      lines.push(
        `- Backfill dry-run: scanned=${dry.scanned ?? "?"} missing=${dry.missing ?? "?"}${deltaMissing != null ? ` (Δ ${deltaMissing >= 0 ? "+" : ""}${deltaMissing})` : ""} mismatched=${dry.mismatched ?? "?"}${deltaMismatched != null ? ` (Δ ${deltaMismatched >= 0 ? "+" : ""}${deltaMismatched})` : ""}`,
      );
    }

    if (Array.isArray(r.notes) && r.notes.length) {
      for (const note of r.notes) lines.push(`- Note: ${mdEscape(note)}`);
    }

    lines.push("");
  }

  lines.push("## How to run");
  lines.push("");
  lines.push("```bash");
  lines.push("npm --prefix Exportunity-Gold-Exchange run audit:ux -- --tenants=all --passes=3");
  lines.push("```");
  lines.push("");
  lines.push("Environment:");
  lines.push("- `AUDIT_BASE_URL` (default: `http://localhost:5000`)");
  lines.push("- `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` (defaults match `tests/e2e/utils.ts`)");
  lines.push("");

  return lines.join("\n");
}

async function main() {
  const baseUrl = new URL(process.env.AUDIT_BASE_URL || process.env.E2E_BASE_URL || "http://localhost:5000");
  const tenants = resolveTenants(parseArg("--tenants"));
  const passes = Math.max(1, Math.min(parseIntArg("--passes", 3), 10));
  const applyFixes = !truthyFlag(parseArg("--no-fix")) && !truthyFlag(process.env.AUDIT_NO_FIX);
  const maxRegenerate = Math.max(0, Math.min(parseIntArg("--max-regenerate", 20), 200));

  const adminEmail = process.env.E2E_ADMIN_EMAIL || process.env.SEED_ADMIN_EMAIL || "admin@exportunity.local";
  const adminPassword = process.env.E2E_ADMIN_PASSWORD || process.env.SEED_ADMIN_PASSWORD || "ChangeMe123!";

  const allPasses: any[] = [];
  for (let pass = 1; pass <= passes; pass += 1) {
    // Between passes, we re-run after applying fixes (where possible).
    const result = await runPass(pass, { baseUrl, tenants, adminEmail, adminPassword, applyFixes: applyFixes && pass < passes, maxRegenerate });
    allPasses.push(result);
    const md = buildMarkdownReport({ pass, allPasses, current: result });
    const outPath = writeReport(pass, md);
    console.log(`wrote ${outPath}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

