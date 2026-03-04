#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import pLimit from "p-limit";

const IMAGE_CT_RE = /^image\//i;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_REDIRECTS = 10;
const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "image/*,*/*;q=0.8",
  Referer: "https://www.exportunity.com/",
};

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function toBool(value) {
  const v = String(value || "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function sha256Buffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function mimeFromContentType(contentType) {
  return String(contentType || "").split(";")[0]?.trim().toLowerCase() || "";
}

function extFromContentType(contentType) {
  const mime = mimeFromContentType(contentType);
  if (!mime) return "";
  if (mime === "image/jpeg" || mime === "image/jpg" || mime === "image/pjpeg") return ".jpg";
  if (mime === "image/png") return ".png";
  if (mime === "image/webp") return ".webp";
  if (mime === "image/gif") return ".gif";
  if (mime === "image/svg+xml") return ".svg";
  if (mime === "image/avif") return ".avif";
  if (mime === "image/x-icon" || mime === "image/vnd.microsoft.icon") return ".ico";
  if (mime === "image/bmp") return ".bmp";
  if (mime === "image/tiff") return ".tif";
  return "";
}

function extFromUrl(url) {
  try {
    const u = new URL(String(url || "").trim());
    const base = path.posix.basename(u.pathname || "");
    const dot = base.lastIndexOf(".");
    if (dot <= 0) return "";
    const ext = base.slice(dot).toLowerCase();
    if (/^\.[a-z0-9]{2,6}$/.test(ext)) return ext;
    return "";
  } catch {
    return "";
  }
}

function inferExtFromBuffer(buffer) {
  if (!buffer || buffer.length < 12) return "";
  const b = buffer;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return ".jpg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return ".png";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return ".gif";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return ".webp";
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) {
    const brand = String.fromCharCode(b[8] || 0, b[9] || 0, b[10] || 0, b[11] || 0);
    if (brand.includes("avif")) return ".avif";
  }
  if (b[0] === 0x00 && b[1] === 0x00 && b[2] === 0x01 && b[3] === 0x00) return ".ico";
  const head = new TextDecoder("utf-8").decode(b.slice(0, 256)).trim().toLowerCase();
  if (head.startsWith("<?xml") || head.includes("<svg")) return ".svg";
  return "";
}

function isImageContentType(contentType) {
  return IMAGE_CT_RE.test(mimeFromContentType(contentType));
}

function deriveYouTubeFallbacks(url) {
  const out = [];
  try {
    const parsed = new URL(String(url || "").trim());
    const host = String(parsed.hostname || "").toLowerCase();
    if (!(host === "i.ytimg.com" || host.endsWith(".ytimg.com") || host === "img.youtube.com")) return out;

    const pathname = String(parsed.pathname || "");
    const m = pathname.match(/^\/vi\/([^/]+)\/maxresdefault\.(jpg|webp)$/i);
    if (!m) return out;

    const videoId = String(m[1] || "").trim();
    const ext = String(m[2] || "jpg").toLowerCase();
    if (!videoId) return out;

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

function buildCandidateUrls(entry) {
  if (!entry) return [];
  if (typeof entry === "string") return [entry];
  if (typeof entry !== "object") return [];
  const out = [];
  const push = (value) => {
    const s = String(value || "").trim();
    if (!s) return;
    if (!/^https?:\/\//i.test(s)) return;
    out.push(stripHash(s));
  };
  push(entry.url);
  if (Array.isArray(entry.candidates)) {
    for (const candidate of entry.candidates) push(candidate);
  }
  const snapshot = out.slice();
  for (const candidate of snapshot) {
    for (const fallback of deriveYouTubeFallbacks(candidate)) push(fallback);
  }
  const seen = new Set();
  const uniq = [];
  for (const item of out) {
    if (seen.has(item)) continue;
    seen.add(item);
    uniq.push(item);
  }
  return uniq;
}

function normalizeSourceRoute(entry) {
  const sources = Array.isArray(entry?.sources) ? entry.sources : [];
  const first = sources.find((s) => s && typeof s === "object" && s.route);
  return first ? String(first.route) : null;
}

function resolveExt({ contentType, finalUrl, originalUrl, buffer }) {
  const fromCt = extFromContentType(contentType);
  if (fromCt) return fromCt;
  const fromFinal = extFromUrl(finalUrl);
  if (fromFinal) return fromFinal;
  const fromOriginal = extFromUrl(originalUrl);
  if (fromOriginal) return fromOriginal;
  const fromBuffer = inferExtFromBuffer(buffer);
  if (fromBuffer) return fromBuffer;
  return ".img";
}

async function fetchWithRedirects(url, { timeoutMs }) {
  let current = stripHash(url);
  let redirects = 0;

  while (redirects <= MAX_REDIRECTS) {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const response = await fetch(current, {
        method: "GET",
        headers: DEFAULT_HEADERS,
        redirect: "manual",
        signal: controller?.signal,
      });

      const status = Number(response.status || 0);
      if (status >= 300 && status < 400) {
        const location = String(response.headers.get("location") || "").trim();
        if (!location) return { ok: false, status, error: "redirect_without_location", finalUrl: current };
        current = new URL(location, current).toString();
        redirects += 1;
        continue;
      }

      const contentType = String(response.headers.get("content-type") || "");
      const buffer = new Uint8Array(await response.arrayBuffer());
      return {
        ok: response.ok,
        status,
        contentType,
        buffer,
        finalUrl: current,
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  return { ok: false, status: 0, error: `too_many_redirects>${MAX_REDIRECTS}`, finalUrl: current };
}

async function fetchWithRetries(url, { timeoutMs, maxRetries, retryBaseMs }) {
  let last = null;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const result = await fetchWithRedirects(url, { timeoutMs });
      last = result;
      if (result.ok) return result;
      if (!RETRYABLE_STATUS.has(Number(result.status || 0)) || attempt === maxRetries) return result;
    } catch (error) {
      last = { ok: false, status: 0, error: error?.message || String(error), finalUrl: stripHash(url) };
      if (attempt === maxRetries) return last;
    }
    const waitMs = retryBaseMs * Math.pow(2, attempt);
    await sleep(waitMs);
  }
  return last || { ok: false, status: 0, error: "unknown_fetch_failure", finalUrl: stripHash(url) };
}

async function loadAssetEntries(crawlDir) {
  const deepPath = path.join(crawlDir, "assets-deep.json");
  const basicPath = path.join(crawlDir, "assets.json");

  try {
    const deep = JSON.parse(await fs.readFile(deepPath, "utf8"));
    if (Array.isArray(deep)) return { source: deepPath, entries: deep };
  } catch {
    // ignore
  }

  const basic = JSON.parse(await fs.readFile(basicPath, "utf8"));
  if (!Array.isArray(basic)) throw new Error("Invalid assets.json");
  return {
    source: basicPath,
    entries: basic.map((url) => ({ url: String(url || "").trim(), candidates: [], sources: [] })),
  };
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function main() {
  const repoRoot = process.cwd();
  const crawlDir = path.resolve(repoRoot, String(process.env.CRAWL_OUT_DIR || "crawl").trim());

  const outMapPath = path.join(crawlDir, "asset-map.json");
  const outHashIndexPath = path.join(crawlDir, "asset-hash-index.json");
  const outFailuresPath = path.join(crawlDir, "asset-failures.json");

  const assetPublicRoot = path.resolve(repoRoot, String(process.env.ASSET_PUBLIC_ROOT || "client/public/assets/exportunity").trim());
  const assetPublicPrefix = String(process.env.ASSET_PUBLIC_PREFIX || "/assets/exportunity").trim().replace(/\/+$/, "");

  const max = clampInt(process.env.ASSET_FETCH_MAX, 1, 300_000, 50_000);
  const timeoutMs = clampInt(process.env.ASSET_FETCH_TIMEOUT_MS, 2_000, 180_000, 35_000);
  const concurrency = clampInt(process.env.ASSET_FETCH_CONCURRENCY, 1, 64, 10);
  const retries = clampInt(process.env.ASSET_FETCH_RETRIES, 0, 8, 3);
  const retryBaseMs = clampInt(process.env.ASSET_FETCH_RETRY_BASE_MS, 50, 10_000, 350);
  const allowEmpty = toBool(process.env.ASSET_FETCH_ALLOW_EMPTY);

  const { source: sourcePath, entries: rawEntries } = await loadAssetEntries(crawlDir);
  const entries = rawEntries.slice(0, max);

  if (!allowEmpty && entries.length === 0) {
    throw new Error(`No assets to fetch from ${sourcePath}`);
  }

  await fs.mkdir(crawlDir, { recursive: true });
  await fs.mkdir(assetPublicRoot, { recursive: true });

  const mapping = {};
  const hashIndex = {};
  const failures = [];

  const registerMapping = (remoteUrl, localPath) => {
    const key = stripHash(String(remoteUrl || "").trim());
    if (!key) return;
    mapping[key] = localPath;
    const keyNoQuery = stripQueryAndHash(key);
    if (keyNoQuery && !mapping[keyNoQuery]) mapping[keyNoQuery] = localPath;
  };

  const limit = pLimit(concurrency);
  const jobs = entries.map((entry, index) =>
    limit(async () => {
      const candidates = buildCandidateUrls(entry);
      if (!candidates.length) {
        failures.push({
          remote_url: null,
          reason: "no_candidate_urls",
          status: 0,
          source_route: normalizeSourceRoute(entry),
          index,
        });
        return;
      }

      const sourceRoute = normalizeSourceRoute(entry);
      const remotePrimary = stripHash(String((typeof entry === "object" && entry?.url) || candidates[0] || "").trim());

      for (const candidate of candidates) {
        if (mapping[candidate]) {
          if (remotePrimary && !mapping[remotePrimary]) mapping[remotePrimary] = mapping[candidate];
          return;
        }
      }

      let bestFailure = null;
      for (const candidate of candidates) {
        const fetched = await fetchWithRetries(candidate, { timeoutMs, maxRetries: retries, retryBaseMs });
        if (!fetched?.ok) {
          bestFailure = {
            remote_url: remotePrimary || candidate,
            candidate_url: candidate,
            reason: fetched?.error || "http_error",
            status: Number(fetched?.status || 0),
            source_route: sourceRoute,
          };
          continue;
        }

        const contentType = String(fetched.contentType || "");
        if (!isImageContentType(contentType)) {
          bestFailure = {
            remote_url: remotePrimary || candidate,
            candidate_url: candidate,
            reason: `non_image_content_type:${mimeFromContentType(contentType) || "unknown"}`,
            status: Number(fetched.status || 0),
            source_route: sourceRoute,
          };
          continue;
        }

        const hash = sha256Buffer(fetched.buffer);
        const ext = resolveExt({
          contentType,
          finalUrl: fetched.finalUrl,
          originalUrl: candidate,
          buffer: fetched.buffer,
        });
        const filename = `${hash}${ext}`;
        const diskPath = path.join(assetPublicRoot, filename);
        const localPath = `${assetPublicPrefix}/${filename}`;

        try {
          await fs.access(diskPath);
        } catch {
          await fs.writeFile(diskPath, fetched.buffer);
        }

        hashIndex[hash] = {
          local_path: localPath,
          size: Number(fetched.buffer.byteLength || 0),
          content_type: mimeFromContentType(contentType),
        };

        registerMapping(candidate, localPath);
        registerMapping(fetched.finalUrl, localPath);
        for (const candidateUrl of candidates) registerMapping(candidateUrl, localPath);
        if (remotePrimary) registerMapping(remotePrimary, localPath);
        return;
      }

      failures.push(
        bestFailure || {
          remote_url: remotePrimary || candidates[0] || null,
          candidate_url: candidates[0] || null,
          reason: "all_candidates_failed",
          status: 0,
          source_route: sourceRoute,
        },
      );
    }),
  );

  await Promise.all(jobs);

  const mappedCount = Object.keys(mapping).length;
  if (!allowEmpty && mappedCount === 0) {
    throw new Error("Fetched 0 assets. Check network connectivity and source URLs.");
  }

  await fs.writeFile(outMapPath, JSON.stringify(mapping, null, 2) + "\n", "utf8");
  await fs.writeFile(outHashIndexPath, JSON.stringify(hashIndex, null, 2) + "\n", "utf8");
  await fs.writeFile(outFailuresPath, JSON.stringify(failures, null, 2) + "\n", "utf8");

  console.log(
    `[fetch-assets] ok source=${path.relative(repoRoot, sourcePath)} mapped=${mappedCount} unique=${Object.keys(hashIndex).length} failures=${failures.length}`,
  );
}

main().catch((err) => {
  console.error("[fetch-assets] failed:", err?.message || err);
  process.exit(1);
});
