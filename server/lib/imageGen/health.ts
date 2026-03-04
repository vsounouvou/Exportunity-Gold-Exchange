import fs from "fs";
import path from "path";

export type ImageGenStatusCode = "ok" | "storage_not_writable" | "missing_token";

export type ImageGenStatus = {
  status: ImageGenStatusCode;
  checkedAt: string;
  storage: {
    root: string;
    publicPath: string;
    ok: boolean;
    error?: string;
  };
  replicate: {
    tokenConfigured: boolean;
  };
};

let imageGenStatus: ImageGenStatus | null = null;

function safeErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function checkStorageWritable(assetRoot: string): { ok: boolean; error?: string } {
  try {
    fs.mkdirSync(assetRoot, { recursive: true });
    const healthDir = path.join(assetRoot, ".healthcheck");
    fs.mkdirSync(healthDir, { recursive: true });
    const testFile = path.join(healthDir, `tmp-${process.pid}-${Date.now()}.txt`);
    fs.writeFileSync(testFile, "ok", { encoding: "utf8" });
    const readBack = fs.readFileSync(testFile, { encoding: "utf8" });
    fs.unlinkSync(testFile);
    if (readBack !== "ok") return { ok: false, error: "Healthcheck read mismatch" };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: safeErrorMessage(err) };
  }
}

function isReplicateTokenConfigured(): boolean {
  const token = process.env.REPLICATE_API_TOKEN;
  return typeof token === "string" && token.trim().length > 0;
}

export function refreshImageGenStatus(opts?: { assetRoot?: string; publicPath?: string }): ImageGenStatus {
  const assetRoot = opts?.assetRoot || process.env.ASSET_BASE_PATH || process.env.ASSET_ROOT || "/data/assets";
  const publicPath = opts?.publicPath || process.env.ASSET_PUBLIC_PATH || "/assets";
  const storage = checkStorageWritable(assetRoot);
  const tokenConfigured = isReplicateTokenConfigured();

  const status: ImageGenStatusCode = !storage.ok ? "storage_not_writable" : !tokenConfigured ? "missing_token" : "ok";
  imageGenStatus = {
    status,
    checkedAt: new Date().toISOString(),
    storage: {
      root: assetRoot,
      publicPath,
      ok: storage.ok,
      ...(storage.error ? { error: storage.error } : {}),
    },
    replicate: {
      tokenConfigured,
    },
  };
  return imageGenStatus;
}

export function getImageGenStatus(): ImageGenStatus {
  if (!imageGenStatus) return refreshImageGenStatus();
  return imageGenStatus;
}

