import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

import type { ValidIndustrialRequirementAttachment } from "./requirementAttachments";

function privatePartRecordDocumentRoot() {
  const configured = String(
    process.env.INDUSTRIAL_PART_RECORD_DOCUMENTS_PATH || "",
  ).trim();
  const uploadRoot =
    String(process.env.UPLOAD_DIR || "/data/uploads").trim() ||
    "/data/uploads";
  return path.resolve(configured || path.join(uploadRoot, "industrial-part-records"));
}

function storageKeyFor(
  tenantId: number,
  partRecordId: string,
  fileName: string,
  file: Express.Multer.File,
) {
  const hash = crypto.createHash("sha256").update(file.buffer).digest("hex");
  const extension = path.extname(fileName).toLowerCase();
  return `${tenantId}/${partRecordId}/${hash}${extension}`;
}

function absolutePathForStorageKey(storageKey: string) {
  if (!/^\d+\/[0-9a-f-]{36}\/[a-f0-9]{64}\.[a-z0-9]{2,5}$/i.test(storageKey)) {
    throw new Error("Invalid private industrial part-document storage key.");
  }
  const root = privatePartRecordDocumentRoot();
  const absolutePath = path.resolve(root, storageKey);
  if (!absolutePath.startsWith(`${root}${path.sep}`)) {
    throw new Error("Invalid private industrial part-document path.");
  }
  return absolutePath;
}

export async function persistIndustrialPartRecordDocument(input: {
  tenantId: number;
  partRecordId: string;
  file: Express.Multer.File;
  attachment: ValidIndustrialRequirementAttachment;
}) {
  const storageKey = storageKeyFor(
    input.tenantId,
    input.partRecordId,
    input.attachment.fileName,
    input.file,
  );
  const absolutePath = absolutePathForStorageKey(storageKey);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true, mode: 0o700 });
  await fs.writeFile(absolutePath, input.file.buffer, { mode: 0o600 });
  return { storageKey, absolutePath };
}

export async function resolveIndustrialPartRecordDocument(storageKey: string) {
  const absolutePath = absolutePathForStorageKey(storageKey);
  const stats = await fs.stat(absolutePath);
  if (!stats.isFile()) throw new Error("Private industrial part document is unavailable.");
  return { absolutePath, sizeBytes: stats.size };
}
