#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";

const BANNED_TOKENS = ["wixstatic", "wiximage", "static.wixstatic", "rayon.world"];
const IMAGE_EXT_RE = /\.(?:png|jpe?g|gif|webp|svg|ico|avif|bmp|tiff?)(?:$|[?#])/i;
const HTTP_URL_RE = /https?:\/\/[^\s"'`<>()\\]+/gi;
const ESCAPED_HTTP_RE = /https?:\\\/\\\/[a-z0-9._~:/?#\[\]@!$&'()*+,;=%-]+/gi;
const CSS_URL_RE = /url\(([^)]+)\)/gi;

const OWN_IMAGE_HOSTS = new Set([
  "exportunity.com",
  "www.exportunity.com",
  "exportunity.net",
  "www.exportunity.net",
  "clone.exportunity.net",
  "www.clone.exportunity.net",
  "localhost",
  "127.0.0.1",
]);

const TEXT_EXT = new Set([".html", ".htm", ".css", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".json", ".md", ".txt"]);

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function normalizeEscaped(value) {
  return String(value || "").replace(/\\\//g, "/");
}

function stripHashAndQuery(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.split("#")[0]?.split("?")[0] || "";
}

function isImageLikeUrl(url) {
  const value = String(url || "").toLowerCase();
  if (!value) return false;
  if (IMAGE_EXT_RE.test(value)) return true;
  if (value.includes("/media/")) return true;
  if (value.includes("i.ytimg.com/vi/")) return true;
  return false;
}

function isAllowedImageHost(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return OWN_IMAGE_HOSTS.has(host);
  } catch {
    return false;
  }
}

function resolveLocalCandidates({ filePath, rawRef, publicRoots }) {
  const ref = stripHashAndQuery(String(rawRef || "").trim());
  if (!ref) return [];
  if (ref.startsWith("data:")) return [];
  if (ref.startsWith("mailto:") || ref.startsWith("tel:") || ref.startsWith("javascript:")) return [];
  if (ref.startsWith("http://") || ref.startsWith("https://") || ref.startsWith("//")) return [];

  if (ref.startsWith("/")) {
    const rel = ref.replace(/^\/+/, "");
    return publicRoots.map((root) => path.resolve(root, rel));
  }

  return [path.resolve(path.dirname(filePath), ref)];
}

async function collectFiles(rootDir) {
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
      if (TEXT_EXT.has(ext)) out.push(full);
    }
  }
  return out;
}

function extractRefsFromText(text) {
  const refs = [];
  const input = String(text || "");

  const attrRe = /\b(?:src|href|poster|content)\s*=\s*["']([^"']+)["']/gi;
  let match;
  while ((match = attrRe.exec(input))) {
    refs.push(String(match[1] || "").trim());
  }

  const srcsetRe = /\bsrcset\s*=\s*["']([^"']+)["']/gi;
  while ((match = srcsetRe.exec(input))) {
    const srcset = String(match[1] || "");
    for (const part of srcset.split(",")) {
      const candidate = String(part || "").trim().split(/\s+/)[0];
      if (candidate) refs.push(candidate);
    }
  }

  while ((match = CSS_URL_RE.exec(input))) {
    const candidate = String(match[1] || "").trim().replace(/^['"]|['"]$/g, "");
    if (candidate) refs.push(candidate);
  }

  return refs;
}

function extractRemoteUrls(text) {
  const out = [];
  for (const match of String(text || "").matchAll(HTTP_URL_RE)) out.push(String(match[0] || "").trim());
  for (const match of String(text || "").matchAll(ESCAPED_HTTP_RE)) out.push(normalizeEscaped(String(match[0] || "").trim()));
  return out;
}

async function main() {
  const repoRoot = process.cwd();
  const clientPublicRoot = path.resolve(repoRoot, "client", "public");
  const distPublicRoot = path.resolve(repoRoot, "dist", "public");

  const targetRoots = [
    path.resolve(repoRoot, "client", "public", "exportunity"),
    path.resolve(repoRoot, "client", "src", "content", "exportunity"),
    path.resolve(repoRoot, "content", "about"),
    path.resolve(repoRoot, "content", "marketing"),
    path.resolve(repoRoot, "client", "src", "pages", "exportunity"),
    path.resolve(repoRoot, "client", "src", "components", "exportunity"),
    path.resolve(repoRoot, "server", "lib", "seo"),
  ];
  if (await pathExists(path.resolve(repoRoot, "dist", "public", "exportunity"))) {
    targetRoots.push(path.resolve(repoRoot, "dist", "public", "exportunity"));
  }

  const publicRoots = [clientPublicRoot];
  if (await pathExists(distPublicRoot)) publicRoots.unshift(distPublicRoot);

  const remoteIssues = [];
  const tokenIssues = [];
  const missingIssues = [];
  const checkedMissing = new Set();

  for (const rootDir of targetRoots) {
    const files = await collectFiles(rootDir);
    for (const filePath of files) {
      let text = "";
      try {
        text = await fs.readFile(filePath, "utf8");
      } catch {
        continue;
      }

      const lower = text.toLowerCase();
      for (const token of BANNED_TOKENS) {
        if (lower.includes(token)) tokenIssues.push({ file: filePath, token });
      }

      for (const remoteUrl of extractRemoteUrls(text)) {
        if (remoteUrl.includes("${")) continue;
        if (!isImageLikeUrl(remoteUrl)) continue;
        if (!isAllowedImageHost(remoteUrl)) {
          remoteIssues.push({ file: filePath, url: remoteUrl, kind: "remote-image" });
        }
      }

      const refs = extractRefsFromText(text);
      for (const ref of refs) {
        if (ref.startsWith("http://") || ref.startsWith("https://") || ref.startsWith("//")) continue;
        if (!isImageLikeUrl(ref)) continue;
        const candidates = resolveLocalCandidates({ filePath, rawRef: ref, publicRoots });
        if (!candidates.length) continue;
        const key = candidates.map((candidate) => path.normalize(candidate)).join("|");
        if (checkedMissing.has(key)) continue;
        checkedMissing.add(key);

        let exists = false;
        for (const candidate of candidates) {
          if (await pathExists(candidate)) {
            exists = true;
            break;
          }
        }
        if (!exists) {
          missingIssues.push({
            file: filePath,
            ref,
            resolved: candidates[0],
          });
        }
      }
    }
  }

  const remoteCount = remoteIssues.length + tokenIssues.length;
  const missingCount = missingIssues.length;

  if (remoteCount === 0 && missingCount === 0) {
    console.log("[assets:verify] ok remote_assets_found=0 missing_assets=0");
    return;
  }

  console.error(`[assets:verify] FAILED remote_assets_found=${remoteCount} missing_assets=${missingCount}`);

  for (const issue of tokenIssues.slice(0, 40)) {
    console.error(`- blocked-token ${path.relative(repoRoot, issue.file)} token=${issue.token}`);
  }
  if (tokenIssues.length > 40) {
    console.error(`- ... ${tokenIssues.length - 40} more blocked-token issues`);
  }

  for (const issue of remoteIssues.slice(0, 40)) {
    console.error(`- remote-image ${path.relative(repoRoot, issue.file)} ${issue.url}`);
  }
  if (remoteIssues.length > 40) {
    console.error(`- ... ${remoteIssues.length - 40} more remote-image issues`);
  }

  for (const issue of missingIssues.slice(0, 40)) {
    console.error(
      `- missing-asset ${path.relative(repoRoot, issue.file)} ref=${issue.ref} resolved=${path.relative(repoRoot, issue.resolved)}`,
    );
  }
  if (missingIssues.length > 40) {
    console.error(`- ... ${missingIssues.length - 40} more missing-asset issues`);
  }

  process.exit(1);
}

main().catch((error) => {
  console.error("[assets:verify] failed:", error?.message || error);
  process.exit(1);
});
