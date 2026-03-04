#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

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

function toAbsoluteImageUrl(item) {
  const mediaUrl = String(item?.mediaUrl || "").trim();
  const fromMetaName = String(item?.metaData?.name || "").trim();
  const poster = String(item?.metaData?.posters?.[0]?.url || "").trim();
  const maybeVideoId = String(item?.metaData?.videoId || "").trim();

  const candidate = mediaUrl || fromMetaName || poster;
  if (!candidate) return null;
  if (/^https?:\/\//i.test(candidate)) return candidate;
  if (candidate.startsWith("//")) return `https:${candidate}`;

  if (candidate === "maxresdefault.jpg" && maybeVideoId) {
    return `https://i.ytimg.com/vi/${encodeURIComponent(maybeVideoId)}/maxresdefault.jpg`;
  }

  if (extractWixToken(candidate)) {
    return `https://static.wixstatic.com/media/${candidate}`;
  }

  return null;
}

function normalizeAlt(item, index) {
  const raw =
    String(item?.metaData?.alt || "").trim() ||
    String(item?.metaData?.title || "").trim() ||
    String(item?.metaData?.description || "").trim();
  const cleaned = raw.replace(/\s+/g, " ").trim();
  if (cleaned) return cleaned;
  return `Exportunity gallery image ${index + 1}`;
}

function findGalleryArray(root) {
  const seen = new Set();
  const queue = [root];
  let best = [];
  let bestScore = 0;

  while (queue.length) {
    const current = queue.shift();
    if (!current) continue;

    if (Array.isArray(current)) {
      const score = current.reduce((acc, item) => {
        if (!item || typeof item !== "object") return acc;
        return acc + (item.mediaUrl || item?.metaData?.name || item?.metaData?.posters?.length ? 1 : 0);
      }, 0);
      if (score > bestScore) {
        best = current;
        bestScore = score;
      }
      for (const item of current) queue.push(item);
      continue;
    }

    if (typeof current !== "object") continue;
    if (seen.has(current)) continue;
    seen.add(current);

    for (const value of Object.values(current)) queue.push(value);
  }

  return bestScore > 0 ? best : [];
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
    const hit = direct.get(value) || direct.get(stripQueryAndHash(value)) || direct.get(decodeMaybe(value));
    if (hit) return String(hit);
    const token = extractWixToken(value);
    if (token && byToken.has(token)) return String(byToken.get(token));
    return null;
  };
}

function mimeToExt(contentType) {
  const mime = String(contentType || "").split(";")[0]?.trim().toLowerCase() || "";
  if (mime === "image/jpeg" || mime === "image/jpg" || mime === "image/pjpeg") return ".jpg";
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  if (mime === "image/gif") return ".gif";
  if (mime === "image/svg+xml") return ".svg";
  if (mime === "image/avif") return ".avif";
  if (mime === "image/x-icon" || mime === "image/vnd.microsoft.icon") return ".ico";
  return "";
}

function deriveYouTubeFallbacks(url) {
  const out = [];
  try {
    const parsed = new URL(String(url || "").trim());
    const host = String(parsed.hostname || "").toLowerCase();
    if (!(host === "i.ytimg.com" || host.endsWith(".ytimg.com") || host === "img.youtube.com")) return out;
    const m = String(parsed.pathname || "").match(/^\/vi\/([^/]+)\/maxresdefault\.(jpg|webp)$/i);
    if (!m) return out;
    const videoId = String(m[1] || "").trim();
    const ext = String(m[2] || "jpg").toLowerCase();
    const base = `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}`;
    const exts = Array.from(new Set([ext, "jpg", "webp"]));
    for (const variantExt of exts) {
      out.push(`${base}/hqdefault.${variantExt}`);
      out.push(`${base}/sddefault.${variantExt}`);
      out.push(`${base}/mqdefault.${variantExt}`);
      out.push(`${base}/default.${variantExt}`);
    }
  } catch {
    // ignore
  }
  return out;
}

async function downloadImageToLocal({ sourceUrl, assetRoot, assetPrefix }) {
  const url = String(sourceUrl || "").trim();
  if (!/^https?:\/\//i.test(url)) return null;
  const candidates = [url, ...deriveYouTubeFallbacks(url)];

  for (const candidateUrl of candidates) {
    const response = await fetch(candidateUrl, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "image/*,*/*;q=0.8",
        Referer: "https://www.exportunity.com/",
      },
      redirect: "follow",
    });
    if (!response.ok) continue;
    const contentType = String(response.headers.get("content-type") || "").toLowerCase();
    if (!contentType.startsWith("image/")) continue;
    const buffer = new Uint8Array(await response.arrayBuffer());
    const hash = crypto.createHash("sha256").update(buffer).digest("hex");
    const ext = mimeToExt(contentType) || ".img";
    const filename = `${hash}${ext}`;
    const diskPath = path.join(assetRoot, filename);
    const localPath = `${assetPrefix}/${filename}`;
    try {
      await fs.access(diskPath);
    } catch {
      await fs.mkdir(assetRoot, { recursive: true });
      await fs.writeFile(diskPath, buffer);
    }
    return localPath;
  }

  return null;
}

async function main() {
  const repoRoot = process.cwd();
  const mirrorPath = path.resolve(repoRoot, String(process.env.MIRROR_ABOUT_PAGE || "mirror/www.exportunity.com/about/index.html").trim());
  const assetMapPath = path.resolve(repoRoot, String(process.env.ASSET_MAP_PATH || "crawl/asset-map.json").trim());
  const outRootPath = path.resolve(repoRoot, String(process.env.ABOUT_GALLERY_OUT || "content/about/gallery.json").trim());
  const outClientPath = path.resolve(
    repoRoot,
    String(process.env.ABOUT_GALLERY_CLIENT_OUT || "client/src/content/exportunity/about/gallery.json").trim(),
  );
  const assetPublicRoot = path.resolve(
    repoRoot,
    String(process.env.ASSET_PUBLIC_ROOT || "client/public/assets/exportunity").trim(),
  );
  const assetPublicPrefix = String(process.env.ASSET_PUBLIC_PREFIX || "/assets/exportunity").trim().replace(/\/+$/, "");

  const html = await fs.readFile(mirrorPath, "utf8");
  const warmupMatch = html.match(/<script[^>]*id="wix-warmup-data"[^>]*>([\s\S]*?)<\/script>/i);
  if (!warmupMatch) throw new Error("Missing wix-warmup-data in about mirror");

  const warmupRaw = String(warmupMatch[1] || "").trim();
  if (!warmupRaw) throw new Error("Empty wix-warmup-data in about mirror");

  const warmupObj = JSON.parse(warmupRaw);
  const galleryItems = findGalleryArray(warmupObj);
  if (!galleryItems.length) throw new Error("No gallery items found in about warmup payload");

  const assetMap = JSON.parse(await fs.readFile(assetMapPath, "utf8"));
  const resolveLocal = buildAssetResolver(assetMap);

  const payload = [];
  let unresolved = 0;
  for (let index = 0; index < galleryItems.length; index += 1) {
    const item = galleryItems[index];
    if (!item || typeof item !== "object") continue;
    const sourceUrl = toAbsoluteImageUrl(item);
    if (!sourceUrl) continue;
    let srcLocal = resolveLocal(sourceUrl);
    if (!srcLocal) {
      srcLocal = await downloadImageToLocal({
        sourceUrl,
        assetRoot: assetPublicRoot,
        assetPrefix: assetPublicPrefix,
      });
      if (srcLocal) {
        assetMap[sourceUrl] = srcLocal;
      } else {
        unresolved += 1;
      }
    }
    payload.push({
      srcLocal: srcLocal || null,
      alt: normalizeAlt(item, index),
      order: index + 1,
      sourceUrl: srcLocal || null,
    });
  }

  const resolvedPayload = payload
    .filter((item) => item.srcLocal)
    .sort((a, b) => a.order - b.order)
    .map((item) => ({
      srcLocal: item.srcLocal,
      alt: item.alt,
      order: item.order,
      sourceUrl: item.srcLocal,
    }));
  const clientPayload = resolvedPayload;

  await fs.mkdir(path.dirname(outRootPath), { recursive: true });
  await fs.mkdir(path.dirname(outClientPath), { recursive: true });
  await fs.mkdir(path.dirname(assetMapPath), { recursive: true });
  await fs.writeFile(assetMapPath, JSON.stringify(assetMap, null, 2) + "\n", "utf8");
  await fs.writeFile(outRootPath, JSON.stringify(resolvedPayload, null, 2) + "\n", "utf8");
  await fs.writeFile(outClientPath, JSON.stringify(clientPayload, null, 2) + "\n", "utf8");

  console.log(
    `[sync-gallery] wrote count=${resolvedPayload.length} unresolved=${unresolved} client_count=${clientPayload.length} root=${path.relative(repoRoot, outRootPath)} client=${path.relative(repoRoot, outClientPath)}`,
  );
}

main().catch((error) => {
  console.error("[sync-gallery] failed:", error?.message || error);
  process.exit(1);
});
