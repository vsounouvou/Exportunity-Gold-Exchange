import fs from "fs";
import path from "path";
import crypto from "crypto";
import { execFileSync, execSync } from "child_process";

const repoRoot = process.cwd();

const DIST_PUBLIC = process.env.DIST_PUBLIC || path.join(repoRoot, "dist", "public");
const APP_NAME =
  process.env.APP_NAME ||
  process.env.APP ||
  process.env.DEPLOY_TENANT ||
  process.env.TENANT_DEFAULT ||
  "";

const EXPORTUNITY_SURFACE_REVISION = 6;
const EXPORTUNITY_HOMEPAGE_SOURCE_SHA256 =
  "7da9d4f50c91eefc2770d91aa71d92e8d08fb0ffa503fc30cc9224dfd05016f7";

function readJsonFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function sanitizeId(value) {
  return String(value).replace(/[^A-Za-z0-9._-]+/g, "-");
}

function resolveServiceWorkerTenant(appName) {
  const normalized = sanitizeId(appName || "platform").toLowerCase() || "platform";
  return normalized === "boursedelor" ? "bdo" : normalized;
}

function normalizeGitSha(raw) {
  if (raw == null) return null;
  const value = String(raw).trim();
  if (!value) return null;
  if (!/^[0-9a-f]{7,40}$/i.test(value)) return null;
  return value.slice(0, 12);
}

function parseBooleanFlag(raw) {
  const value = String(raw ?? "").trim().toLowerCase();
  if (!value) return null;
  if (["1", "true", "yes", "y", "on"].includes(value)) return true;
  if (["0", "false", "no", "n", "off"].includes(value)) return false;
  return null;
}

function isGitDirty(repoRootDir) {
  const envDirty = parseBooleanFlag(process.env.GIT_DIRTY);
  if (envDirty !== null) return envDirty;

  try {
    const output = execFileSync(
      "git",
      [
        "status",
        "--porcelain",
        "--untracked-files=all",
        "--",
        ".",
        ":(exclude)ops/local-releases",
        ":(exclude)ops/local-backups",
        ":(exclude)ops/tmp",
        ":(exclude)artifacts",
        ":(exclude)client/src/navigation/routes.generated.ts",
      ],
      { cwd: repoRootDir, stdio: ["ignore", "pipe", "ignore"] },
    )
      .toString()
      .trim();
    return output.length > 0;
  } catch {
    return false;
  }
}

function readGitShaFromEnvOrGit(repoRootDir) {
  const envSha =
    process.env.GIT_SHA ||
    process.env.RENDER_GIT_COMMIT ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.COMMIT_SHA ||
    null;
  const normalizedEnv = normalizeGitSha(envSha);
  if (normalizedEnv) return normalizedEnv;

  try {
    const sha = execSync("git rev-parse --short=12 HEAD", { cwd: repoRootDir, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
    const normalized = normalizeGitSha(sha);
    if (normalized) return normalized;
  } catch {
    // ignore
  }

  try {
    const headPath = path.join(repoRootDir, ".git", "HEAD");
    const head = fs.readFileSync(headPath, "utf8").trim();
    if (head.startsWith("ref:")) {
      const ref = head.replace(/^ref:\s+/, "").trim();
      const refPath = path.join(repoRootDir, ".git", ref);
      const sha = fs.readFileSync(refPath, "utf8").trim();
      return normalizeGitSha(sha);
    }
    return normalizeGitSha(head);
  } catch {
    return null;
  }
}

function resolveBuildInfo(repoRootDir) {
  const builtAt = new Date().toISOString();
  const meta = readJsonFile(path.join(repoRootDir, ".build-meta.json"));

  const gitSha =
    sanitizeId(
      normalizeGitSha(process.env.GIT_SHA) ||
        normalizeGitSha(readGitShaFromEnvOrGit(repoRootDir)) ||
        normalizeGitSha(meta?.gitSha) ||
        "",
    ) || "unknown";

  const envBuild =
    process.env.BUILD_ID ||
    process.env.DEPLOYMENT_ID ||
    process.env.RENDER_INSTANCE_ID ||
    null;

  const buildId = sanitizeId(envBuild ? String(envBuild) : String(Date.now()));
  const gitDirty = isGitDirty(repoRootDir);
  const sourceVersion =
    sanitizeId(process.env.SOURCE_VERSION || `${gitSha}${gitDirty ? "-dirty" : ""}`) || gitSha;

  // Persist build identity for downstream tooling (deploy scripts, server diagnostics).
  try {
    fs.writeFileSync(
      path.join(repoRootDir, ".build-meta.json"),
      JSON.stringify({ gitSha, buildId, gitDirty, sourceVersion }, null, 0),
      "utf8",
    );
  } catch {
    // ignore
  }

  return { buildId, builtAt, gitSha, gitDirty, sourceVersion };
}

function updateSwVersion(swPath, buildId, appName) {
  if (!fs.existsSync(swPath)) return;
  const text = fs.readFileSync(swPath, "utf8");
  const tenant = resolveServiceWorkerTenant(appName);
  let updated = text.replace(
    /const\s+TENANT\s*=\s*["'][^"']*["']/,
    `const TENANT = "${tenant}"`,
  );
  const suffixMatch = updated.match(/const\s+BUILD_SUFFIX\s*=\s*["']([^"']+)["']/);
  if (suffixMatch) {
    updated = updated.replace(suffixMatch[0], `const BUILD_SUFFIX = "${buildId}"`);
    fs.writeFileSync(swPath, updated, "utf8");
    return;
  }
  const match = updated.match(/const\s+VERSION\s*=\s*["']([^"']+)["']/);
  if (!match) return;
  const base = match[1].replace(/-build-[A-Za-z0-9._-]+$/, "");
  const next = `${base}-build-${buildId}`;
  updated = updated.replace(match[0], `const VERSION = "${next}"`);
  fs.writeFileSync(swPath, updated, "utf8");
}

function updateConfig(configPath, build) {
  let content = "";
  if (fs.existsSync(configPath)) {
    content = fs.readFileSync(configPath, "utf8");
  } else {
    content = "window.__EXPORTUNITY_CONFIG__ = window.__EXPORTUNITY_CONFIG__ || {};\n";
  }

  const block = [
    "",
    "window.__EXPORTUNITY_CONFIG__ = window.__EXPORTUNITY_CONFIG__ || {};",
    ...(APP_NAME ? [`window.__EXPORTUNITY_CONFIG__.app = "${sanitizeId(APP_NAME)}";`] : []),
    `window.__EXPORTUNITY_CONFIG__.buildId = "${build.buildId}";`,
    `window.__BUILD_ID__ = "${build.buildId}";`,
    `window.__EXPORTUNITY_CONFIG__.builtAt = "${build.builtAt}";`,
    `window.__EXPORTUNITY_CONFIG__.gitSha = "${build.gitSha}";`,
    `window.__EXPORTUNITY_CONFIG__.gitDirty = "${String(build.gitDirty)}";`,
    `window.__EXPORTUNITY_CONFIG__.sourceVersion = "${build.sourceVersion}";`,
    `window.__EXPORTUNITY_CONFIG__.versionGuardEnabled = "${String(process.env.VERSION_GUARD_ENABLED || "true")}";`,
    "",
  ].join("\n");

  content = `${content.trim()}\n${block}`;
  fs.writeFileSync(configPath, content, "utf8");
}

function parseAssetPath(html, ext) {
  const re = new RegExp(`(?:\\.\\/|\\/)?assets\\/[^"']+\\.${ext}`, "i");
  const match = html.match(re);
  if (!match) return null;
  return match[0].replace(/^\//, "").replace(/^\.\//, "");
}

function statOrNull(publicDir, relPath) {
  if (!relPath) return null;
  const full = path.join(publicDir, relPath);
  if (!fs.existsSync(full)) return { path: relPath, size: null, mtime: null };
  const stat = fs.statSync(full);
  return { path: relPath, size: stat.size, mtime: stat.mtime.toISOString() };
}

function readPublicSurface(publicDir) {
  const markerPath = path.join(publicDir, "exportunity-surface.json");
  const marker = readJsonFile(markerPath);

  if (APP_NAME === "exportunity") {
    if (
      marker?.schemaVersion !== 2 ||
      marker?.surfaceRevision !== EXPORTUNITY_SURFACE_REVISION ||
      marker?.canonicalSurface !== "global-trade-network" ||
      marker?.homepageComponent !== "MarketplacePage" ||
      marker?.homepageSourceSha256 !== EXPORTUNITY_HOMEPAGE_SOURCE_SHA256 ||
      marker?.legacyHomepageRetired !== true
    ) {
      throw new Error(
        `[stamp-build] refusing to stamp Exportunity without the canonical proximity-marketplace marker: ${markerPath}`,
      );
    }

    const homepagePath = path.join(
      repoRoot,
      "client",
      "src",
      "pages",
      "exportunity",
      "MarketplacePage.tsx",
    );
    const homepageSourceSha256 = crypto
      .createHash("sha256")
      .update(fs.readFileSync(homepagePath))
      .digest("hex");
    if (homepageSourceSha256 !== EXPORTUNITY_HOMEPAGE_SOURCE_SHA256) {
      throw new Error(
        `[stamp-build] refusing to stamp an unreviewed Exportunity homepage source: ${homepageSourceSha256}`,
      );
    }
  }

  return marker;
}

function writeBuildJson(publicDir, build) {
  const indexPath = path.join(publicDir, "index.html");
  const indexHtml = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, "utf8") : "";
  const mainJs = parseAssetPath(indexHtml, "js");
  const mainCss = parseAssetPath(indexHtml, "css");

  const swPath = path.join(publicDir, "sw.js");
  const swText = fs.existsSync(swPath) ? fs.readFileSync(swPath, "utf8") : "";
  const swVersionMatch = swText.match(/const\s+VERSION\s*=\s*["']([^"']+)["']/);
  const swBuildSuffixMatch = swText.match(/const\s+BUILD_SUFFIX\s*=\s*["']([^"']+)["']/);
  const swAppPrefix = resolveServiceWorkerTenant(APP_NAME);
  const publicSurface = readPublicSurface(publicDir);

  const payload = {
    app: APP_NAME ? sanitizeId(APP_NAME) : null,
    build: build.buildId,
    buildId: build.buildId,
    gitSha: build.gitSha,
    gitDirty: build.gitDirty,
    sourceVersion: build.sourceVersion,
    builtAt: build.builtAt,
    // Backward-compatible aliases (older diagnostics pages used buildTime).
    buildTime: build.builtAt,
    mainJs: statOrNull(publicDir, mainJs),
    mainCss: statOrNull(publicDir, mainCss),
    sw: swVersionMatch?.[1] ?? (swBuildSuffixMatch ? `${swAppPrefix}-sw-v1-build-${swBuildSuffixMatch[1]}` : null),
    publicSurface: publicSurface?.canonicalSurface ?? null,
    publicSurfaceRevision: publicSurface?.surfaceRevision ?? null,
    homepageComponent: publicSurface?.homepageComponent ?? null,
    homepageSourceSha256: publicSurface?.homepageSourceSha256 ?? null,
    legacyHomepageRetired: publicSurface?.legacyHomepageRetired === true,
  };

  fs.writeFileSync(path.join(publicDir, "build.json"), JSON.stringify(payload, null, 2), "utf8");
  return payload;
}

function main() {
  if (!fs.existsSync(DIST_PUBLIC)) {
    console.error(`[stamp-build] dist public directory not found: ${DIST_PUBLIC}`);
    process.exit(1);
  }

  const build = resolveBuildInfo(repoRoot);
  updateSwVersion(path.join(DIST_PUBLIC, "sw.js"), build.buildId, APP_NAME);
  updateConfig(path.join(DIST_PUBLIC, "config.js"), build);
  const stamped = writeBuildJson(DIST_PUBLIC, build);

  console.log("[stamp-build] Stamped build:", stamped);
}

main();
