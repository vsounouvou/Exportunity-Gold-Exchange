import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

import type { ValidIndustrialRequirementAttachment } from "./requirementAttachments";

export const INDUSTRIAL_FACTORY_DOCUMENT_TYPES = [
  "registration",
  "operating_permit",
  "quality_certificate",
  "technical_specification",
  "maintenance_record",
  "export_document",
  "other",
] as const;

export type IndustrialFactoryDocumentType =
  (typeof INDUSTRIAL_FACTORY_DOCUMENT_TYPES)[number];

export type FactoryDocumentGap = {
  documentType: IndustrialFactoryDocumentType;
  reason: "verification" | "export" | "certification";
};

export function isIndustrialFactoryDocumentType(
  value: unknown,
): value is IndustrialFactoryDocumentType {
  return (INDUSTRIAL_FACTORY_DOCUMENT_TYPES as readonly string[]).includes(
    String(value || "").trim(),
  );
}

export function buildIndustrialFactoryDocumentGaps(input: {
  verificationStatus?: string | null;
  exportMarkets?: unknown;
  publicCertifications?: unknown;
  documentTypes?: unknown;
}): FactoryDocumentGap[] {
  const documentTypes = new Set(
    Array.isArray(input.documentTypes)
      ? input.documentTypes
          .filter((value): value is string => typeof value === "string")
          .map((value) => value.trim())
      : [],
  );
  const exportMarkets = Array.isArray(input.exportMarkets)
    ? input.exportMarkets.filter(
        (value): value is string =>
          typeof value === "string" && Boolean(value.trim()),
      )
    : [];
  const publicCertifications = Array.isArray(input.publicCertifications)
    ? input.publicCertifications.filter(
        (value): value is string =>
          typeof value === "string" && Boolean(value.trim()),
      )
    : [];
  const gaps: FactoryDocumentGap[] = [];

  if (
    ["submitted", "under_review", "verified"].includes(
      String(input.verificationStatus || "").trim(),
    ) &&
    !documentTypes.has("registration")
  ) {
    gaps.push({ documentType: "registration", reason: "verification" });
  }
  if (exportMarkets.length > 0 && !documentTypes.has("export_document")) {
    gaps.push({ documentType: "export_document", reason: "export" });
  }
  if (
    publicCertifications.length > 0 &&
    !documentTypes.has("quality_certificate")
  ) {
    gaps.push({ documentType: "quality_certificate", reason: "certification" });
  }

  return gaps;
}

function privateFactoryDocumentRoot() {
  const configured = String(
    process.env.INDUSTRIAL_FACTORY_DOCUMENTS_PATH || "",
  ).trim();
  const uploadRoot =
    String(process.env.UPLOAD_DIR || "/data/uploads").trim() ||
    "/data/uploads";
  return path.resolve(
    configured || path.join(uploadRoot, "industrial-factory-documents"),
  );
}

function storageKeyFor(
  tenantId: number,
  factoryId: string,
  fileName: string,
  file: Express.Multer.File,
) {
  const hash = crypto.createHash("sha256").update(file.buffer).digest("hex");
  const extension = path.extname(fileName).toLowerCase();
  return `${tenantId}/${factoryId}/${hash}${extension}`;
}

function absolutePathForStorageKey(storageKey: string) {
  if (!/^\d+\/[0-9a-f-]{36}\/[a-f0-9]{64}\.[a-z0-9]{2,5}$/i.test(storageKey)) {
    throw new Error("Invalid private factory document storage key.");
  }
  const root = privateFactoryDocumentRoot();
  const absolutePath = path.resolve(root, storageKey);
  if (!absolutePath.startsWith(`${root}${path.sep}`)) {
    throw new Error("Invalid private factory document path.");
  }
  return absolutePath;
}

export async function persistIndustrialFactoryDocument(input: {
  tenantId: number;
  factoryId: string;
  file: Express.Multer.File;
  attachment: ValidIndustrialRequirementAttachment;
}) {
  const storageKey = storageKeyFor(
    input.tenantId,
    input.factoryId,
    input.attachment.fileName,
    input.file,
  );
  const absolutePath = absolutePathForStorageKey(storageKey);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true, mode: 0o700 });
  await fs.writeFile(absolutePath, input.file.buffer, { mode: 0o600 });
  return { storageKey, absolutePath };
}

export async function resolveIndustrialFactoryDocument(storageKey: string) {
  const absolutePath = absolutePathForStorageKey(storageKey);
  const stats = await fs.stat(absolutePath);
  if (!stats.isFile()) throw new Error("Private factory document is unavailable.");
  return { absolutePath, sizeBytes: stats.size };
}
