#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { parseDocument } from "htmlparser2";
import { getElementsByTagName, getAttributeValue, textContent } from "domutils";

function nowIso() {
  return new Date().toISOString();
}

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function normalizeHostname(hostname) {
  return String(hostname || "").trim().toLowerCase();
}

function isHttpUrl(value) {
  const s = String(value || "").trim();
  return s.startsWith("http://") || s.startsWith("https://");
}

function stripHash(url) {
  try {
    const u = new URL(url);
    u.hash = "";
    return u.toString();
  } catch {
    return String(url || "");
  }
}

function normalizeRoutePath(pathname) {
  const p = String(pathname || "").trim();
  if (!p.startsWith("/")) return "/";
  if (p === "/") return "/";
  return p.endsWith("/") ? p.slice(0, -1) : p;
}

function parseSrcset(value) {
  const srcset = String(value || "").trim();
  if (!srcset) return [];
  return srcset
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.split(/\s+/)[0])
    .filter(Boolean);
}

function extractStyleUrls(styleText) {
  const s = String(styleText || "");
  const urls = [];
  const re = /url\(([^)]+)\)/gi;
  let m;
  while ((m = re.exec(s))) {
    const raw = String(m[1] || "").trim().replace(/^['"]|['"]$/g, "");
    if (raw) urls.push(raw);
  }
  return urls;
}

function isInternalPageUrl(url, rootHost) {
  try {
    const u = new URL(url);
    const host = normalizeHostname(u.hostname);
    if (!host) return false;
    if (host === rootHost) return true;
    return host.endsWith(".exportunity.com") || host === "exportunity.com";
  } catch {
    return false;
  }
}

function toAbsoluteUrl(maybeUrl, baseUrl) {
  const raw = String(maybeUrl || "").trim();
  if (!raw) return null;
  if (raw.startsWith("#")) return null;
  if (raw.startsWith("mailto:") || raw.startsWith("tel:") || raw.startsWith("javascript:")) return null;
  try {
    if (isHttpUrl(raw)) return stripHash(raw);
    return stripHash(new URL(raw, baseUrl).toString());
  } catch {
    return null;
  }
}

function extractMeta(doc) {
  const meta = {
    title: null,
    description: null,
    canonical: null,
    openGraph: {},
    twitter: {},
  };

  const titleEl = getElementsByTagName("title", doc, true, 1)[0] || null;
  if (titleEl) {
    const t = textContent(titleEl).trim();
    meta.title = t || null;
  }

  const metaEls = getElementsByTagName("meta", doc, true);
  for (const el of metaEls) {
    const name = String(getAttributeValue(el, "name") || "").trim().toLowerCase();
    const property = String(getAttributeValue(el, "property") || "").trim().toLowerCase();
    const content = String(getAttributeValue(el, "content") || "").trim();
    if (!content) continue;

    if (name === "description") meta.description = content;
    if (property.startsWith("og:")) meta.openGraph[property] = content;
    if (name.startsWith("twitter:")) meta.twitter[name] = content;
  }

  const linkEls = getElementsByTagName("link", doc, true);
  for (const el of linkEls) {
    const rel = String(getAttributeValue(el, "rel") || "").trim().toLowerCase();
    if (rel !== "canonical") continue;
    const href = String(getAttributeValue(el, "href") || "").trim();
    if (!href) continue;
    meta.canonical = href;
  }

  return meta;
}

function extractLinksAndAssets(doc, pageUrl) {
  const links = new Set();
  const assets = new Set();

  const walk = (node, fn) => {
    if (!node) return;
    if (Array.isArray(node)) {
      for (const child of node) walk(child, fn);
      return;
    }
    if (node.type === "tag") fn(node);
    if (node.children && node.children.length) walk(node.children, fn);
  };

  const aEls = getElementsByTagName("a", doc, true);
  for (const el of aEls) {
    const href = getAttributeValue(el, "href");
    const abs = toAbsoluteUrl(href, pageUrl);
    if (abs) links.add(abs);
  }

  const imgEls = getElementsByTagName("img", doc, true);
  for (const el of imgEls) {
    const src = toAbsoluteUrl(getAttributeValue(el, "src"), pageUrl);
    if (src) assets.add(src);
    const srcset = getAttributeValue(el, "srcset");
    for (const u of parseSrcset(srcset)) {
      const abs = toAbsoluteUrl(u, pageUrl);
      if (abs) assets.add(abs);
    }
  }

  const sourceEls = getElementsByTagName("source", doc, true);
  for (const el of sourceEls) {
    const srcset = getAttributeValue(el, "srcset");
    for (const u of parseSrcset(srcset)) {
      const abs = toAbsoluteUrl(u, pageUrl);
      if (abs) assets.add(abs);
    }
  }

  const scriptEls = getElementsByTagName("script", doc, true);
  for (const el of scriptEls) {
    const src = toAbsoluteUrl(getAttributeValue(el, "src"), pageUrl);
    if (src) assets.add(src);
  }

  const linkEls = getElementsByTagName("link", doc, true);
  for (const el of linkEls) {
    const href = toAbsoluteUrl(getAttributeValue(el, "href"), pageUrl);
    if (!href) continue;
    const rel = String(getAttributeValue(el, "rel") || "").trim().toLowerCase();
    if (rel === "stylesheet" || rel === "preload" || rel === "icon" || rel === "apple-touch-icon") {
      assets.add(href);
    }
  }

  const metaEls = getElementsByTagName("meta", doc, true);
  for (const el of metaEls) {
    const property = String(getAttributeValue(el, "property") || "").trim().toLowerCase();
    if (!property) continue;
    if (!property.startsWith("og:") && property !== "twitter:image") continue;
    const content = toAbsoluteUrl(getAttributeValue(el, "content"), pageUrl);
    if (content) assets.add(content);
  }

  // Inline styles
  walk(doc, (el) => {
    const style = getAttributeValue(el, "style");
    if (!style) return;
    for (const u of extractStyleUrls(style)) {
      const abs = toAbsoluteUrl(u, pageUrl);
      if (abs) assets.add(abs);
    }
  });

  // Style blocks
  const styleEls = getElementsByTagName("style", doc, true);
  for (const el of styleEls) {
    const css = textContent(el);
    for (const u of extractStyleUrls(css)) {
      const abs = toAbsoluteUrl(u, pageUrl);
      if (abs) assets.add(abs);
    }
  }

  return { links: Array.from(links), assets: Array.from(assets) };
}

async function fetchText(url, timeoutMs) {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "ExportunityCloneBot/1.0 (+local-dev)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: controller?.signal,
    });
    const contentType = String(resp.headers.get("content-type") || "");
    const text = await resp.text();
    return { ok: resp.ok, status: resp.status, contentType, text };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function main() {
  const startUrl = String(process.env.CRAWL_START_URL || "https://www.exportunity.com/").trim();
  const outDir = String(process.env.CRAWL_OUT_DIR || "crawl").trim();
  const maxPages = clampInt(process.env.CRAWL_MAX_PAGES, 1, 5_000, 250);
  const concurrency = clampInt(process.env.CRAWL_CONCURRENCY, 1, 20, 4);
  const timeoutMs = clampInt(process.env.CRAWL_TIMEOUT_MS, 2_000, 60_000, 15_000);

  const root = new URL(startUrl);
  const rootHost = normalizeHostname(root.hostname);
  if (!rootHost) throw new Error("Invalid CRAWL_START_URL");

  const routes = new Set();
  const assets = new Set();
  const metaByRoute = {};

  const visited = new Set();
  const queue = [root.toString()];

  const workers = new Array(concurrency).fill(0).map(async () => {
    while (queue.length && routes.size < maxPages) {
      const url = queue.shift();
      if (!url) continue;
      if (visited.has(url)) continue;
      visited.add(url);

      if (!isInternalPageUrl(url, rootHost)) continue;

      let resp;
      try {
        resp = await fetchText(url, timeoutMs);
      } catch (err) {
        continue;
      }

      if (!resp.ok) continue;
      if (!resp.contentType.toLowerCase().includes("text/html")) continue;

      const pageUrl = stripHash(url);
      let route;
      try {
        const u = new URL(pageUrl);
        route = normalizeRoutePath(u.pathname);
      } catch {
        continue;
      }

      routes.add(route);

      const doc = parseDocument(resp.text);
      const meta = extractMeta(doc);
      metaByRoute[route] = meta;

      const extracted = extractLinksAndAssets(doc, pageUrl);
      for (const a of extracted.assets) assets.add(a);

      for (const nextUrl of extracted.links) {
        if (!isInternalPageUrl(nextUrl, rootHost)) continue;
        try {
          const u = new URL(nextUrl);
          u.search = ""; // route inventory is path-based
          u.hash = "";
          const cleaned = u.toString();
          if (!visited.has(cleaned) && !queue.includes(cleaned)) queue.push(cleaned);
        } catch {
          // ignore
        }
      }
    }
  });

  await fs.mkdir(outDir, { recursive: true });

  await Promise.all(workers);

  const sortedRoutes = Array.from(routes).sort();
  const sortedAssets = Array.from(assets).sort();

  const allowEmpty = String(process.env.CRAWL_ALLOW_EMPTY || "").trim().toLowerCase() === "true";
  if (!allowEmpty && sortedRoutes.length === 0) {
    const existingRoutesPath = path.join(outDir, "routes.json");
    try {
      const existing = JSON.parse(await fs.readFile(existingRoutesPath, "utf8"));
      if (Array.isArray(existing) && existing.length > 0) {
        console.warn(
          `[crawl] WARNING: produced 0 pages; keeping existing ${existingRoutesPath} (${existing.length} routes).`,
        );
        return;
      }
    } catch {
      // ignore
    }

    throw new Error(
      `Crawl produced 0 pages. Check network/DNS access to ${startUrl} (or set CRAWL_ALLOW_EMPTY=true to bypass).`,
    );
  }

  const hosts = new Map();
  for (const a of sortedAssets) {
    try {
      const u = new URL(a);
      const h = normalizeHostname(u.hostname);
      hosts.set(h, (hosts.get(h) || 0) + 1);
    } catch {
      // ignore
    }
  }
  const sortedHosts = Array.from(hosts.entries()).sort((a, b) => b[1] - a[1]);

  await fs.writeFile(path.join(outDir, "routes.json"), JSON.stringify(sortedRoutes, null, 2) + "\n", "utf8");
  await fs.writeFile(path.join(outDir, "assets.json"), JSON.stringify(sortedAssets, null, 2) + "\n", "utf8");
  await fs.writeFile(path.join(outDir, "meta.json"), JSON.stringify(metaByRoute, null, 2) + "\n", "utf8");

  const reportLines = [];
  reportLines.push(`# exportunity.com crawl report`);
  reportLines.push("");
  reportLines.push(`- Started: ${startUrl}`);
  reportLines.push(`- Timestamp: ${nowIso()}`);
  reportLines.push(`- Pages: ${sortedRoutes.length}`);
  reportLines.push(`- Assets: ${sortedAssets.length}`);
  reportLines.push(`- Asset hosts: ${sortedHosts.length}`);
  reportLines.push("");
  reportLines.push("## Routes");
  for (const r of sortedRoutes) reportLines.push(`- ${r}`);
  reportLines.push("");
  reportLines.push("## Asset hosts");
  for (const [h, count] of sortedHosts) reportLines.push(`- ${h}: ${count}`);
  reportLines.push("");

  await fs.writeFile(path.join(outDir, "report.md"), reportLines.join("\n"), "utf8");

  console.log(`[crawl] ok pages=${sortedRoutes.length} assets=${sortedAssets.length} outDir=${outDir}`);
}

main().catch((err) => {
  console.error("[crawl] failed:", err?.message || err);
  process.exit(1);
});
