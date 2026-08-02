import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

export const INDUSTRIAL_REQUIREMENT_ATTACHMENT_MAX_FILES = 5;
export const INDUSTRIAL_REQUIREMENT_ATTACHMENT_MAX_BYTES = 15 * 1024 * 1024;
export const INDUSTRIAL_REQUIREMENT_ATTACHMENT_UPLOAD_TTL_MS = 30 * 60 * 1000;

type AttachmentDefinition = {
  extension: string;
  mimeTypes: string[];
  canonicalMimeType: string;
  requiresSignature?: "pdf" | "jpeg" | "png" | "webp";
};

const ATTACHMENT_DEFINITIONS: AttachmentDefinition[] = [
  { extension: ".pdf", mimeTypes: ["application/pdf"], canonicalMimeType: "application/pdf", requiresSignature: "pdf" },
  { extension: ".jpg", mimeTypes: ["image/jpeg"], canonicalMimeType: "image/jpeg", requiresSignature: "jpeg" },
  { extension: ".jpeg", mimeTypes: ["image/jpeg"], canonicalMimeType: "image/jpeg", requiresSignature: "jpeg" },
  { extension: ".png", mimeTypes: ["image/png"], canonicalMimeType: "image/png", requiresSignature: "png" },
  { extension: ".webp", mimeTypes: ["image/webp"], canonicalMimeType: "image/webp", requiresSignature: "webp" },
  { extension: ".txt", mimeTypes: ["text/plain"], canonicalMimeType: "text/plain" },
  { extension: ".csv", mimeTypes: ["text/csv", "application/csv"], canonicalMimeType: "text/csv" },
  {
    extension: ".docx",
    mimeTypes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
    canonicalMimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  {
    extension: ".xlsx",
    mimeTypes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
    canonicalMimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
  {
    extension: ".dxf",
    mimeTypes: ["application/dxf", "application/x-dxf", "image/vnd.dxf", "text/plain"],
    canonicalMimeType: "application/dxf",
  },
  {
    extension: ".dwg",
    mimeTypes: ["application/acad", "application/x-acad", "application/x-autocad", "image/vnd.dwg"],
    canonicalMimeType: "application/acad",
  },
  { extension: ".step", mimeTypes: ["application/step", "model/step"], canonicalMimeType: "application/step" },
  { extension: ".stp", mimeTypes: ["application/step", "model/step"], canonicalMimeType: "application/step" },
  { extension: ".stl", mimeTypes: ["model/stl", "application/sla", "application/vnd.ms-pki.stl"], canonicalMimeType: "model/stl" },
  { extension: ".iges", mimeTypes: ["model/iges", "application/iges"], canonicalMimeType: "model/iges" },
  { extension: ".igs", mimeTypes: ["model/iges", "application/iges"], canonicalMimeType: "model/iges" },
];

const GENERIC_BINARY_MIME_TYPES = new Set(["", "application/octet-stream", "binary/octet-stream"]);

function normalizedMimeType(value: unknown) {
  return String(value || "").trim().toLowerCase().split(";", 1)[0] || "application/octet-stream";
}

function sanitizedOriginalName(value: unknown) {
  const candidate = path.basename(String(value || "technical-document"))
    .replace(/[\u0000-\u001f\u007f]/g, "_")
    .replace(/[\\/:*?"<>|]+/g, "_")
    .trim();
  return (candidate || "technical-document").slice(0, 180);
}

function attachmentDefinitionForName(fileName: string) {
  const extension = path.extname(fileName).toLowerCase();
  return ATTACHMENT_DEFINITIONS.find((entry) => entry.extension === extension) || null;
}

function signatureMatches(kind: AttachmentDefinition["requiresSignature"], buffer: Buffer) {
  if (!kind) return true;
  if (kind === "pdf") return buffer.subarray(0, 5).toString("ascii") === "%PDF-";
  if (kind === "jpeg") return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (kind === "png") return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP";
}

export type ValidIndustrialRequirementAttachment = {
  fileName: string;
  extension: string;
  mimeType: string;
  sizeBytes: number;
};

export function validateIndustrialRequirementAttachment(file: Express.Multer.File):
  | { ok: true; attachment: ValidIndustrialRequirementAttachment }
  | { ok: false; message: string } {
  const fileName = sanitizedOriginalName(file.originalname);
  const definition = attachmentDefinitionForName(fileName);
  if (!definition) {
    return { ok: false, message: "Unsupported technical document type. Use PDF, image, office, DXF, DWG, STEP, STL, or IGES files." };
  }

  const sizeBytes = Number(file.size || 0);
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return { ok: false, message: "The technical document is empty." };
  }
  if (sizeBytes > INDUSTRIAL_REQUIREMENT_ATTACHMENT_MAX_BYTES) {
    return { ok: false, message: "Each technical document must be 15 MB or smaller." };
  }

  const mimeType = normalizedMimeType(file.mimetype);
  if (!GENERIC_BINARY_MIME_TYPES.has(mimeType) && !definition.mimeTypes.includes(mimeType)) {
    return { ok: false, message: "The selected file type does not match its filename extension." };
  }
  if (!signatureMatches(definition.requiresSignature, file.buffer)) {
    return { ok: false, message: "The selected file could not be validated as the stated document type." };
  }

  return {
    ok: true,
    attachment: {
      fileName,
      extension: definition.extension,
      mimeType: definition.canonicalMimeType,
      sizeBytes: Math.trunc(sizeBytes),
    },
  };
}

function privateAttachmentRoot() {
  const configured = String(process.env.INDUSTRIAL_DOCUMENTS_PATH || "").trim();
  const uploadRoot = String(process.env.UPLOAD_DIR || "/data/uploads").trim() || "/data/uploads";
  return path.resolve(configured || path.join(uploadRoot, "industrial-requirements"));
}

function storageKeyFor(tenantId: number, requirementId: string, fileName: string, file: Express.Multer.File) {
  const hash = crypto.createHash("sha256").update(file.buffer).digest("hex");
  const extension = path.extname(fileName).toLowerCase();
  return `${tenantId}/${requirementId}/${hash}${extension}`;
}

function absolutePathForStorageKey(storageKey: string) {
  if (!/^\d+\/[0-9a-f-]{36}\/[a-f0-9]{64}\.[a-z0-9]{2,5}$/i.test(storageKey)) {
    throw new Error("Invalid private industrial attachment storage key.");
  }
  const root = privateAttachmentRoot();
  const absolutePath = path.resolve(root, storageKey);
  if (!absolutePath.startsWith(`${root}${path.sep}`)) {
    throw new Error("Invalid private industrial attachment path.");
  }
  return absolutePath;
}

export async function persistIndustrialRequirementAttachment(input: {
  tenantId: number;
  requirementId: string;
  file: Express.Multer.File;
  attachment: ValidIndustrialRequirementAttachment;
}) {
  const storageKey = storageKeyFor(input.tenantId, input.requirementId, input.attachment.fileName, input.file);
  const absolutePath = absolutePathForStorageKey(storageKey);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true, mode: 0o700 });
  await fs.writeFile(absolutePath, input.file.buffer, { mode: 0o600 });
  return { storageKey, absolutePath };
}

export async function resolveIndustrialRequirementAttachment(storageKey: string) {
  const absolutePath = absolutePathForStorageKey(storageKey);
  const stats = await fs.stat(absolutePath);
  if (!stats.isFile()) throw new Error("Private industrial attachment is unavailable.");
  return { absolutePath, sizeBytes: stats.size };
}

export function createIndustrialRequirementAttachmentUploadToken() {
  const token = crypto.randomBytes(32).toString("base64url");
  return { token, tokenHash: hashIndustrialRequirementAttachmentUploadToken(token) };
}

export function hashIndustrialRequirementAttachmentUploadToken(token: string) {
  return crypto.createHash("sha256").update(String(token || "")).digest("hex");
}

export function matchesIndustrialRequirementAttachmentUploadToken(expectedHash: unknown, token: unknown) {
  const expected = String(expectedHash || "").trim();
  const actual = hashIndustrialRequirementAttachmentUploadToken(String(token || "").trim());
  if (!/^[a-f0-9]{64}$/i.test(expected)) return false;
  return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(actual, "hex"));
}

export function allowedIndustrialRequirementAttachmentExtensions() {
  return ATTACHMENT_DEFINITIONS.map((entry) => entry.extension);
}
