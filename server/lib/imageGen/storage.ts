import fs from "fs";
import path from "path";

const assetRoot = process.env.ASSET_BASE_PATH || process.env.ASSET_ROOT || "/data/assets";

function ensureDir(p: string) {
  if (!fs.existsSync(p)) {
    fs.mkdirSync(p, { recursive: true });
  }
}

function normalizeVariant(value: string | null | undefined) {
  const v = String(value ?? "").trim();
  return v || "default";
}

function toStorageKey(assetKey: string, variant: string) {
  const safeKey = assetKey.replace(/[^a-zA-Z0-9/_-]/g, "-");
  const v = normalizeVariant(variant);
  if (v === "default") return safeKey;
  const safeVariant = v.replace(/[^a-zA-Z0-9/_-]/g, "-");
  return `${safeKey}__${safeVariant}`;
}

export function getAssetPath(namespace: string, assetKey: string, filename: string, variant?: string) {
  const safeNamespace = namespace.replace(/[^a-zA-Z0-9/_-]/g, "-");
  const safeKey = toStorageKey(assetKey, normalizeVariant(variant));
  return path.join(assetRoot, safeNamespace, safeKey, filename);
}

export function getAssetUrl(namespace: string, assetKey: string, filename: string, variant?: string) {
  const base = process.env.ASSET_PUBLIC_PATH || "/assets";
  const safeNamespace = namespace.replace(/[^a-zA-Z0-9/_-]/g, "-");
  const safeKey = toStorageKey(assetKey, normalizeVariant(variant));
  return `${base}/${safeNamespace}/${safeKey}/${filename}`;
}

export async function saveImageBuffer(namespace: string, assetKey: string, filename: string, buffer: Buffer, variant?: string) {
  const targetDir = path.dirname(getAssetPath(namespace, assetKey, filename, variant));
  ensureDir(targetDir);
  await fs.promises.writeFile(getAssetPath(namespace, assetKey, filename, variant), buffer);
  return getAssetUrl(namespace, assetKey, filename, variant);
}

export function fileExists(namespace: string, assetKey: string, filename: string, variant?: string) {
  return fs.existsSync(getAssetPath(namespace, assetKey, filename, variant));
}

export function copyLocalFile(sourcePath: string, namespace: string, assetKey: string, filename: string, variant?: string) {
  const targetPath = getAssetPath(namespace, assetKey, filename, variant);
  const targetDir = path.dirname(targetPath);
  ensureDir(targetDir);
  fs.copyFileSync(sourcePath, targetPath);
  return getAssetUrl(namespace, assetKey, filename, variant);
}
