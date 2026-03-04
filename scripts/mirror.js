#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import pLimit from "p-limit";
import { parseDocument } from "htmlparser2";
import { getElementsByTagName, getAttributeValue } from "domutils";
import render from "dom-serializer";

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function normalizeHostname(hostname) {
  return String(hostname || "").trim().toLowerCase();
}

function normalizeRoutePath(pathname) {
  const p = String(pathname || "").trim();
  if (!p.startsWith("/")) return "/";
  if (p === "/") return "/";
  return p.endsWith("/") ? p.slice(0, -1) : p;
}

function toAbsoluteUrl(value, baseUrl) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw.startsWith("#")) return null;
  if (raw.startsWith("mailto:") || raw.startsWith("tel:") || raw.startsWith("javascript:")) return null;
  try {
    const abs = raw.startsWith("http://") || raw.startsWith("https://") ? new URL(raw) : new URL(raw, baseUrl);
    abs.hash = "";
    return abs.toString();
  } catch {
    return null;
  }
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

function rewriteSrcset(value, mapFn) {
  const srcset = String(value || "").trim();
  if (!srcset) return srcset;
  const parts = srcset
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [url, ...rest] = part.split(/\s+/);
      const mapped = mapFn(url) || url;
      return [mapped, ...rest].join(" ").trim();
    });
  return parts.join(", ");
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

function rewriteInlineStyle(value, mapFn) {
  const s = String(value || "");
  return s.replace(/url\(([^)]+)\)/gi, (_m, inner) => {
    const raw = String(inner || "").trim().replace(/^['"]|['"]$/g, "");
    const mapped = mapFn(raw);
    if (!mapped) return `url(${inner})`;
    return `url(${mapped})`;
  });
}

function hashUrl(url) {
  return crypto.createHash("sha256").update(String(url || ""), "utf8").digest("hex").slice(0, 12);
}

function setAttr(el, name, value) {
  if (!el) return;
  if (!el.attribs) el.attribs = {};
  el.attribs[String(name)] = String(value ?? "");
}

function walk(node, fn) {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const child of node) walk(child, fn);
    return;
  }
  if (node.type === "tag") fn(node);
  if (node.children && node.children.length) walk(node.children, fn);
}

function safeFilename(value) {
  let next = String(value || "").trim();
  try {
    next = decodeURIComponent(next);
  } catch {
    // ignore decode errors
  }

  next = next
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^\.+/, "")
    .replace(/[. ]+$/g, "")
    .slice(0, 72)
    .trim();

  if (!next) return "asset";
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(next)) {
    return `asset-${next.toLowerCase()}`;
  }
  return next;
}

function extFromContentType(contentType) {
  const ct = String(contentType || "").toLowerCase();
  if (ct.includes("text/css")) return ".css";
  if (ct.includes("javascript")) return ".js";
  if (ct.includes("json")) return ".json";
  if (ct.includes("svg")) return ".svg";
  if (ct.includes("png")) return ".png";
  if (ct.includes("jpeg")) return ".jpg";
  if (ct.includes("webp")) return ".webp";
  if (ct.includes("gif")) return ".gif";
  if (ct.includes("avif")) return ".avif";
  if (ct.includes("icon")) return ".ico";
  if (ct.includes("bmp")) return ".bmp";
  return "";
}

function normalizeExt(rawExt, contentType) {
  const fallback = extFromContentType(contentType);
  let ext = String(rawExt || "").trim().toLowerCase();
  if (!ext) return fallback;
  if (!ext.startsWith(".")) ext = `.${ext}`;
  if (!/^\.[a-z0-9]{1,10}$/.test(ext)) return fallback;
  return ext;
}

async function fetchBuffer(url, timeoutMs) {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "ExportunityCloneBot/1.0 (+local-dev)" },
      redirect: "follow",
      signal: controller?.signal,
    });
    const buf = new Uint8Array(await resp.arrayBuffer());
    const contentType = String(resp.headers.get("content-type") || "");
    return { ok: resp.ok, status: resp.status, contentType, buf };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function resolvePageFile(outRoot, routePath) {
  if (routePath === "/") return path.join(outRoot, "index.html");
  const clean = routePath.replace(/^\//, "");
  return path.join(outRoot, clean, "index.html");
}

function resolveAssetFile(outAssetsDir, absoluteUrl, contentType) {
  let base = "asset";
  let ext = "";
  try {
    const u = new URL(absoluteUrl);
    const pathname = u.pathname || "";
    base = path.posix.basename(pathname) || "asset";
    const dot = base.lastIndexOf(".");
    if (dot > 0) {
      ext = normalizeExt(base.slice(dot), contentType);
      base = base.slice(0, dot);
    } else {
      ext = extFromContentType(contentType);
    }
  } catch {
    // ignore
    ext = extFromContentType(contentType);
  }

  const name = safeFilename(base || "asset");
  const h = hashUrl(absoluteUrl);
  const filename = `${name.slice(0, 64)}-${h}${ext || ""}`;
  return path.join(outAssetsDir, filename);
}

async function main() {
  const startUrl = String(process.env.MIRROR_START_URL || "https://www.exportunity.com/").trim();
  const crawlDir = String(process.env.CRAWL_OUT_DIR || "crawl").trim();
  const outDir = String(process.env.MIRROR_OUT_DIR || "mirror").trim();
  const timeoutMs = clampInt(process.env.MIRROR_TIMEOUT_MS, 2_000, 120_000, 30_000);
  const maxAssets = clampInt(process.env.MIRROR_MAX_ASSETS, 1, 200_000, 8_000);
  const assetConcurrency = clampInt(process.env.MIRROR_ASSET_CONCURRENCY, 1, 32, 8);

  const root = new URL(startUrl);
  const rootHost = normalizeHostname(root.hostname);
  if (!rootHost) throw new Error("Invalid MIRROR_START_URL");

  const routesPath = path.join(crawlDir, "routes.json");
  const assetsPath = path.join(crawlDir, "assets.json");

  let routes;
  let assets;
  try {
    routes = JSON.parse(await fs.readFile(routesPath, "utf8"));
    assets = JSON.parse(await fs.readFile(assetsPath, "utf8"));
  } catch {
    throw new Error(`Missing crawl outputs. Run: node scripts/crawl.js (writes ${crawlDir}/routes.json + assets.json)`);
  }

  if (!Array.isArray(routes) || !Array.isArray(assets)) {
    throw new Error("Invalid crawl outputs");
  }
  const allowEmpty = String(process.env.MIRROR_ALLOW_EMPTY || "").trim().toLowerCase() === "true";
  if (!allowEmpty && routes.length === 0) {
    throw new Error(
      `routes.json is empty. Run: node scripts/crawl.js (or set MIRROR_ALLOW_EMPTY=true to bypass).`,
    );
  }

  const outPagesDir = path.join(outDir, "www.exportunity.com");
  const outAssetsDir = path.join(outDir, "assets");

  await fs.mkdir(outPagesDir, { recursive: true });
  await fs.mkdir(outAssetsDir, { recursive: true });

  const assetMap = new Map();
  const assetSet = new Set();
  const assetList = [];
  for (let i = 0; i < assets.length && assetList.length < maxAssets; i++) {
    const a = String(assets[i] || "").trim();
    if (!a) continue;
    const abs = toAbsoluteUrl(a, startUrl);
    if (!abs) continue;
    if (assetSet.has(abs)) continue;
    assetSet.add(abs);
    assetList.push(abs);
  }

  const limit = pLimit(assetConcurrency);
  await Promise.all(
    assetList.map((abs) =>
      limit(async () => {
        let fetched;
        try {
          fetched = await fetchBuffer(abs, timeoutMs);
        } catch {
          return;
        }
        if (!fetched.ok) return;

        let filePath = resolveAssetFile(outAssetsDir, abs, fetched.contentType);
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        try {
          await fs.writeFile(filePath, fetched.buf);
        } catch (error) {
          const code = String(error?.code || "");
          if (code !== "ENAMETOOLONG" && code !== "ENOENT" && code !== "EINVAL") {
            return;
          }
          const fallbackExt = extFromContentType(fetched.contentType);
          filePath = path.join(outAssetsDir, `asset-${hashUrl(abs)}${fallbackExt || ".bin"}`);
          await fs.writeFile(filePath, fetched.buf);
        }
        assetMap.set(abs, filePath);
      }),
    ),
  );

  const resolveAssetHref = (raw, pageUrl, pageFileDir) => {
    const abs = toAbsoluteUrl(raw, pageUrl);
    if (!abs) return null;
    const local = assetMap.get(abs);
    if (!local) return null;
    const rel = path.relative(pageFileDir, local).replace(/\\/g, "/");
    return rel.startsWith(".") ? rel : `./${rel}`;
  };

  const resolveLinkHref = (raw, pageUrl, pageFileDir) => {
    const abs = toAbsoluteUrl(raw, pageUrl);
    if (!abs) return null;
    try {
      const u = new URL(abs);
      const host = normalizeHostname(u.hostname);
      if (!(host === rootHost || host === "exportunity.com" || host.endsWith(".exportunity.com"))) return null;
      const route = normalizeRoutePath(u.pathname);
      const targetFile = resolvePageFile(outPagesDir, route);
      const rel = path.relative(pageFileDir, targetFile).replace(/\\/g, "/");
      return rel.startsWith(".") ? rel : `./${rel}`;
    } catch {
      return null;
    }
  };

  let pagesWritten = 0;
  for (const r of routes) {
    const routePath = normalizeRoutePath(r);
    const pageUrl = new URL(routePath, startUrl).toString();

    let fetched;
    try {
      const text = await fetch(pageUrl, { headers: { "User-Agent": "ExportunityCloneBot/1.0 (+local-dev)" } });
      if (!text.ok) continue;
      const contentType = String(text.headers.get("content-type") || "").toLowerCase();
      if (!contentType.includes("text/html")) continue;
      const html = await text.text();
      fetched = { html };
    } catch {
      continue;
    }

    const filePath = resolvePageFile(outPagesDir, routePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });

    const doc = parseDocument(fetched.html);
    const pageFileDir = path.dirname(filePath);

    // Rewrite assets + internal links.
    walk(doc, (el) => {
      const tag = String(el.name || "").toLowerCase();

      if (tag === "a") {
        const href = getAttributeValue(el, "href");
        const mapped = resolveLinkHref(href, pageUrl, pageFileDir);
        if (mapped) setAttr(el, "href", mapped);
      }

      if (tag === "img" || tag === "script") {
        const src = getAttributeValue(el, "src");
        const mapped = resolveAssetHref(src, pageUrl, pageFileDir);
        if (mapped) setAttr(el, "src", mapped);
      }

      if (tag === "link") {
        const href = getAttributeValue(el, "href");
        const mapped = resolveAssetHref(href, pageUrl, pageFileDir);
        if (mapped) setAttr(el, "href", mapped);
      }

      const srcset = getAttributeValue(el, "srcset");
      if (srcset) {
        const rewritten = rewriteSrcset(srcset, (raw) => resolveAssetHref(raw, pageUrl, pageFileDir));
        if (rewritten !== srcset) setAttr(el, "srcset", rewritten);
      }

      const style = getAttributeValue(el, "style");
      if (style && style.includes("url(")) {
        const rewritten = rewriteInlineStyle(style, (raw) => resolveAssetHref(raw, pageUrl, pageFileDir));
        if (rewritten !== style) setAttr(el, "style", rewritten);
      }
    });

    // Also rewrite OG images to local paths when possible.
    const metaEls = getElementsByTagName("meta", doc, true);
    for (const el of metaEls) {
      const property = String(getAttributeValue(el, "property") || "").trim().toLowerCase();
      if (property !== "og:image") continue;
      const content = getAttributeValue(el, "content");
      const mapped = resolveAssetHref(content, pageUrl, pageFileDir);
      if (mapped) setAttr(el, "content", mapped);
    }

    const output = render(doc, { encodeEntities: false });
    await fs.writeFile(filePath, output, "utf8");
    pagesWritten += 1;
  }

  if (!allowEmpty && pagesWritten === 0) {
    let htmlCount = 0;
    const stack = [outPagesDir];
    while (stack.length && htmlCount === 0) {
      const dir = stack.pop();
      if (!dir) continue;
      let entries = [];
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          stack.push(full);
          continue;
        }
        if (entry.isFile() && String(entry.name).toLowerCase().endsWith(".html")) {
          htmlCount += 1;
          break;
        }
      }
    }
    if (htmlCount > 0) {
      console.warn(
        `[mirror] WARNING: wrote 0 pages; keeping existing mirror output under ${outPagesDir}.`,
      );
      return;
    }

    throw new Error(
      `Mirror wrote 0 pages. Check network/DNS access to ${startUrl} (or set MIRROR_ALLOW_EMPTY=true to bypass).`,
    );
  }

  const mappingOut = Object.fromEntries(Array.from(assetMap.entries()).map(([k, v]) => [k, v.replace(/\\/g, "/")]));
  await fs.writeFile(path.join(outDir, "asset-map.json"), JSON.stringify(mappingOut, null, 2) + "\n", "utf8");

  // Write a tiny README for the mirror.
  const readme = [
    "# Exportunity mirror",
    "",
    "- Pages: mirror/www.exportunity.com/**",
    "- Assets: mirror/assets/**",
    "",
    "Open `mirror/www.exportunity.com/index.html` in a browser, or serve the `mirror/` folder via a static web server.",
    "",
  ].join("\n");
  await fs.writeFile(path.join(outDir, "README.md"), readme, "utf8");

  console.log(`[mirror] ok pages=${pagesWritten} assets=${assetMap.size} outDir=${outDir}`);
}

main().catch((err) => {
  console.error("[mirror] failed:", err?.message || err);
  process.exit(1);
});
