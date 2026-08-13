import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

function privateEvidenceRoot() {
  const configured = String(process.env.COMPANY_BRAIN_EVIDENCE_PATH || "").trim();
  const uploadRoot = String(process.env.UPLOAD_DIR || "/data/uploads").trim() || "/data/uploads";
  return path.resolve(configured || path.join(uploadRoot, "company-brain-evidence"));
}

function extensionOf(filename: string) {
  const extension = path.extname(String(filename || "")).toLowerCase();
  return /^\.[a-z0-9]{1,10}$/i.test(extension) ? extension : ".bin";
}

function storageKeyFor(tenantId: number, hash: string, filename: string) {
  return `${tenantId}/${hash}${extensionOf(filename)}`;
}

function absolutePathForStorageKey(storageKey: string) {
  if (!/^\d+\/[a-f0-9]{64}\.[a-z0-9]{1,10}$/i.test(storageKey)) {
    throw new Error("Invalid private Company Brain evidence storage key.");
  }
  const root = privateEvidenceRoot();
  const absolutePath = path.resolve(root, storageKey);
  if (!absolutePath.startsWith(`${root}${path.sep}`)) {
    throw new Error("Invalid private Company Brain evidence path.");
  }
  return absolutePath;
}

export async function persistPrivateCompanyBrainEvidence(input: {
  tenantId: number;
  file: Pick<Express.Multer.File, "buffer" | "originalname">;
}) {
  const hash = crypto.createHash("sha256").update(input.file.buffer).digest("hex");
  const storageKey = storageKeyFor(input.tenantId, hash, input.file.originalname);
  const absolutePath = absolutePathForStorageKey(storageKey);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true, mode: 0o700 });
  await fs.writeFile(absolutePath, input.file.buffer, { mode: 0o600 });
  return { storageKey, absolutePath, sha256: hash };
}

export async function resolvePrivateCompanyBrainEvidence(storageKey: string) {
  const absolutePath = absolutePathForStorageKey(storageKey);
  const stats = await fs.stat(absolutePath);
  if (!stats.isFile()) throw new Error("Private Company Brain evidence is unavailable.");
  return { absolutePath, sizeBytes: stats.size };
}
