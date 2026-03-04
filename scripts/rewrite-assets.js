#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { parseDocument } from "htmlparser2";
import render from "dom-serializer";
import { getAttributeValue, getElementsByTagName, textContent } from "domutils";

const URL_RE = /https?:\/\/[^\s"'`<>()\\]+/gi;
const ESCAPED_URL_RE = /https?:\\\/\\\/[a-z0-9._~:/?#\[\]@!$&'()*+,;=%-]+/gi;
const CSS_URL_RE = /url\(([^)]+)\)/gi;

function decodeMaybe(value) {
  const s = String(value || "");
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function normalizeEscapedUrl(value) {
  return String(value || "").replace(/\\\//g, "/");
}

function stripHash(url) {
  try {
    const u = new URL(String(url || "").trim());
    u.hash = "";
    return u.toString();
  } catch {
    return String(url || "").trim();
  }
}

function stripQueryAndHash(url) {
  try {
    const u = new URL(String(url || "").trim());
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return String(url || "").trim().split("#")[0]?.split("?")[0] || "";
  }
}

function extractWixToken(url) {
  const value = String(url || "");
  const m = value.match(/([0-9a-f]{6}_[a-z0-9._~%-]{8,}\.(?:jpe?g|png|webp|gif|svg|avif))/i);
  return m ? String(m[1]).toLowerCase() : null;
}

function toAbsoluteUrl(raw, baseUrl) {
  const value = String(raw || "").trim();
  if (!value) return null;
  if (value.startsWith("//")) return `https:${value}`;
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  if (!baseUrl) return null;
  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return null;
  }
}

function parseSrcset(value) {
  return String(value || "")
    .split(",")
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const [url, ...rest] = chunk.split(/\s+/);
      return { url, descriptor: rest.join(" ").trim() };
    });
}

function walk(node, visitor) {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visitor);
    return;
  }
  if (node.type === "tag") visitor(node);
  if (node.children && node.children.length) walk(node.children, visitor);
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function collectFiles(rootDir, extSet) {
  const out = [];
  if (!(await pathExists(rootDir))) return out;
  const stack = [rootDir];
  while (stack.length) {
    const current = stack.pop();
    if (!current) continue;
    let entries = [];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (extSet.has(ext)) out.push(full);
    }
  }
  return out;
}

function buildAssetLookup(assetMap) {
  const direct = new Map();
  const byToken = new Map();

  const register = (key, localPath) => {
    const k = String(key || "").trim();
    const v = String(localPath || "").trim();
    if (!k || !v) return;
    direct.set(k, v);
  };

  for (const [remote, local] of Object.entries(assetMap || {})) {
    const remoteUrl = stripHash(remote);
    const remoteDecoded = decodeMaybe(remoteUrl);
    register(remoteUrl, local);
    register(stripQueryAndHash(remoteUrl), local);
    register(remoteDecoded, local);
    register(stripQueryAndHash(remoteDecoded), local);
    const token = extractWixToken(remoteUrl);
    if (token && !byToken.has(token)) byToken.set(token, String(local));
  }

  const resolve = (raw, baseUrl = null) => {
    const absolute = toAbsoluteUrl(raw, baseUrl);
    if (!absolute) return null;
    const normalized = stripHash(absolute);
    const noQuery = stripQueryAndHash(normalized);
    const decoded = decodeMaybe(normalized);
    const decodedNoQuery = stripQueryAndHash(decoded);

    const directHit =
      direct.get(normalized) ||
      direct.get(noQuery) ||
      direct.get(decoded) ||
      direct.get(decodedNoQuery);
    if (directHit) return String(directHit);

    const token = extractWixToken(normalized);
    if (token && byToken.has(token)) return String(byToken.get(token));

    return null;
  };

  return { resolve };
}

function rewriteCssUrls(value, resolver, baseUrl, stats) {
  const text = String(value || "");
  return text.replace(CSS_URL_RE, (full, inner) => {
    const raw = String(inner || "").trim().replace(/^['"]|['"]$/g, "");
    const mapped = resolver(raw, baseUrl);
    if (!mapped) return full;
    stats.replacements += 1;
    return `url(${mapped})`;
  });
}

function rewriteTextUrls(value, resolver, baseUrl, stats) {
  let text = String(value || "");

  const replaceByPattern = (pattern, transform) => {
    const matches = text.match(pattern) || [];
    const unique = Array.from(new Set(matches)).sort((a, b) => b.length - a.length);
    for (const rawMatch of unique) {
      const normalized = transform(rawMatch);
      const mapped = resolver(normalized, baseUrl);
      if (!mapped) continue;
      text = text.split(rawMatch).join(mapped);
      stats.replacements += 1;
    }
  };

  replaceByPattern(URL_RE, (value) => value);
  replaceByPattern(ESCAPED_URL_RE, (value) => normalizeEscapedUrl(value));
  text = rewriteCssUrls(text, resolver, baseUrl, stats);

  return text;
}

async function rewriteHtmlFile(filePath, resolver, stats) {
  const html = await fs.readFile(filePath, "utf8");
  const doc = parseDocument(html);

  const guessBaseUrl = () => {
    const normalized = filePath.replace(/\\/g, "/").toLowerCase();
    const marker = "/mirror/www.exportunity.com/";
    const idx = normalized.indexOf(marker);
    if (idx >= 0) {
      const rel = filePath.replace(/\\/g, "/").slice(idx + marker.length);
      const route = rel.replace(/\/index\.html?$/i, "");
      const pathname = route ? `/${route}` : "/";
      return `https://www.exportunity.com${pathname}`;
    }
    return "https://www.exportunity.com/";
  };

  const baseUrl = guessBaseUrl();
  const attrsToRewrite = ["src", "href", "data-src", "data-bg", "data-background", "poster", "content"];

  walk(doc, (node) => {
    if (!node.attribs) return;
    for (const attr of attrsToRewrite) {
      const raw = getAttributeValue(node, attr);
      if (!raw) continue;
      const mapped = resolver(raw, baseUrl);
      if (!mapped) continue;
      node.attribs[attr] = mapped;
      stats.replacements += 1;
    }

    for (const attr of ["srcset", "data-srcset"]) {
      const raw = getAttributeValue(node, attr);
      if (!raw) continue;
      const rewritten = parseSrcset(raw)
        .map((entry) => {
          const mapped = resolver(entry.url, baseUrl) || entry.url;
          return entry.descriptor ? `${mapped} ${entry.descriptor}` : mapped;
        })
        .join(", ");
      if (rewritten !== raw) {
        node.attribs[attr] = rewritten;
        stats.replacements += 1;
      }
    }

    const style = getAttributeValue(node, "style");
    if (style && style.includes("url(")) {
      const rewritten = rewriteCssUrls(style, resolver, baseUrl, stats);
      if (rewritten !== style) node.attribs.style = rewritten;
    }
  });

  for (const styleEl of getElementsByTagName("style", doc, true)) {
    const cssText = textContent(styleEl);
    if (!cssText || !cssText.includes("url(")) continue;
    const rewritten = rewriteCssUrls(cssText, resolver, baseUrl, stats);
    if (rewritten !== cssText && Array.isArray(styleEl.children)) {
      for (const child of styleEl.children) {
        if (child.type === "text") child.data = rewritten;
      }
    }
  }

  const out = render(doc, { encodeEntities: false });
  if (out !== html) {
    await fs.writeFile(filePath, out, "utf8");
    stats.filesUpdated += 1;
  }
}

async function rewriteTextFile(filePath, resolver, stats) {
  const raw = await fs.readFile(filePath, "utf8");
  const rewritten = rewriteTextUrls(raw, resolver, "https://www.exportunity.com/", stats);
  if (rewritten !== raw) {
    await fs.writeFile(filePath, rewritten, "utf8");
    stats.filesUpdated += 1;
  }
}

async function main() {
  const repoRoot = process.cwd();
  const crawlDir = path.resolve(repoRoot, "crawl");
  const mapPath = path.join(crawlDir, "asset-map.json");

  const mapPayload = JSON.parse(await fs.readFile(mapPath, "utf8"));
  const { resolve } = buildAssetLookup(mapPayload);

  const targets = [
    path.resolve(repoRoot, "client", "public", "exportunity"),
    path.resolve(repoRoot, "client", "src", "content", "exportunity"),
    path.resolve(repoRoot, "content", "about"),
  ];

  const htmlExt = new Set([".html", ".htm"]);
  const textExt = new Set([".json", ".md", ".txt", ".css", ".js", ".mjs", ".cjs"]);

  const stats = {
    filesScanned: 0,
    filesUpdated: 0,
    replacements: 0,
  };

  for (const rootDir of targets) {
    const htmlFiles = await collectFiles(rootDir, htmlExt);
    for (const filePath of htmlFiles) {
      stats.filesScanned += 1;
      await rewriteHtmlFile(filePath, resolve, stats);
    }

    const textFiles = await collectFiles(rootDir, textExt);
    for (const filePath of textFiles) {
      stats.filesScanned += 1;
      await rewriteTextFile(filePath, resolve, stats);
    }
  }

  console.log(
    `[rewrite-assets] ok files_scanned=${stats.filesScanned} files_updated=${stats.filesUpdated} replacements=${stats.replacements}`,
  );
}

main().catch((error) => {
  console.error("[rewrite-assets] failed:", error?.message || error);
  process.exit(1);
});
