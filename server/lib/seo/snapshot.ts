import { db } from "@db";
import { seoIssues, seoPageSnapshots, tenantSites } from "@db/schema";
import { sql } from "drizzle-orm";

function normalizeHost(host: string) {
  return host.split(",")[0]?.split(":")[0]?.trim().toLowerCase() || "";
}

function defaultCanonicalHost(domain: string) {
  const d = normalizeHost(domain);
  if (d.startsWith("www.")) return d.slice("www.".length);
  return d;
}

function extractFirst(html: string, pattern: RegExp) {
  const m = pattern.exec(html);
  return m?.[1] ? String(m[1]).trim() : null;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractMetaByName(html: string, name: string) {
  const re = new RegExp(`<meta[^>]+name=["']${escapeRegex(name)}["'][^>]*>`, "i");
  const m = html.match(re);
  const tag = m?.[0] ?? null;
  if (!tag) return null;
  const content = extractFirst(tag, /content=["']([^"']*)["']/i);
  return content;
}

function extractLinkRel(html: string, rel: string) {
  const re = new RegExp(`<link[^>]+rel=["']${escapeRegex(rel)}["'][^>]*>`, "i");
  const m = html.match(re);
  const tag = m?.[0] ?? null;
  if (!tag) return null;
  const href = extractFirst(tag, /href=["']([^"']*)["']/i);
  return href;
}

function extractMetaGroup(html: string, kind: "property" | "name", prefix: string) {
  const re = new RegExp(`<meta[^>]+${kind}=["']${prefix}[^"']+["'][^>]*>`, "gi");
  const out: Record<string, string> = {};
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) != null) {
    const tag = m[0];
    const key = extractFirst(tag, new RegExp(`${kind}=["']([^"']+)["']`, "i"));
    const content = extractFirst(tag, /content=["']([^"']*)["']/i);
    if (key && content) out[key] = content;
  }
  return out;
}

async function ensureSiteId(input: { tenantId: number; env: string; host: string }) {
  const domain = normalizeHost(input.host);
  if (!domain) return null;
  const canonicalHost = defaultCanonicalHost(domain);
  const now = new Date();
  const [row] = await db
    .insert(tenantSites)
    .values({
      tenantId: input.tenantId,
      env: input.env,
      domain,
      canonicalHost,
      defaultLocale: "en",
      urlPatterns: {},
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [tenantSites.tenantId, tenantSites.env, tenantSites.domain],
      set: { canonicalHost, updatedAt: now },
    })
    .returning({ id: tenantSites.id });

  const id = Number(row?.id);
  return Number.isFinite(id) && id > 0 ? id : null;
}

async function fetchWithRedirects(input: { baseUrl: string; path: string; headers?: Record<string, string> }) {
  const chain: string[] = [];
  let current = new URL(input.path, input.baseUrl).toString();

  for (let i = 0; i < 6; i += 1) {
    chain.push(current);
    const resp = await fetch(current, {
      redirect: "manual",
      headers: {
        Accept: "text/html",
        "User-Agent": "SEO-Snapshot-Bot/1.0",
        ...(input.headers ?? {}),
      },
    });

    const status = resp.status;
    const location = resp.headers.get("location");
    const isRedirect = status >= 300 && status < 400 && location;
    if (isRedirect && location) {
      current = new URL(location, current).toString();
      continue;
    }

    const body = await resp.text();
    return { statusCode: status, finalUrl: current, redirectChain: chain, html: body };
  }

  return { statusCode: 0, finalUrl: current, redirectChain: chain, html: "" };
}

export function defaultSeoScanPaths() {
  return [
    "/",
    "/zone",
    "/gateway",
    "/about",
    "/how-it-works",
    "/sellers",
    "/cadre-conformite",
    "/terms",
    "/privacy",
  ];
}

export async function runSeoSnapshotScan(input: {
  tenantId: number;
  env: string;
  host: string;
  baseUrl: string;
  paths?: string[];
  maxPages?: number;
}) {
  const now = new Date();
  const siteId = await ensureSiteId({ tenantId: input.tenantId, env: input.env, host: input.host });
  const paths = (input.paths && input.paths.length ? input.paths : defaultSeoScanPaths()).slice(
    0,
    Math.min(Math.max(input.maxPages ?? 60, 1), 200),
  );

  const snapshots: Array<{ path: string; title: string | null; description: string | null }> = [];
  const issuesToUpsert: Array<{ path: string; issueType: string; severity: number; message: string; evidence: any }> = [];

  for (const p of paths) {
    const path = p.startsWith("/") ? p : `/${p}`;
    const fetched = await fetchWithRedirects({
      baseUrl: input.baseUrl,
      path,
      headers: { "x-forwarded-host": input.host, Host: normalizeHost(input.host) },
    });

    const html = fetched.html || "";
    const title = extractFirst(html, /<title[^>]*>([^<]*)<\/title>/i);
    const metaDescription = extractMetaByName(html, "description");
    const canonical = extractLinkRel(html, "canonical");
    const robots = extractMetaByName(html, "robots");
    const openGraph = extractMetaGroup(html, "property", "og:");
    const twitter = extractMetaGroup(html, "name", "twitter:");
    const jsonLdPresent = /<script[^>]+type=["']application\/ld\+json["'][^>]*>/i.test(html);
    const internalLinksCount = (html.match(/<a\s/gi) || []).length;

    await db.insert(seoPageSnapshots).values({
      tenantId: input.tenantId,
      siteId,
      env: input.env,
      url: fetched.finalUrl,
      path,
      statusCode: fetched.statusCode,
      redirectChain: fetched.redirectChain,
      title,
      metaDescription,
      canonical,
      robots,
      openGraph,
      twitter,
      jsonLdPresent,
      breadcrumbsPresent: false,
      internalLinksCount,
      performanceSummary: {},
      collectedAt: now,
    });

    snapshots.push({ path, title, description: metaDescription });

    if (fetched.statusCode >= 400 || fetched.statusCode === 0) {
      issuesToUpsert.push({
        path,
        issueType: "http_error",
        severity: 3,
        message: `HTTP ${fetched.statusCode || "error"}`,
        evidence: { statusCode: fetched.statusCode, redirectChain: fetched.redirectChain },
      });
    }

    if (!title) {
      issuesToUpsert.push({
        path,
        issueType: "missing_title",
        severity: 3,
        message: "Missing <title>",
        evidence: { url: fetched.finalUrl },
      });
    }

    if (!canonical) {
      issuesToUpsert.push({
        path,
        issueType: "missing_canonical",
        severity: 3,
        message: "Missing canonical link",
        evidence: { url: fetched.finalUrl },
      });
    } else {
      try {
        const url = new URL(canonical);
        const canonicalHost = url.host.toLowerCase();
        const expected = defaultCanonicalHost(input.host);
        if (canonicalHost && expected && canonicalHost !== expected) {
          issuesToUpsert.push({
            path,
            issueType: "wrong_canonical_host",
            severity: 3,
            message: `Canonical host mismatch (${canonicalHost} != ${expected})`,
            evidence: { canonical },
          });
        }
      } catch {
        issuesToUpsert.push({
          path,
          issueType: "invalid_canonical",
          severity: 3,
          message: "Canonical is not a valid URL",
          evidence: { canonical },
        });
      }
    }

    if (!metaDescription) {
      issuesToUpsert.push({
        path,
        issueType: "missing_meta_description",
        severity: 2,
        message: "Missing meta description",
        evidence: { url: fetched.finalUrl },
      });
    }
  }

  const titleCounts = new Map<string, number>();
  const descCounts = new Map<string, number>();
  for (const s of snapshots) {
    if (s.title) titleCounts.set(s.title, (titleCounts.get(s.title) || 0) + 1);
    if (s.description) descCounts.set(s.description, (descCounts.get(s.description) || 0) + 1);
  }

  for (const s of snapshots) {
    if (s.title && (titleCounts.get(s.title) || 0) > 1) {
      issuesToUpsert.push({
        path: s.path,
        issueType: "duplicate_title",
        severity: 2,
        message: "Duplicate title within tenant",
        evidence: { title: s.title, count: titleCounts.get(s.title) },
      });
    }
    if (s.description && (descCounts.get(s.description) || 0) > 1) {
      issuesToUpsert.push({
        path: s.path,
        issueType: "duplicate_meta_description",
        severity: 1,
        message: "Duplicate meta description within tenant",
        evidence: { metaDescription: s.description, count: descCounts.get(s.description) },
      });
    }
  }

  for (const issue of issuesToUpsert) {
    await db
      .insert(seoIssues)
      .values({
        tenantId: input.tenantId,
        siteId,
        env: input.env,
        path: issue.path,
        issueType: issue.issueType,
        severity: issue.severity,
        status: "open",
        message: issue.message,
        evidence: issue.evidence ?? {},
        firstSeenAt: now,
        lastSeenAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [seoIssues.tenantId, seoIssues.env, seoIssues.path, seoIssues.issueType],
        set: {
          severity: issue.severity,
          status: "open",
          message: issue.message,
          evidence: issue.evidence ?? {},
          lastSeenAt: now,
          updatedAt: now,
        },
      });
  }

  // Best-effort: mark old issues as resolved if not seen in this scan (tenant+env scope).
  const presentKeys = new Set(issuesToUpsert.map((i) => `${i.path}::${i.issueType}`));
  if (presentKeys.size === 0) {
    await db.execute(sql`
      update seo_issues
      set status = 'resolved', updated_at = now()
      where tenant_id = ${input.tenantId}
        and env = ${input.env}
        and status = 'open';
    `);
  } else {
    await db.execute(sql`
      update seo_issues
      set status = 'resolved', updated_at = now()
      where tenant_id = ${input.tenantId}
        and env = ${input.env}
        and status = 'open'
        and (path || '::' || issue_type) not in (${sql.join(Array.from(presentKeys).map((k) => sql`${k}`), sql`,`)});
    `);
  }

  return { ok: true, pages: paths.length, issues: issuesToUpsert.length };
}
