import fs from "fs";
import path from "path";

export type BuildMeta = {
  ok: boolean;
  gitSha: string | null;
  buildId: string | null;
  builtAt: string | null;
  source: string;
  error?: string;
};

function normalizeGitSha(raw: unknown): string | null {
  if (raw == null) return null;
  const value = String(raw).trim();
  if (!value) return null;
  if (/^[0-9a-f]{7,40}$/i.test(value)) return value.slice(0, 12);
  return null;
}

function normalizeBuildId(raw: unknown): string | null {
  if (raw == null) return null;
  const value = String(raw).trim();
  return value ? value : null;
}

export function readBuildMeta(): BuildMeta {
  const envGitSha =
    normalizeGitSha(process.env.GIT_SHA) ||
    normalizeGitSha(process.env.RENDER_GIT_COMMIT) ||
    normalizeGitSha(process.env.VERCEL_GIT_COMMIT_SHA) ||
    normalizeGitSha(process.env.COMMIT_SHA) ||
    null;

  const envBuildId =
    normalizeBuildId(process.env.BUILD_ID) ||
    normalizeBuildId(process.env.DEPLOYMENT_ID) ||
    normalizeBuildId(process.env.RENDER_INSTANCE_ID) ||
    null;

  const metaPath = path.join(process.cwd(), ".build-meta.json");
  try {
    if (fs.existsSync(metaPath)) {
      const stat = fs.statSync(metaPath);
      const raw = fs.readFileSync(metaPath, "utf8");
      const parsed = JSON.parse(raw) as any;
      const gitSha = normalizeGitSha(parsed?.gitSha) || envGitSha;
      const buildId = normalizeBuildId(parsed?.buildId) || envBuildId;
      return {
        ok: true,
        gitSha,
        buildId,
        builtAt: stat?.mtime ? new Date(stat.mtime).toISOString() : null,
        source: ".build-meta.json",
      };
    }
  } catch (err: any) {
    return {
      ok: false,
      gitSha: envGitSha,
      buildId: envBuildId,
      builtAt: null,
      source: ".build-meta.json",
      error: String(err?.message || "failed_to_read_build_meta"),
    };
  }

  return {
    ok: Boolean(envGitSha || envBuildId),
    gitSha: envGitSha,
    buildId: envBuildId,
    builtAt: null,
    source: "env",
  };
}

