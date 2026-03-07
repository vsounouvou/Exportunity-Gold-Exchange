import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const repoRoot = process.cwd();

const DIST_PUBLIC = process.env.DIST_PUBLIC || path.join(repoRoot, "dist", "public");
const APP_NAME = process.env.APP_NAME || process.env.APP || "boursedelor";

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

function normalizeGitSha(raw) {
  if (raw == null) return null;
  const value = String(raw).trim();
  if (!value) return null;
  if (!/^[0-9a-f]{7,40}$/i.test(value)) return null;
  return value.slice(0, 12);
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
        normalizeGitSha(meta?.gitSha) ||
        normalizeGitSha(readGitShaFromEnvOrGit(repoRootDir)) ||
        "",
    ) || "unknown";

  const envBuild =
    process.env.BUILD_ID ||
    process.env.DEPLOYMENT_ID ||
    process.env.RENDER_INSTANCE_ID ||
    null;

  const buildId = sanitizeId(envBuild ? String(envBuild) : String(Date.now()));

  // Persist build identity for downstream tooling (deploy scripts, server diagnostics).
  try {
    fs.writeFileSync(
      path.join(repoRootDir, ".build-meta.json"),
      JSON.stringify({ gitSha, buildId }, null, 0),
      "utf8",
    );
  } catch {
    // ignore
  }

  return { buildId, builtAt, gitSha };
}

function updateSwVersion(swPath, buildId) {
  if (!fs.existsSync(swPath)) return;
  const text = fs.readFileSync(swPath, "utf8");
  const match = text.match(/const\s+VERSION\s*=\s*["']([^"']+)["']/);
  if (!match) return;
  const base = match[1].replace(/-build-[A-Za-z0-9._-]+$/, "");
  const next = `${base}-build-${buildId}`;
  const updated = text.replace(match[0], `const VERSION = "${next}"`);
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
    `window.__EXPORTUNITY_CONFIG__.app = "${sanitizeId(APP_NAME)}";`,
    `window.__EXPORTUNITY_CONFIG__.buildId = "${build.buildId}";`,
    `window.__BUILD_ID__ = "${build.buildId}";`,
    `window.__EXPORTUNITY_CONFIG__.builtAt = "${build.builtAt}";`,
    `window.__EXPORTUNITY_CONFIG__.gitSha = "${build.gitSha}";`,
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

function writeBuildJson(publicDir, build) {
  const indexPath = path.join(publicDir, "index.html");
  const indexHtml = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, "utf8") : "";
  const mainJs = parseAssetPath(indexHtml, "js");
  const mainCss = parseAssetPath(indexHtml, "css");

  const swPath = path.join(publicDir, "sw.js");
  const swText = fs.existsSync(swPath) ? fs.readFileSync(swPath, "utf8") : "";
  const swVersionMatch = swText.match(/const\s+VERSION\s*=\s*["']([^"']+)["']/);

  const payload = {
    app: sanitizeId(APP_NAME),
    build: build.buildId,
    buildId: build.buildId,
    gitSha: build.gitSha,
    builtAt: build.builtAt,
    // Backward-compatible aliases (older diagnostics pages used buildTime).
    buildTime: build.builtAt,
    mainJs: statOrNull(publicDir, mainJs),
    mainCss: statOrNull(publicDir, mainCss),
    sw: swVersionMatch?.[1] ?? null,
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
  updateSwVersion(path.join(DIST_PUBLIC, "sw.js"), build.buildId);
  updateConfig(path.join(DIST_PUBLIC, "config.js"), build);
  const stamped = writeBuildJson(DIST_PUBLIC, build);

  console.log("[stamp-build] Stamped build:", stamped);
}

main();
