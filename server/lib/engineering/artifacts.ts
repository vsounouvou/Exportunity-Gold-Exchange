import fs from "fs/promises";
import path from "path";

export async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

async function canWriteDir(dir: string) {
  try {
    await ensureDir(dir);
    const probe = path.join(dir, ".write-probe");
    await fs.writeFile(probe, "ok", "utf8");
    await fs.unlink(probe);
    return true;
  } catch {
    return false;
  }
}

export async function pickArtifactsRoot() {
  const candidates: string[] = [];
  const configured = String(process.env.ENGINEERING_ARTIFACTS_ROOT || "").trim();
  if (configured) candidates.push(configured);

  const assetRoot = String(process.env.ASSET_BASE_PATH || process.env.ASSET_ROOT || "").trim();
  if (assetRoot) candidates.push(path.join(assetRoot, "engineering"));

  candidates.push(path.resolve(process.cwd(), "tmp", "engineering-artifacts"));

  for (const candidate of candidates) {
    if (await canWriteDir(candidate)) return candidate;
  }

  return path.resolve(process.cwd(), "tmp", "engineering-artifacts");
}

export function getRevisionArtifactsDir(args: {
  rootDir: string;
  tenantId: number;
  machineId: number;
  revision: number;
}) {
  return path.join(args.rootDir, `tenant-${args.tenantId}`, `machine-${args.machineId}`, `rev-${args.revision}`);
}

export function safePathUnderRoot(rootDir: string, relativePath: string) {
  const rel = String(relativePath || "").trim();
  const resolved = path.resolve(rootDir, rel);
  const rootResolved = path.resolve(rootDir);
  const safe =
    resolved === rootResolved ||
    resolved.startsWith(rootResolved + path.sep) ||
    resolved.startsWith(rootResolved + "/");
  if (!safe) throw new Error("path_outside_root");
  return resolved;
}

