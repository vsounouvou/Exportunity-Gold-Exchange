#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function extractScriptText(scriptEl) {
  const children = Array.isArray(scriptEl?.children) ? scriptEl.children : [];
  return children
    .map((c) => (c && typeof c.data === "string" ? c.data : ""))
    .join("")
    .trim();
}

function findNestedJsonWithPosts(root) {
  const seen = new Set();
  const queue = [root];
  let parsedStrings = 0;
  const PARSE_STRING_LIMIT = 2_000;

  const tryParse = (value) => {
    const s = String(value || "").trim();
    if (!s) return null;
    try {
      return JSON.parse(s);
    } catch {
      // Some Wix warmup payloads store JSON as a JSON-stringified string, so keys are escaped (e.g. \"posts\").
      const unescaped = s.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
      try {
        return JSON.parse(unescaped);
      } catch {
        return null;
      }
    }
  };

  while (queue.length) {
    const cur = queue.shift();
    if (!cur) continue;

    if (typeof cur === "string") {
      const s = cur.trim();
      if ((s.startsWith("{") || s.startsWith("[")) && parsedStrings < PARSE_STRING_LIMIT) {
        parsedStrings += 1;
        const parsed = tryParse(s);
        if (parsed && Array.isArray(parsed.posts) && Array.isArray(parsed.categories)) return parsed;
        if (parsed && (typeof parsed === "object" || Array.isArray(parsed))) queue.push(parsed);
      }
      continue;
    }

    if (typeof cur !== "object") continue;
    if (!Array.isArray(cur) && Array.isArray(cur.posts) && Array.isArray(cur.categories)) {
      return cur;
    }
    if (seen.has(cur)) continue;
    seen.add(cur);

    if (Array.isArray(cur)) {
      for (const item of cur) queue.push(item);
      continue;
    }

    for (const value of Object.values(cur)) {
      queue.push(value);
    }
  }

  return null;
}

function isPostCandidate(value) {
  if (!value || typeof value !== "object") return false;
  const title = value?.title;
  const url = value?.url;
  const link = value?.link;
  return typeof title === "string" && title.trim() && (typeof link === "string" || (url && typeof url === "object"));
}

function isCategoryCandidate(value) {
  if (!value || typeof value !== "object") return false;
  const label = value?.label;
  const id = value?.id;
  return typeof id === "string" && id.trim() && typeof label === "string" && label.trim();
}

function findArrayByItemPredicate(root, predicate) {
  const seen = new Set();
  const queue = [root];

  while (queue.length) {
    const cur = queue.shift();
    if (!cur) continue;

    if (Array.isArray(cur)) {
      if (cur.length && predicate(cur[0])) return cur;
      for (const item of cur) queue.push(item);
      continue;
    }

    if (typeof cur !== "object") continue;
    if (seen.has(cur)) continue;
    seen.add(cur);

    for (const value of Object.values(cur)) {
      queue.push(value);
    }
  }

  return null;
}

function findWarmupFeedString(root) {
  const seen = new Set();
  const stack = [root];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur) continue;
    if (typeof cur === "string") {
      const s = cur.trim();
      if (s.startsWith("{") && s.includes("posts") && s.includes("categories")) return s;
      continue;
    }
    if (typeof cur !== "object") continue;
    if (seen.has(cur)) continue;
    seen.add(cur);
    if (Array.isArray(cur)) stack.push(...cur);
    else stack.push(...Object.values(cur));
  }
  return null;
}

async function loadJsonIfExists(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function uniq(values) {
  const out = [];
  const seen = new Set();
  for (const v of values) {
    const s = String(v || "").trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function assetKeyScore(url) {
  const s = String(url || "").toLowerCase();
  const blurPenalty = s.includes("blur_") ? -1_000_000 : 0;
  let width = 0;
  const matches = s.match(/w_(\d+)/g) || [];
  for (const token of matches) {
    const n = Number.parseInt(token.replace(/^w_/, ""), 10);
    if (Number.isFinite(n) && n > width) width = n;
  }
  return blurPenalty + width;
}

function buildAssetBaseIndex(assetMap) {
  const bestByBase = new Map();
  for (const [remote, local] of Object.entries(assetMap || {})) {
    const key = String(remote || "").trim();
    const value = String(local || "").trim();
    if (!key || !value) continue;

    const base = key.split("/v1/")[0] || key;
    const candidate = { local: value, score: assetKeyScore(key) };
    const existing = bestByBase.get(base);
    if (!existing || candidate.score > existing.score) bestByBase.set(base, candidate);
  }
  return bestByBase;
}

async function main() {
  const mirrorPage = String(process.env.MIRROR_LIBRARY_PAGE || "mirror/www.exportunity.com/library/index.html").trim();
  const outPath = String(process.env.LIBRARY_OUT_PATH || "client/src/content/exportunity/library.json").trim();
  const assetMapPath = String(process.env.ASSET_MAP_PATH || "crawl/asset-map.json").trim();
  const timeoutMs = clampInt(process.env.LIBRARY_SYNC_TIMEOUT_MS, 2_000, 120_000, 30_000);
  const debug = process.env.SYNC_LIBRARY_DEBUG === "true";

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const html = await fs.readFile(path.resolve(process.cwd(), mirrorPage), "utf8");
    const warmupMatch = html.match(/<script[^>]*id="wix-warmup-data"[^>]*>([\s\S]*?)<\/script>/i);
    const warmupJson = warmupMatch ? String(warmupMatch[1] || "").trim() : "";
    if (!warmupJson) throw new Error("Missing wix-warmup-data script tag (library page)");
    if (!warmupJson) throw new Error("Empty wix-warmup-data payload");

    const warmupObj = JSON.parse(warmupJson);
    if (debug) {
      let stringsWithPosts = 0;
      let sample = null;
      const seen = new Set();
      const stack = [warmupObj];
      while (stack.length) {
        const cur = stack.pop();
        if (!cur) continue;
        if (typeof cur === "string") {
          if (cur.includes("posts") && cur.includes("categories")) {
            stringsWithPosts += 1;
            if (!sample) sample = cur.slice(0, 200);
          }
          continue;
        }
        if (typeof cur !== "object") continue;
        if (seen.has(cur)) continue;
        seen.add(cur);
        if (Array.isArray(cur)) stack.push(...cur);
        else stack.push(...Object.values(cur));
      }
      console.log(`[sync-library] debug stringsWithPostsAndCategories=${stringsWithPosts}`);
      if (sample) console.log(`[sync-library] debug sample=${sample}`);
    }
    const feedString = findWarmupFeedString(warmupObj);
    if (!feedString) throw new Error("Unable to locate library feed string in warmup payload");

    const tryParse = (value) => {
      const s = String(value || "").trim();
      if (!s) return null;
      try {
        return JSON.parse(s);
      } catch {
        const unescaped = s.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
        try {
          return JSON.parse(unescaped);
        } catch {
          return null;
        }
      }
    };

    const feedPayload = tryParse(feedString);
    if (!feedPayload) throw new Error("Unable to parse library feed JSON");

    const posts = findArrayByItemPredicate(feedPayload, isPostCandidate) || [];
    const categoriesRaw = findArrayByItemPredicate(feedPayload, isCategoryCandidate) || [];

    const assetMap = (await loadJsonIfExists(path.resolve(process.cwd(), assetMapPath))) || {};
    const assetBaseIndex = buildAssetBaseIndex(assetMap);
    const resolveAsset = (remoteUrl) => {
      const key = String(remoteUrl || "").trim();
      if (!key) return null;
      if (key.startsWith("/assets/")) return key;
      if (assetMap[key]) return String(assetMap[key]);
      const baseHit = assetBaseIndex.get(key);
      if (baseHit?.local) return String(baseHit.local);
      return null;
    };
    const categoriesById = new Map(
      (categoriesRaw || [])
        .map((c) => ({
          id: String(c?.id || ""),
          label: String(c?.label || c?.title || c?.slug || "").trim(),
        }))
        .filter((c) => c.id && c.label)
        .map((c) => [c.id, c.label]),
    );

    const items = (posts || [])
      .map((post) => {
        const id = String(post?.id || post?.internalId || "");
        const title = String(post?.title || "").trim();
        if (!id || !title) return null;

        const categoryId = Array.isArray(post?.categoryIds) ? String(post.categoryIds[0] || "") : "";
        const category = categoriesById.get(categoryId) || "Library";

        const remoteThumb = String(post?.media?.wixMedia?.image?.url || post?.owner?.image?.url || "").trim() || null;
        const thumbnailLocal = remoteThumb ? resolveAsset(remoteThumb) : null;
        const embedUrl =
          String(post?.media?.wixMedia?.video?.videoUrl || post?.media?.video?.url || post?.media?.video?.videoUrl || "").trim() || null;

        const href = String(post?.url?.path || post?.link || "").trim() || null;
        const summary = String(post?.excerpt || "").trim() || null;
        const minutes = Number(post?.minutesToRead);

        return {
          id,
          category,
          title,
          language: post?.language ? String(post.language) : null,
          duration: Number.isFinite(minutes) && minutes > 0 ? `${minutes} min read` : null,
          href,
          embedUrl,
          thumbnail: thumbnailLocal,
          thumbnailLocal,
          thumbnailSourceUrl: thumbnailLocal || null,
          summary,
        };
      })
      .filter(Boolean);

    const categories = uniq(items.map((i) => i.category));
    const payload = { categories, items };

    const absOut = path.resolve(process.cwd(), outPath);
    await fs.mkdir(path.dirname(absOut), { recursive: true });
    await fs.writeFile(absOut, JSON.stringify(payload, null, 2) + "\n", "utf8");
    console.log(`[sync-library] wrote ${path.relative(process.cwd(), absOut)} items=${items.length}`);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

main().catch((err) => {
  console.error("[sync-library] failed:", err?.message || err);
  process.exit(1);
});
