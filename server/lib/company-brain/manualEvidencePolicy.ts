import path from "node:path";

const SUPPORTED_EXTENSIONS = new Set([
  ".csv",
  ".docx",
  ".gif",
  ".jpeg",
  ".jpg",
  ".json",
  ".log",
  ".markdown",
  ".md",
  ".pdf",
  ".png",
  ".pptx",
  ".sql",
  ".tif",
  ".tiff",
  ".tsv",
  ".txt",
  ".webp",
  ".xls",
  ".xlsx",
  ".xml",
  ".yaml",
  ".yml",
]);

export const MANUAL_EVIDENCE_RELEVANCE = new Set([
  "company_history",
  "commercial",
  "financial",
  "governance",
  "legal",
  "operations",
  "other",
  "partnership",
  "product",
  "project",
]);

export const MANUAL_EVIDENCE_CONFIDENTIALITY = new Set(["internal", "confidential", "restricted"]);

function extensionOf(filename: string) {
  return path.extname(String(filename || "")).toLowerCase();
}

function sourceTypeForExtension(extension: string) {
  if ([".png", ".jpg", ".jpeg", ".webp", ".gif", ".tif", ".tiff"].includes(extension)) return "image";
  if ([".xls", ".xlsx", ".csv", ".tsv"].includes(extension)) return "spreadsheet";
  if (extension === ".pptx") return "presentation";
  if ([".json", ".xml", ".yaml", ".yml", ".sql", ".log"].includes(extension)) return "data_file";
  return "document";
}

export function mimeTypeForManualEvidenceExtension(extension: string) {
  const normalized = String(extension || "").toLowerCase();
  if (normalized === ".pdf") return "application/pdf";
  if (normalized === ".docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (normalized === ".xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (normalized === ".xls") return "application/vnd.ms-excel";
  if (normalized === ".pptx") return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  if (normalized === ".png") return "image/png";
  if ([".jpg", ".jpeg"].includes(normalized)) return "image/jpeg";
  if (normalized === ".webp") return "image/webp";
  if (normalized === ".gif") return "image/gif";
  if ([".tif", ".tiff"].includes(normalized)) return "image/tiff";
  if ([".csv", ".tsv", ".txt", ".md", ".markdown", ".json", ".xml", ".yaml", ".yml", ".sql", ".log"].includes(normalized)) {
    return "text/plain; charset=utf-8";
  }
  return "application/octet-stream";
}

export function validateManualEvidenceFile(file: Pick<Express.Multer.File, "originalname" | "size" | "buffer">) {
  const extension = extensionOf(file.originalname);
  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    const error = new Error(
      "Unsupported evidence file. Use PDF, DOCX, XLS/XLSX, PPTX, text, CSV, JSON, or a standard image format.",
    );
    (error as any).status = 400;
    throw error;
  }
  if (!file.buffer?.length || Number(file.size || file.buffer.length) <= 0) {
    const error = new Error("The evidence file is empty.");
    (error as any).status = 400;
    throw error;
  }
  return { extension, sourceType: sourceTypeForExtension(extension) };
}
