#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import pLimit from "p-limit";
import { parseDocument } from "htmlparser2";
import { getAttributeValue, getElementsByTagName, textContent } from "domutils";

const DEFAULT_START_URL = "https://www.exportunity.com/";
const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
  Referer: DEFAULT_START_URL,
};
const IMAGE_ONLY_HEADERS = {
  ...DEFAULT_HEADERS,
  Accept: "image/*,*/*;q=0.8",
};
const URL_RE = /\bhttps?:\/\/[^\s"'`<>\\)]+/gi;
const ESCAPED_URL_RE = /https?:\\\/\\\/[a-z0-9._~:/?#\[\]@!$&'()*+,;=%-]+/gi;
const WIX_MEDIA_TOKEN_RE = /\b[0-9a-f]{6}_[a-z0-9._~%-]{8,}\.(?:jpe?g|png|webp|gif|svg|avif)\b/gi;
const IMAGE_EXT_RE = /\.(?:jpe?g|png|webp|gif|svg|ico|avif)(?:$|[?#])/i;

function nowIso() {
  return new Date().toISOString();
}

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function toAbsoluteUrl(raw, baseUrl) {
  const value = String(raw || "").trim();
  if (!value) return null;
  if (value.startsWith("#")) return null;
  if (value.startsWith("data:")) return null;
  if (value.startsWith("mailto:") || value.startsWith("tel:") || value.startsWith("javascript:")) return null;
  try {
    const absolute = value.startsWith("http://") || value.startsWith("https://") ? new URL(value) : new URL(value, baseUrl);
    absolute.hash = "";
    return absolute.toString();
  } catch {
    return null;
  }
}

function stripQueryAndHash(input) {
  const value = String(input || "").trim();
  if (!value) return "";
  return value.split("#")[0]?.split("?")[0] || "";
}

function extractWidthFromUrl(rawUrl) {
  const value = String(rawUrl || "");
  let width = 0;
  try {
    const u = new URL(value);
    const queryW = Number.parseInt(String(u.searchParams.get("w") || ""), 10);
    if (Number.isFinite(queryW) && queryW > width) width = queryW;
    const queryWidth = Number.parseInt(String(u.searchParams.get("width") || ""), 10);
    if (Number.isFinite(queryWidth) && queryWidth > width) width = queryWidth;
  } catch {
    // noop
  }
  for (const m of value.matchAll(/(?:^|[,_/-])w[_=](\d{2,5})(?:$|[,_/-])/gi)) {
    const n = Number.parseInt(String(m[1] || ""), 10);
    if (Number.isFinite(n) && n > width) width = n;
  }
  return width;
}

function parseSrcset(value) {
  const input = String(value || "").trim();
  if (!input) return [];
  return input
    .split(",")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const [url, descriptor] = chunk.split(/\s+/, 2);
      const d = String(descriptor || "").trim().toLowerCase();
      let width = 0;
      if (d.endsWith("w")) {
        const n = Number.parseInt(d.slice(0, -1), 10);
        if (Number.isFinite(n)) width = n;
      } else if (d.endsWith("x")) {
        const n = Number.parseFloat(d.slice(0, -1));
        if (Number.isFinite(n)) width = Math.round(n * 1000);
      }
      return { url: String(url || "").trim(), width };
    })
    .filter((entry) => entry.url);
}

function extractCssUrls(cssText) {
  const text = String(cssText || "");
  const urls = [];
  const re = /(?:background-image|mask-image|list-style-image|content)?\s*:\s*[^;]*url\(([^)]+)\)/gi;
  let m;
  while ((m = re.exec(text))) {
    const raw = String(m[1] || "")
      .trim()
      .replace(/^['"]|['"]$/g, "");
    if (raw) urls.push(raw);
  }
  return urls;
}

function normalizeEscapedUrl(value) {
  return String(value || "").replace(/\\\//g, "/");
}

function extractUrlsFromText(rawText) {
  const text = String(rawText || "");
  const urls = [];
  for (const match of text.matchAll(URL_RE)) {
    const value = String(match[0] || "").trim();
    if (value) urls.push(value);
  }
  for (const match of text.matchAll(ESCAPED_URL_RE)) {
    const value = normalizeEscapedUrl(String(match[0] || "").trim());
    if (value) urls.push(value);
  }
  return urls;
}

function extractWixMediaTokensFromText(rawText) {
  const text = String(rawText || "");
  const urls = [];
  for (const match of text.matchAll(WIX_MEDIA_TOKEN_RE)) {
    const token = String(match[0] || "").trim();
    if (!token) continue;
    urls.push(`https://static.wixstatic.com/media/${token}`);
  }
  return urls;
}

function decodeMaybe(value) {
  const input = String(value || "");
  try {
    return decodeURIComponent(input);
  } catch {
    return input;
  }
}

function extractWixTokenFromUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    const decodedPath = decodeMaybe(u.pathname || "");
    const mediaIdx = decodedPath.indexOf("/media/");
    if (mediaIdx >= 0) {
      const after = decodedPath.slice(mediaIdx + "/media/".length);
      const firstSegment = after.split("/")[0] || "";
      if (firstSegment && firstSegment !== "undefined") return firstSegment;
      const maybeFile = after.split("/").filter(Boolean).at(-1) || "";
      if (maybeFile) return maybeFile;
    }
  } catch {
    return null;
  }
  return null;
}

function deriveWixCandidates(rawUrl) {
  const url = String(rawUrl || "").trim();
  if (!url) return [];

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return [url];
  }
  const host = String(parsed.hostname || "").toLowerCase();
  if (!host.includes("wixstatic.com")) return [url];

  const out = new Set([url]);
  const token = extractWixTokenFromUrl(url);
  if (token) {
    out.add(`https://${host}/media/${token}`);
  }

  const decodedPath = decodeMaybe(parsed.pathname || "");
  if (decodedPath.includes("/v1/")) {
    const parts = decodedPath.split("/").filter(Boolean);
    const last = parts.at(-1) || "";
    if (last && last !== token) {
      out.add(`https://${host}/media/${last}`);
    }
  }

  return Array.from(out);
}

function scoreCandidate(candidateUrl, widthHint) {
  let score = 0;
  const width = Number.isFinite(widthHint) ? widthHint : 0;
  score += width;
  score += extractWidthFromUrl(candidateUrl);
  if (candidateUrl.includes("/media/") && !candidateUrl.includes("/v1/")) score += 50_000;
  if (candidateUrl.includes("quality_auto")) score += 200;
  if (candidateUrl.includes("enc_auto")) score += 200;
  return score;
}

function normalizeAssetCandidates(absoluteUrl, widthHint) {
  const candidates = new Set([absoluteUrl]);
  for (const u of deriveWixCandidates(absoluteUrl)) candidates.add(u);

  const ranked = Array.from(candidates)
    .map((url) => ({ url, score: scoreCandidate(url, widthHint) }))
    .sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));

  return {
    preferredUrl: ranked[0]?.url || absoluteUrl,
    candidates: ranked.map((item) => item.url),
  };
}

function keyForAsset(url) {
  const token = extractWixTokenFromUrl(url);
  if (token) return `wix:${token.toLowerCase()}`;
  return stripQueryAndHash(url).toLowerCase();
}

function likelyImageUrl(url) {
  const value = String(url || "").toLowerCase();
  if (!value) return false;
  if (IMAGE_EXT_RE.test(value)) return true;
  if (value.includes("static.wixstatic.com/media/")) return true;
  if (value.includes("/media/") && value.includes("wixstatic")) return true;
  return false;
}

async function fetchText(url, timeoutMs, acceptHeader = DEFAULT_HEADERS.Accept) {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        ...DEFAULT_HEADERS,
        Accept: acceptHeader,
      },
      redirect: "follow",
      signal: controller?.signal,
    });
    const contentType = String(response.headers.get("content-type") || "");
    const text = await response.text();
    return { ok: response.ok, status: response.status, contentType, text };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function fetchIsImage(url, timeoutMs) {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetch(url, {
      method: "HEAD",
      headers: IMAGE_ONLY_HEADERS,
      redirect: "follow",
      signal: controller?.signal,
    });
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    return {
      ok: response.ok,
      status: response.status,
      isImage: response.ok && contentType.startsWith("image/"),
      contentType,
    };
  } catch {
    return {
      ok: false,
      status: 0,
      isImage: false,
      contentType: "",
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function uniqStrings(values) {
  const out = [];
  const seen = new Set();
  for (const raw of values) {
    const value = String(raw || "").trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function walkJsonStrings(root, visitor) {
  const seen = new Set();
  const stack = [root];
  while (stack.length) {
    const cur = stack.pop();
    if (cur == null) continue;
    if (typeof cur === "string") {
      visitor(cur);
      continue;
    }
    if (typeof cur !== "object") continue;
    if (seen.has(cur)) continue;
    seen.add(cur);
    if (Array.isArray(cur)) {
      for (const item of cur) stack.push(item);
      continue;
    }
    for (const value of Object.values(cur)) stack.push(value);
  }
}

async function main() {
  const repoRoot = process.cwd();
  const crawlDir = path.resolve(repoRoot, String(process.env.CRAWL_OUT_DIR || "crawl").trim());
  const routesPath = path.join(crawlDir, "routes.json");
  const outPath = path.join(crawlDir, "assets-deep.json");
  const reportPath = path.join(crawlDir, "assets-deep-report.md");

  const startUrl = String(process.env.CRAWL_START_URL || DEFAULT_START_URL).trim();
  const timeoutMs = clampInt(process.env.CRAWL_TIMEOUT_MS, 2_000, 120_000, 30_000);
  const pageConcurrency = clampInt(process.env.DEEP_ASSET_PAGE_CONCURRENCY, 1, 16, 4);
  const resourceConcurrency = clampInt(process.env.DEEP_ASSET_RESOURCE_CONCURRENCY, 1, 16, 4);
  const maxRoutes = clampInt(process.env.DEEP_ASSET_MAX_ROUTES, 1, 5_000, 250);
  const maxExternalCss = clampInt(process.env.DEEP_ASSET_MAX_CSS, 1, 800, 80);
  const maxExternalJs = clampInt(process.env.DEEP_ASSET_MAX_JS, 1, 800, 80);
  const maxExternalBytes = clampInt(process.env.DEEP_ASSET_MAX_RESOURCE_CHARS, 2_000, 10_000_000, 1_500_000);
  const maxContentTypeProbes = clampInt(process.env.DEEP_ASSET_MAX_CONTENT_TYPE_PROBES, 1, 10_000, 500);

  let routes = ["/", "/about", "/library", "/copy-of-home", "/invest", "/contact-8"];
  try {
    const payload = JSON.parse(await fs.readFile(routesPath, "utf8"));
    if (Array.isArray(payload) && payload.length) {
      routes = payload.map((v) => String(v || "").trim()).filter((v) => v.startsWith("/"));
    }
  } catch {
    // fallback list
  }
  routes = uniqStrings(routes).slice(0, maxRoutes);

  const root = new URL(startUrl);
  const rootOrigin = root.origin;

  const assetMap = new Map();
  const whereCounts = new Map();
  const routeAssetCounts = new Map();
  const cssResources = new Map();
  const jsResources = new Map();
  const routeErrors = [];
  const pendingContentTypeProbe = new Map();

  const addCount = (map, key, by = 1) => map.set(key, (map.get(key) || 0) + by);

  const addResourceRef = (resourceMap, resourceUrl, hint) => {
    if (!resourceUrl) return;
    if (!resourceMap.has(resourceUrl)) resourceMap.set(resourceUrl, []);
    const list = resourceMap.get(resourceUrl);
    list.push(hint);
  };

  const queueContentTypeProbe = ({ absoluteUrl, route, where }) => {
    if (!absoluteUrl) return;
    const key = stripQueryAndHash(absoluteUrl).toLowerCase();
    const existing = pendingContentTypeProbe.get(key);
    if (existing) {
      if (!existing.sources.some((s) => s.route === route && s.where === where)) {
        existing.sources.push({ route, where });
      }
      return;
    }
    pendingContentTypeProbe.set(key, {
      url: absoluteUrl,
      sources: [{ route, where }],
    });
  };

  const addAsset = ({ absoluteUrl, route, where, widthHint = 0, force = false }) => {
    if (!absoluteUrl) return;
    if (!force && !likelyImageUrl(absoluteUrl)) {
      queueContentTypeProbe({ absoluteUrl, route, where });
      return;
    }

    const normalized = normalizeAssetCandidates(absoluteUrl, widthHint);
    const key = keyForAsset(normalized.preferredUrl);
    const sourceHint = { route, where };

    const entry = assetMap.get(key) || {
      key,
      url: normalized.preferredUrl,
      candidates: [],
      sources: [],
      score: scoreCandidate(normalized.preferredUrl, widthHint),
    };

    for (const candidate of normalized.candidates) {
      if (!entry.candidates.includes(candidate)) entry.candidates.push(candidate);
      const candidateScore = scoreCandidate(candidate, widthHint);
      if (candidateScore > entry.score) {
        entry.score = candidateScore;
        entry.url = candidate;
      }
    }

    if (!entry.sources.some((s) => s.route === sourceHint.route && s.where === sourceHint.where)) {
      entry.sources.push(sourceHint);
      addCount(whereCounts, where, 1);
      addCount(routeAssetCounts, route, 1);
    }

    assetMap.set(key, entry);
  };

  const parseJsonForAssets = (jsonText, route, whereLabel) => {
    const raw = String(jsonText || "").trim();
    if (!raw) return;
    let obj = null;
    try {
      obj = JSON.parse(raw);
    } catch {
      try {
        obj = JSON.parse(normalizeEscapedUrl(raw));
      } catch {
        obj = null;
      }
    }
    if (!obj) return;

    walkJsonStrings(obj, (str) => {
      for (const url of extractUrlsFromText(str)) {
        const abs = toAbsoluteUrl(url, rootOrigin);
        if (abs) addAsset({ absoluteUrl: abs, route, where: whereLabel });
      }
      for (const mediaUrl of extractWixMediaTokensFromText(str)) {
        addAsset({ absoluteUrl: mediaUrl, route, where: whereLabel });
      }
      const candidate = String(str || "").trim();
      if (candidate.match(WIX_MEDIA_TOKEN_RE)) {
        addAsset({ absoluteUrl: `https://static.wixstatic.com/media/${candidate}`, route, where: whereLabel });
      }
    });
  };

  const scanHtmlRoute = async (route) => {
    const pageUrl = new URL(route, rootOrigin).toString();
    const response = await fetchText(pageUrl, timeoutMs);
    if (!response.ok) throw new Error(`status ${response.status}`);
    if (!String(response.contentType || "").toLowerCase().includes("text/html")) {
      throw new Error(`content-type ${response.contentType || "unknown"}`);
    }

    const html = String(response.text || "");
    const doc = parseDocument(html);

    for (const img of getElementsByTagName("img", doc, true)) {
      const src = toAbsoluteUrl(getAttributeValue(img, "src"), pageUrl);
      if (src) addAsset({ absoluteUrl: src, route, where: "img:src" });

      const dataSrc = toAbsoluteUrl(getAttributeValue(img, "data-src"), pageUrl);
      if (dataSrc) addAsset({ absoluteUrl: dataSrc, route, where: "img:data-src" });

      for (const candidate of parseSrcset(getAttributeValue(img, "srcset"))) {
        const abs = toAbsoluteUrl(candidate.url, pageUrl);
        if (abs) addAsset({ absoluteUrl: abs, route, where: "img:srcset", widthHint: candidate.width });
      }
      for (const candidate of parseSrcset(getAttributeValue(img, "data-srcset"))) {
        const abs = toAbsoluteUrl(candidate.url, pageUrl);
        if (abs) addAsset({ absoluteUrl: abs, route, where: "img:data-srcset", widthHint: candidate.width });
      }
    }

    for (const source of getElementsByTagName("source", doc, true)) {
      const src = toAbsoluteUrl(getAttributeValue(source, "src"), pageUrl);
      if (src) addAsset({ absoluteUrl: src, route, where: "source:src" });
      for (const candidate of parseSrcset(getAttributeValue(source, "srcset"))) {
        const abs = toAbsoluteUrl(candidate.url, pageUrl);
        if (abs) addAsset({ absoluteUrl: abs, route, where: "source:srcset", widthHint: candidate.width });
      }
    }

    for (const link of getElementsByTagName("link", doc, true)) {
      const href = toAbsoluteUrl(getAttributeValue(link, "href"), pageUrl);
      if (!href) continue;
      const rel = String(getAttributeValue(link, "rel") || "").toLowerCase();
      const asType = String(getAttributeValue(link, "as") || "").toLowerCase();
      if (rel.includes("icon") || rel.includes("apple-touch-icon")) {
        addAsset({ absoluteUrl: href, route, where: "link:icon" });
      }
      if (rel.includes("stylesheet")) {
        addResourceRef(cssResources, href, { route, where: "css:href" });
      } else if (rel.includes("preload") && asType === "style") {
        addResourceRef(cssResources, href, { route, where: "css:preload" });
      } else if (rel.includes("preload") && asType === "image") {
        addAsset({ absoluteUrl: href, route, where: "link:preload-image" });
      }
    }

    for (const meta of getElementsByTagName("meta", doc, true)) {
      const property = String(getAttributeValue(meta, "property") || "").toLowerCase();
      const name = String(getAttributeValue(meta, "name") || "").toLowerCase();
      const content = toAbsoluteUrl(getAttributeValue(meta, "content"), pageUrl);
      if (!content) continue;
      if (property === "og:image" || name === "twitter:image" || property === "twitter:image") {
        addAsset({ absoluteUrl: content, route, where: "meta:image" });
      }
    }

    const walkDom = (node, visit) => {
      if (!node) return;
      if (Array.isArray(node)) {
        for (const child of node) walkDom(child, visit);
        return;
      }
      if (node.type === "tag") visit(node);
      if (node.children && node.children.length) walkDom(node.children, visit);
    };

    walkDom(doc, (element) => {
      const style = getAttributeValue(element, "style");
      if (!style || !style.includes("url(")) return;
      for (const raw of extractCssUrls(style)) {
        const abs = toAbsoluteUrl(raw, pageUrl);
        if (abs) addAsset({ absoluteUrl: abs, route, where: "style:inline" });
      }
    });

    for (const style of getElementsByTagName("style", doc, true)) {
      const cssText = textContent(style);
      for (const raw of extractCssUrls(cssText)) {
        const abs = toAbsoluteUrl(raw, pageUrl);
        if (abs) addAsset({ absoluteUrl: abs, route, where: "style:block" });
      }
    }

    for (const script of getElementsByTagName("script", doc, true)) {
      const src = toAbsoluteUrl(getAttributeValue(script, "src"), pageUrl);
      if (src) {
        addResourceRef(jsResources, src, { route, where: "js:src" });
      }

      const scriptType = String(getAttributeValue(script, "type") || "").toLowerCase();
      const scriptText = textContent(script) || "";
      if (!scriptText.trim()) continue;

      if (scriptType.includes("json")) {
        parseJsonForAssets(scriptText, route, "json:script");
      } else {
        for (const found of extractUrlsFromText(scriptText)) {
          const abs = toAbsoluteUrl(found, pageUrl);
          if (!abs) continue;
          addAsset({ absoluteUrl: abs, route, where: "js:inline-url" });
        }
        for (const found of extractWixMediaTokensFromText(scriptText)) {
          addAsset({ absoluteUrl: found, route, where: "js:inline-token" });
        }
      }
    }

    for (const found of extractWixMediaTokensFromText(html)) {
      addAsset({ absoluteUrl: found, route, where: "html:wix-token" });
    }
  };

  const pageLimit = pLimit(pageConcurrency);
  await Promise.all(
    routes.map((route) =>
      pageLimit(async () => {
        try {
          await scanHtmlRoute(route);
        } catch (error) {
          routeErrors.push({
            route,
            error: error?.message || String(error),
          });
        }
      }),
    ),
  );

  const scanExternalResource = async (resourceUrl, refs, mode) => {
    let response;
    try {
      response = await fetchText(
        resourceUrl,
        timeoutMs,
        mode === "css" ? "text/css,*/*;q=0.8" : "application/javascript,text/javascript,*/*;q=0.8",
      );
    } catch {
      return;
    }
    if (!response.ok) return;

    let body = String(response.text || "");
    if (body.length > maxExternalBytes) {
      body = body.slice(0, maxExternalBytes);
    }

    const reference = refs[0] || { route: "/", where: mode === "css" ? "css:external" : "js:external" };
    const route = reference.route || "/";

    if (mode === "css") {
      for (const raw of extractCssUrls(body)) {
        const abs = toAbsoluteUrl(raw, resourceUrl);
        if (!abs) continue;
        addAsset({ absoluteUrl: abs, route, where: "css:url" });
      }
      return;
    }

    for (const raw of extractUrlsFromText(body)) {
      const abs = toAbsoluteUrl(raw, resourceUrl);
      if (!abs) continue;
      addAsset({ absoluteUrl: abs, route, where: "js:url" });
    }
    for (const raw of extractWixMediaTokensFromText(body)) {
      addAsset({ absoluteUrl: raw, route, where: "js:wix-token" });
    }
  };

  const cssList = Array.from(cssResources.entries())
    .map(([url, refs]) => ({ url, refs }))
    .slice(0, maxExternalCss);
  const jsList = Array.from(jsResources.entries())
    .map(([url, refs]) => ({ url, refs }))
    .slice(0, maxExternalJs);

  const resourceLimit = pLimit(resourceConcurrency);
  await Promise.all(
    cssList.map((item) => resourceLimit(() => scanExternalResource(item.url, item.refs, "css"))),
  );
  await Promise.all(
    jsList.map((item) => resourceLimit(() => scanExternalResource(item.url, item.refs, "js"))),
  );

  const probeTargets = Array.from(pendingContentTypeProbe.values()).slice(0, maxContentTypeProbes);
  await Promise.all(
    probeTargets.map((probe) =>
      resourceLimit(async () => {
        const checked = await fetchIsImage(probe.url, timeoutMs);
        if (!checked.isImage) return;
        const first = probe.sources[0] || { route: "/", where: "content-type-probe" };
        addAsset({
          absoluteUrl: probe.url,
          route: first.route,
          where: `${first.where}:content-type`,
          force: true,
        });
      }),
    ),
  );

  const assets = Array.from(assetMap.values())
    .map((entry) => ({
      url: entry.url,
      candidates: uniqStrings(entry.candidates).sort((a, b) => a.localeCompare(b)),
      sources: entry.sources
        .slice()
        .sort((a, b) => `${a.route}|${a.where}`.localeCompare(`${b.route}|${b.where}`))
        .map((source) => ({
          route: source.route,
          where: source.where,
        })),
    }))
    .sort((a, b) => a.url.localeCompare(b.url));

  await fs.mkdir(crawlDir, { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(assets, null, 2) + "\n", "utf8");

  const whereSummary = Array.from(whereCounts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const routeSummary = Array.from(routeAssetCounts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const byCategory = new Map();
  const addCategory = (category, amount) => byCategory.set(category, (byCategory.get(category) || 0) + amount);
  for (const [where, count] of whereSummary) {
    const lower = where.toLowerCase();
    if (lower.startsWith("img:src")) addCategory("img/src", count);
    else if (lower.includes("srcset")) addCategory("srcset", count);
    else if (lower.startsWith("style:") || lower.startsWith("css:")) addCategory("css-bg", count);
    else if (lower.startsWith("meta:") || lower.startsWith("link:icon")) addCategory("meta/icons", count);
    else if (lower.startsWith("json:") || lower.startsWith("js:") || lower.includes("html:wix-token")) addCategory("json/js", count);
    else addCategory("other", count);
  }

  const reportLines = [];
  reportLines.push("# Deep asset extraction report");
  reportLines.push("");
  reportLines.push(`- Generated: ${nowIso()}`);
  reportLines.push(`- Start URL: ${startUrl}`);
  reportLines.push(`- Routes scanned: ${routes.length}`);
  reportLines.push(`- Unique image assets: ${assets.length}`);
  reportLines.push(`- External CSS scanned: ${cssList.length}`);
  reportLines.push(`- External JS scanned: ${jsList.length}`);
  reportLines.push(`- Content-type probes: ${probeTargets.length}`);
  reportLines.push(`- Route fetch errors: ${routeErrors.length}`);
  reportLines.push("");
  reportLines.push("## Counts by required type");
  for (const [category, count] of Array.from(byCategory.entries()).sort((a, b) => b[1] - a[1])) {
    reportLines.push(`- ${category}: ${count}`);
  }
  reportLines.push("");
  reportLines.push("## Counts by extraction type");
  for (const [type, count] of whereSummary) {
    reportLines.push(`- ${type}: ${count}`);
  }
  reportLines.push("");
  reportLines.push("## Top routes by discovered assets");
  for (const [route, count] of routeSummary.slice(0, 25)) {
    reportLines.push(`- ${route}: ${count}`);
  }
  if (routeErrors.length) {
    reportLines.push("");
    reportLines.push("## Route errors");
    for (const item of routeErrors.slice(0, 50)) {
      reportLines.push(`- ${item.route}: ${item.error}`);
    }
    if (routeErrors.length > 50) {
      reportLines.push(`- ... ${routeErrors.length - 50} more`);
    }
  }
  reportLines.push("");
  await fs.writeFile(reportPath, reportLines.join("\n"), "utf8");

  console.log(
    `[extract-assets-deep] ok routes=${routes.length} assets=${assets.length} out=${path.relative(repoRoot, outPath)}`,
  );
}

main().catch((error) => {
  console.error("[extract-assets-deep] failed:", error?.message || error);
  process.exit(1);
});
