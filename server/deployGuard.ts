import fs from "fs";
import path from "path";

type ClientBuild = {
  app?: string | null;
  buildId: string;
  gitSha: string;
  builtAt?: string | null;
  publicSurface?: string | null;
  publicSurfaceRevision?: number | null;
  homepageComponent?: string | null;
  homepageSourceSha256?: string | null;
  legacyHomepageRetired?: boolean;
};

const EXPORTUNITY_PUBLIC_SURFACE_REVISION = 6;
const EXPORTUNITY_HOMEPAGE_SOURCE_SHA256 =
  "7da9d4f50c91eefc2770d91aa71d92e8d08fb0ffa503fc30cc9224dfd05016f7";

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeGitSha(raw: unknown): string | null {
  if (raw == null) return null;
  const value = String(raw).trim();
  if (!value) return null;
  if (!/^[0-9a-f]{7,40}$/i.test(value)) return null;
  return value.slice(0, 12);
}

function resolveEnvBuildId(): string | null {
  const value =
    process.env.BUILD_ID ||
    process.env.DEPLOYMENT_ID ||
    process.env.RENDER_INSTANCE_ID ||
    null;
  return nonEmptyString(value) ? value.trim() : null;
}

function resolveEnvGitSha(): string | null {
  const value =
    process.env.GIT_SHA ||
    process.env.RENDER_GIT_COMMIT ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.COMMIT_SHA ||
    null;
  return normalizeGitSha(value);
}

export function requireClientBuild(publicDir: string): ClientBuild {
  const buildPath = path.join(publicDir, "build.json");

  if (!fs.existsSync(buildPath)) {
    console.error(`[DEPLOY-GUARD] Missing build.json in ${publicDir}`);
    process.exit(2);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(fs.readFileSync(buildPath, "utf8").replace(/^\uFEFF/, ""));
  } catch (err: any) {
    console.error(`[DEPLOY-GUARD] build.json is invalid JSON: ${err?.message || String(err)}`);
    process.exit(3);
  }

  const buildId = String(parsed?.buildId ?? "").trim();
  const gitSha = normalizeGitSha(parsed?.gitSha);
  const builtAt = nonEmptyString(parsed?.builtAt) ? String(parsed.builtAt).trim() : null;
  const app = nonEmptyString(parsed?.app) ? String(parsed.app).trim() : null;
  const publicSurface = nonEmptyString(parsed?.publicSurface)
    ? String(parsed.publicSurface).trim()
    : null;
  const publicSurfaceRevision = Number.isInteger(parsed?.publicSurfaceRevision)
    ? Number(parsed.publicSurfaceRevision)
    : null;
  const homepageComponent = nonEmptyString(parsed?.homepageComponent)
    ? String(parsed.homepageComponent).trim()
    : null;
  const homepageSourceSha256 = nonEmptyString(parsed?.homepageSourceSha256)
    ? String(parsed.homepageSourceSha256).trim().toLowerCase()
    : null;
  const legacyHomepageRetired = parsed?.legacyHomepageRetired === true;

  if (!buildId || !gitSha) {
    console.error("[DEPLOY-GUARD] build.json missing buildId/gitSha", parsed);
    process.exit(4);
  }

  const envBuildId = resolveEnvBuildId();
  if (envBuildId && envBuildId !== buildId) {
    console.error(`[DEPLOY-GUARD] BUILD_ID mismatch env=${envBuildId} build.json=${buildId}`);
    process.exit(5);
  }

  const envGitSha = resolveEnvGitSha();
  if (envGitSha && envGitSha !== gitSha) {
    console.error(`[DEPLOY-GUARD] GIT_SHA mismatch env=${envGitSha} build.json=${gitSha}`);
    process.exit(6);
  }

  if (
    app === "exportunity" &&
    (publicSurface !== "global-trade-network" ||
      publicSurfaceRevision !== EXPORTUNITY_PUBLIC_SURFACE_REVISION ||
      homepageComponent !== "MarketplacePage" ||
      homepageSourceSha256 !== EXPORTUNITY_HOMEPAGE_SOURCE_SHA256 ||
      !legacyHomepageRetired)
  ) {
    console.error("[DEPLOY-GUARD] Exportunity client does not match the exact approved public-surface lock", {
      publicSurface,
      publicSurfaceRevision,
      homepageComponent,
      homepageSourceSha256,
      legacyHomepageRetired,
    });
    process.exit(7);
  }

  return {
    app,
    buildId,
    gitSha,
    builtAt,
    publicSurface,
    publicSurfaceRevision,
    homepageComponent,
    homepageSourceSha256,
    legacyHomepageRetired,
  };
}

