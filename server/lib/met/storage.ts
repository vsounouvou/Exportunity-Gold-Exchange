import fs from "node:fs/promises";
import path from "node:path";

export type StoredFile = {
  absolutePath: string;
  relativePath: string;
  mimeType: string;
  sizeBytes: number;
  originalName: string;
};

export type StorageSaveInput = {
  tenantKey: string;
  scope: string;
  entityId: string;
  file: Express.Multer.File;
};

export type StorageGetResult = {
  absolutePath: string;
  relativePath: string;
};

export interface StorageProvider {
  save(input: StorageSaveInput): Promise<StoredFile>;
  get(relativePath: string): Promise<StorageGetResult>;
  delete(relativePath: string): Promise<void>;
}

function normalizeTenantKey(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "") || "tenant";
}

function getUploadRoot() {
  const configured = String(process.env.UPLOAD_DIR || "").trim();
  if (configured) return configured;
  return path.join(process.cwd(), "uploads");
}

function sanitizeSegment(value: unknown, fallback: string) {
  const raw = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return raw || fallback;
}

function sanitizeName(fileName: string) {
  const raw = String(fileName || "").trim();
  const base = path.basename(raw || "file");
  const cleaned = base.replace(/[^\w.\-]+/g, "_");
  return cleaned || "file";
}

function assertUploadPath(relativePath: string, rootPath: string) {
  const root = path.resolve(rootPath);
  const abs = path.resolve(root, relativePath);
  if (!abs.startsWith(root)) throw new Error("Invalid upload path");
  return abs;
}

class LocalStorageProvider implements StorageProvider {
  private readonly root: string;

  constructor(rootPath?: string) {
    this.root = rootPath ? path.resolve(rootPath) : path.resolve(getUploadRoot());
  }

  async save(input: StorageSaveInput): Promise<StoredFile> {
    const tenantKey = normalizeTenantKey(input.tenantKey);
    const scope = sanitizeSegment(input.scope, "files");
    const entityId = sanitizeSegment(input.entityId, "entity");
    const safeName = sanitizeName(input.file.originalname);
    const dir = path.join(this.root, tenantKey, scope, entityId);
    const absolutePath = path.join(dir, safeName);

    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(absolutePath, input.file.buffer);

    const relativePath = path.join(tenantKey, scope, entityId, safeName).replace(/\\/g, "/");
    return {
      absolutePath,
      relativePath,
      mimeType: String(input.file.mimetype || "application/octet-stream"),
      sizeBytes: Number(input.file.size || 0),
      originalName: safeName,
    };
  }

  async get(relativePath: string): Promise<StorageGetResult> {
    const absolutePath = assertUploadPath(relativePath, this.root);
    await fs.access(absolutePath);
    return {
      absolutePath,
      relativePath: relativePath.replace(/\\/g, "/"),
    };
  }

  async delete(relativePath: string): Promise<void> {
    const absolutePath = assertUploadPath(relativePath, this.root);
    await fs.rm(absolutePath, { force: true });
  }
}

const localProvider = new LocalStorageProvider();

export function getMetStorageProvider(): StorageProvider {
  const configured = String(process.env.MET_STORAGE_PROVIDER || "local").trim().toLowerCase();
  if (configured === "local") return localProvider;
  throw new Error(`Unsupported MET storage provider: ${configured}`);
}

export function resolveUploadPath(relativePath: string) {
  return assertUploadPath(relativePath, getUploadRoot());
}

export async function saveEstimateRequestFile(input: {
  tenantKey: string;
  estimateRequestId: string;
  file: Express.Multer.File;
}) {
  return getMetStorageProvider().save({
    tenantKey: input.tenantKey,
    scope: "estimate-requests",
    entityId: input.estimateRequestId,
    file: input.file,
  });
}

export async function getStoredFile(relativePath: string) {
  return getMetStorageProvider().get(relativePath);
}

export async function deleteStoredFile(relativePath: string) {
  await getMetStorageProvider().delete(relativePath);
}
