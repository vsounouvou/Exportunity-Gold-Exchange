import fs from "fs";
import path from "path";

type BuildInfo = {
  id: string;
  builtAt: string;
  gitSha: string;
};

type BuildMetaFile = {
  buildId?: string;
  gitSha?: string;
};

const APP_NAME =
  process.env.APP_NAME ||
  process.env.APP ||
  process.env.DEPLOY_TENANT ||
  process.env.TENANT_DEFAULT ||
  "";

function readBuildMetaFile(repoRoot: string): BuildMetaFile | null {
  try {
    const metaPath = path.join(repoRoot, ".build-meta.json");
    if (!fs.existsSync(metaPath)) return null;
    const raw = fs.readFileSync(metaPath, "utf8");
    const parsed = JSON.parse(raw.replace(/^\uFEFF/, "")) as any;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      buildId: typeof parsed.buildId === "string" ? parsed.buildId : undefined,
      gitSha: typeof parsed.gitSha === "string" ? parsed.gitSha : undefined,
    };
  } catch {
    return null;
  }
}

function readGitSha(repoRoot: string): string | null {
  const envSha =
    process.env.GIT_SHA ||
    process.env.RENDER_GIT_COMMIT ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.COMMIT_SHA ||
    null;
  if (envSha) return String(envSha).trim();

  try {
    const headPath = path.join(repoRoot, ".git", "HEAD");
    const head = fs.readFileSync(headPath, "utf8").trim();
    if (head.startsWith("ref:")) {
      const ref = head.replace(/^ref:\s+/, "").trim();
      const refPath = path.join(repoRoot, ".git", ref);
      const sha = fs.readFileSync(refPath, "utf8").trim();
      return sha ? sha.slice(0, 12) : null;
    }
    return head ? head.slice(0, 12) : null;
  } catch {
    return null;
  }
}

function sanitizeId(value: string) {
  return String(value).replace(/[^A-Za-z0-9._-]+/g, "-");
}

function resolveServiceWorkerTenant(appName: string) {
  const normalized = sanitizeId(appName || "platform").toLowerCase() || "platform";
  return normalized === "boursedelor" ? "bdo" : normalized;
}

function normalizeGitSha(raw: unknown): string | null {
  if (raw == null) return null;
  const value = String(raw).trim();
  if (!value) return null;
  if (!/^[0-9a-f]{7,40}$/i.test(value)) return null;
  return value.slice(0, 12);
}

function resolveBuildInfo(repoRoot: string): BuildInfo {
  const builtAt = new Date().toISOString();
  const meta = readBuildMetaFile(repoRoot);

  const gitSha =
    sanitizeId(
      normalizeGitSha(process.env.GIT_SHA) ||
        normalizeGitSha(meta?.gitSha) ||
        normalizeGitSha(readGitSha(repoRoot)) ||
        "",
    ) || "unknown";

  // Prefer an explicit build id (CI/env/meta). Fall back to a ms timestamp.
  const envBuild =
    process.env.BUILD_ID ||
    process.env.DEPLOYMENT_ID ||
    process.env.RENDER_INSTANCE_ID ||
    meta?.buildId ||
    null;

  const id = sanitizeId(envBuild ? String(envBuild) : String(Date.now()));
  return { id, builtAt, gitSha };
}

function updateSwVersion(swPath: string, buildId: string, appName: string) {
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

function updateConfig(configPath: string, build: BuildInfo) {
  let content = "";
  if (fs.existsSync(configPath)) {
    content = fs.readFileSync(configPath, "utf8");
  } else {
    content = "window.__EXPORTUNITY_CONFIG__ = window.__EXPORTUNITY_CONFIG__ || {};\n";
  }

  const block = [
    "",
    "window.__EXPORTUNITY_CONFIG__ = window.__EXPORTUNITY_CONFIG__ || {};",
    `window.__EXPORTUNITY_CONFIG__.buildId = "${build.id}";`,
    `window.__EXPORTUNITY_CONFIG__.builtAt = "${build.builtAt}";`,
    `window.__EXPORTUNITY_CONFIG__.gitSha = "${build.gitSha}";`,
    "",
  ].join("\n");

  // Always append; config.js is tiny and this makes deployments deterministic.
  content = `${content.trim()}\n${block}`;
  fs.writeFileSync(configPath, content, "utf8");
}

function parseAssetPath(html: string, ext: "js" | "css") {
  const re = new RegExp(`(?:\\.\\/|\\/)?assets\\/[^"']+\\.${ext}`, "i");
  const match = html.match(re);
  if (!match) return null;
  return match[0].replace(/^\//, "").replace(/^\.\//, "");
}

function statOrNull(publicDir: string, relPath: string | null) {
  if (!relPath) return null;
  const full = path.join(publicDir, relPath);
  if (!fs.existsSync(full)) return { path: relPath, size: null, mtime: null };
  const stat = fs.statSync(full);
  return { path: relPath, size: stat.size, mtime: stat.mtime.toISOString() };
}

function writeBuildJson(publicDir: string, build: BuildInfo) {
  const indexPath = path.join(publicDir, "index.html");
  const indexHtml = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, "utf8") : "";
  const mainJs = parseAssetPath(indexHtml, "js");
  const mainCss = parseAssetPath(indexHtml, "css");

  const swPath = path.join(publicDir, "sw.js");
  const swText = fs.existsSync(swPath) ? fs.readFileSync(swPath, "utf8") : "";
  const swVersionMatch = swText.match(/const\s+VERSION\s*=\s*["']([^"']+)["']/);
  const swBuildSuffixMatch = swText.match(/const\s+BUILD_SUFFIX\s*=\s*["']([^"']+)["']/);
  const swAppPrefix = resolveServiceWorkerTenant(APP_NAME);

  const payload = {
    buildId: build.id,
    gitSha: build.gitSha,
    builtAt: build.builtAt,
    // Backward-compatible aliases (older diagnostics pages used buildTime).
    buildTime: build.builtAt,
    mainJs: statOrNull(publicDir, mainJs),
    mainCss: statOrNull(publicDir, mainCss),
    sw: swVersionMatch?.[1] ?? (swBuildSuffixMatch ? `${swAppPrefix}-sw-v1-build-${swBuildSuffixMatch[1]}` : null),
  };

  fs.writeFileSync(path.join(publicDir, "build.json"), JSON.stringify(payload, null, 2), "utf8");
}

function main() {
  const repoRoot = process.cwd();
  const publicDir = path.join(repoRoot, "dist", "public");
  if (!fs.existsSync(publicDir)) {
    console.error(`[update-build-info] dist/public not found at ${publicDir}`);
    process.exit(1);
  }

  const build = resolveBuildInfo(repoRoot);
  updateSwVersion(path.join(publicDir, "sw.js"), build.id, APP_NAME);
  updateConfig(path.join(publicDir, "config.js"), build);
  writeBuildJson(publicDir, build);

  console.log(`[update-build-info] buildId=${build.id} gitSha=${build.gitSha} builtAt=${build.builtAt}`);
}

main();
