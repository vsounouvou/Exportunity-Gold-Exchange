#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { parseDocument } from "htmlparser2";
import render from "dom-serializer";

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
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

function extractRichText(html) {
  const doc = parseDocument(String(html || ""));
  const blocks = [];

  walk(doc, (el) => {
    const testId = String(el.attribs?.["data-testid"] || "");
    if (testId === "richTextElement") blocks.push(el);
  });

  const parts = [];
  for (const block of blocks) {
    const children = Array.isArray(block.children) ? block.children : [];
    for (const child of children) {
      parts.push(render(child, { encodeEntities: false }));
    }
  }

  return parts.join("\n").trim();
}

function toSlug(href) {
  const clean = String(href || "").trim();
  if (!clean) return null;
  if (!clean.startsWith("/post/")) return null;
  const slug = clean.replace(/^\/post\//, "").split("/")[0]?.trim();
  return slug ? slug : null;
}

function decodeMaybe(value) {
  const s = String(value || "");
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
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

function extractWixToken(value) {
  const m = String(value || "").match(/([0-9a-f]{6}_[a-z0-9._~%-]{8,}\.(?:jpe?g|png|webp|gif|svg|avif))/i);
  return m ? String(m[1]).toLowerCase() : null;
}

function toAbsoluteImageUrl(raw) {
  const value = String(raw || "").trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("//")) return `https:${value}`;
  if (extractWixToken(value)) return `https://static.wixstatic.com/media/${value}`;
  return null;
}

function buildAssetResolver(assetMap) {
  const direct = new Map();
  const byToken = new Map();

  for (const [remote, local] of Object.entries(assetMap || {})) {
    const normalized = stripHash(remote);
    const decoded = decodeMaybe(normalized);
    const noQuery = stripQueryAndHash(normalized);
    const decodedNoQuery = stripQueryAndHash(decoded);
    direct.set(normalized, String(local));
    direct.set(decoded, String(local));
    direct.set(noQuery, String(local));
    direct.set(decodedNoQuery, String(local));
    const token = extractWixToken(normalized);
    if (token && !byToken.has(token)) byToken.set(token, String(local));
  }

  return (rawUrl) => {
    const value = stripHash(String(rawUrl || "").trim());
    if (!value) return null;
    const directHit = direct.get(value) || direct.get(stripQueryAndHash(value)) || direct.get(decodeMaybe(value));
    if (directHit) return String(directHit);
    const token = extractWixToken(value);
    if (token && byToken.has(token)) return String(byToken.get(token));
    return null;
  };
}

function extractPressCardsFromWarmup(warmupObj) {
  const out = [];
  const seen = new Set();
  const queue = [warmupObj];
  const visited = new Set();

  while (queue.length) {
    const current = queue.shift();
    if (!current) continue;

    if (Array.isArray(current)) {
      for (const item of current) queue.push(item);
      continue;
    }

    if (typeof current !== "object") continue;
    if (visited.has(current)) continue;
    visited.add(current);

    const title = String(current?.title || "").trim();
    const href = String(current?.url?.path || current?.link || current?.url || "").trim() || null;
    const image =
      String(current?.media?.wixMedia?.image?.url || current?.mediaUrl || current?.metaData?.name || current?.metaData?.posters?.[0]?.url || "")
        .trim() || null;
    const summary = String(current?.excerpt || current?.description || "").trim() || null;

    if (title && image) {
      const key = `${title}|${href || ""}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ title, href, image, summary });
      }
    }

    for (const value of Object.values(current)) queue.push(value);
  }

  return out;
}

async function main() {
  const libraryPath = String(process.env.LIBRARY_JSON || "client/src/content/exportunity/library.json").trim();
  const mirrorRoot = String(process.env.MIRROR_PAGES_DIR || "mirror/www.exportunity.com").trim();
  const outDir = String(process.env.POSTS_OUT_DIR || "client/public/exportunity/posts").trim();
  const outPressPath = String(process.env.PRESS_OUT_PATH || "client/src/content/exportunity/media-press.json").trim();
  const assetMapPath = String(process.env.ASSET_MAP_PATH || "crawl/asset-map.json").trim();
  const timeoutMs = clampInt(process.env.POST_SYNC_TIMEOUT_MS, 2_000, 120_000, 30_000);
  const max = clampInt(process.env.POST_SYNC_MAX, 1, 50_000, 5_000);

  const absLibrary = path.resolve(process.cwd(), libraryPath);
  const absMirror = path.resolve(process.cwd(), mirrorRoot);
  const absOut = path.resolve(process.cwd(), outDir);
  const absOutPress = path.resolve(process.cwd(), outPressPath);
  const absAssetMap = path.resolve(process.cwd(), assetMapPath);
  await fs.mkdir(absOut, { recursive: true });

  const payload = JSON.parse(await fs.readFile(absLibrary, "utf8"));
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const slugs = Array.from(
    new Set(
      items
        .map((it) => toSlug(it?.href))
        .filter(Boolean)
        .slice(0, max),
    ),
  );

  for (const slug of slugs) {
    const inputPath = path.join(absMirror, "post", slug, "index.html");
    const outputPath = path.join(absOut, `${slug}.html`);

    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const html = await fs.readFile(inputPath, "utf8");
      const extracted = extractRichText(html);
      if (!extracted) {
        console.warn(`[sync-posts] missing rich text blocks: ${inputPath}`);
        continue;
      }
      await fs.writeFile(outputPath, extracted + "\n", "utf8");
      console.log(`[sync-posts] wrote ${path.relative(process.cwd(), outputPath)}`);
    } catch {
      console.warn(`[sync-posts] missing mirror page: ${inputPath}`);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  const assetMap = JSON.parse(await fs.readFile(absAssetMap, "utf8"));
  const resolveAsset = buildAssetResolver(assetMap);

  let pressCards = [];
  try {
    const homeHtml = await fs.readFile(path.join(absMirror, "index.html"), "utf8");
    const warmupMatch = homeHtml.match(/<script[^>]*id="wix-warmup-data"[^>]*>([\s\S]*?)<\/script>/i);
    if (warmupMatch) {
      const warmup = JSON.parse(String(warmupMatch[1] || "").trim());
      pressCards = extractPressCardsFromWarmup(warmup);
    }
  } catch {
    // fallback to library only
  }

  if (!pressCards.length) {
    pressCards = items
      .map((item) => ({
        title: String(item?.title || "").trim(),
        href: String(item?.href || "").trim() || null,
        image: String(item?.thumbnailSourceUrl || item?.thumbnailLocal || item?.thumbnail || "").trim() || null,
        summary: String(item?.summary || "").trim() || null,
      }))
      .filter((item) => item.title && item.image);
  }

  const pressPayload = pressCards
    .slice(0, 24)
    .map((item, index) => {
      const rawImage = String(item.image || "").trim();
      const sourceUrl = toAbsoluteImageUrl(rawImage);
      const thumbnailLocal = rawImage.startsWith("/assets/")
        ? rawImage
        : sourceUrl
          ? resolveAsset(sourceUrl)
          : null;
      return {
        id: `press-${index + 1}`,
        title: item.title,
        href: item.href,
        summary: item.summary,
        thumbnailLocal: thumbnailLocal || null,
        sourceUrl: thumbnailLocal || null,
      };
    })
    .filter((item) => item.thumbnailLocal);

  await fs.mkdir(path.dirname(absOutPress), { recursive: true });
  await fs.writeFile(absOutPress, JSON.stringify({ items: pressPayload }, null, 2) + "\n", "utf8");
  console.log(`[sync-posts] wrote ${path.relative(process.cwd(), absOutPress)} items=${pressPayload.length}`);
}

main().catch((err) => {
  console.error("[sync-posts] failed:", err?.message || err);
  process.exit(1);
});
